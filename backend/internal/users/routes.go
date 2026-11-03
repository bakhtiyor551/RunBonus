// Package users — авторизация и профиль (этап 3).
package users

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"

	"runbonus/api/internal/auth"
	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/shoes"
)

const deviceChangedMsg = "Аккаунт привязан к этому телефону. Другие устройства отключены."

func Register(r chi.Router) {
	r.Route("/api/auth", func(r chi.Router) {
		r.Get("/sms/status", func(w http.ResponseWriter, _ *http.Request) {
			httpx.OK(w, httpx.M{"enabled": smsEnabledJSON()})
		})
		r.Post("/sms/send", httpx.H("Не удалось отправить SMS", smsSend))
		r.Post("/sms/register", httpx.H("Ошибка регистрации", smsRegister))
		r.Post("/sms/login", httpx.H("Ошибка входа", smsLogin))
		r.Post("/register", httpx.H("Ошибка регистрации", register))
		r.Post("/login", httpx.H("Ошибка входа", login))
		r.With(auth.User).Get("/me", httpx.H("Ошибка сервера", me))
		r.With(auth.UserToken).Post("/logout", httpx.H("Ошибка выхода", logout))
		r.With(auth.User).Patch("/profile", httpx.H("Не удалось сохранить профиль", updateProfile))
	})

	r.With(auth.User).Get("/api/user/summary", func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, 410, httpx.M{"error": "Сводка с заработком отключена. Используйте /api/rewards/progress", "code": "SUMMARY_DEPRECATED"})
	})

	gone := func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, 410, httpx.M{"error": "Денежный кошелёк отключён. Используйте систему наград: /api/rewards/*", "code": "WALLET_DEPRECATED"})
	}
	r.Route("/api/bonus", func(r chi.Router) {
		r.Use(auth.User)
		r.Get("/balance", gone)
		r.Get("/wallet-summary", gone)
		r.Get("/history", gone)
		r.Post("/withdraw", gone)
	})
}

func randomPasswordHash() (string, error) {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	h, err := bcrypt.GenerateFromPassword([]byte(hex.EncodeToString(b)), 10)
	return string(h), err
}

// createPhoneUser — минимальная регистрация: только телефон, имя/город — на следующем экране.
func createPhoneUser(ctx context.Context, tx *sql.Tx, phone, deviceID string, walletOptional bool) (int64, error) {
	hash, err := randomPasswordHash()
	if err != nil {
		return 0, err
	}
	id, _, err := db.Exec(ctx, tx, `INSERT INTO users (name, first_name, last_name, phone, password_hash, city, device_id, device_bound_at)
		VALUES (?, NULL, NULL, ?, ?, ?, ?, NOW())`, "", phone, hash, "Не указан", deviceID)
	if err != nil {
		return 0, err
	}
	_, _, err = db.Exec(ctx, tx, `INSERT INTO user_bonus_wallets (user_id, balance, blocked_balance, total_earned, total_spent, total_withdrawn) VALUES (?, 0, 0, 0, 0, 0)`, id)
	if err != nil && !walletOptional {
		return 0, err
	}
	return id, nil
}

func smsSend(w http.ResponseWriter, r *http.Request) error {
	b := httpx.BodyOf(r)
	purpose := b.Str("purpose")
	if purpose != "register" && purpose != "login" {
		return httpx.E(400, "Укажите purpose: register или login")
	}
	res, err := SendVerificationCode(r.Context(), b.Str("phone"), purpose)
	if err != nil {
		return err
	}
	httpx.OK(w, res)
	return nil
}

func smsRegister(w http.ResponseWriter, r *http.Request) error {
	ctx, b := r.Context(), httpx.BodyOf(r)
	phone, err := VerifyCode(ctx, b.Str("phone"), "register", b.Str("code"))
	if err != nil {
		return err
	}
	device := auth.DeviceID(r)
	if device == "" {
		return httpx.E(400, "Не удалось определить устройство")
	}
	var userID int64
	err = db.Tx(ctx, func(tx *sql.Tx) error {
		userID, err = createPhoneUser(ctx, tx, phone, device, false)
		return err
	})
	if db.IsDup(err) {
		return httpx.E(409, "Этот номер уже зарегистрирован. Войдите в аккаунт.")
	}
	if err != nil {
		return err
	}
	return respondWithToken(w, r, 201, userID, device, nil)
}

func smsLogin(w http.ResponseWriter, r *http.Request) error {
	ctx, b := r.Context(), httpx.BodyOf(r)
	phone, err := VerifyCode(ctx, b.Str("phone"), "login", b.Str("code"))
	if err != nil {
		return err
	}
	device := auth.DeviceID(r)
	if device == "" {
		return httpx.E(400, "Не удалось определить устройство")
	}
	user, err := db.One(ctx, db.Pool, "SELECT * FROM users WHERE phone = ?", phone)
	if err != nil {
		return err
	}
	var userID int64
	isNew, changed := false, false
	if user == nil {
		isNew = true
		err = db.Tx(ctx, func(tx *sql.Tx) error {
			userID, err = createPhoneUser(ctx, tx, phone, device, true)
			return err
		})
		if db.IsDup(err) {
			return httpx.E(409, "Этот номер уже используется")
		}
		if err != nil {
			return err
		}
	} else {
		if user.Str("status") == "blocked" {
			return httpx.E(403, "Аккаунт заблокирован")
		}
		userID = user.Int("id")
		if changed, err = auth.BindDeviceOnLogin(ctx, db.Pool, userID, device); err != nil {
			return err
		}
	}

	token, err := auth.SignUser(userID)
	if err != nil {
		return err
	}
	profile, err := BuildProfile(ctx, userID, device)
	if err != nil {
		return err
	}
	if profile != nil {
		profile["isNew"] = isNew
	}
	out := httpx.M{"token": token, "user": profile, "isNew": isNew, "device_changed": changed}
	if changed {
		out["message"] = deviceChangedMsg
	}
	status := 200
	if isNew {
		status = 201
	}
	httpx.JSON(w, status, out)
	return nil
}

func register(w http.ResponseWriter, r *http.Request) error {
	ctx, b := r.Context(), httpx.BodyOf(r)
	first, last := strings.TrimSpace(b.Str("firstName")), strings.TrimSpace(b.Str("lastName"))
	name := strings.TrimSpace(b.Str("name"))
	if name == "" {
		name = BuildDisplayName(first, last)
	}
	city := strings.TrimSpace(b.Str("city"))
	if city == "" {
		city = "Не указан"
	}
	phone := strings.TrimSpace(b.Str("phone"))
	password := b.Str("password")
	shoeCode := strings.TrimSpace(b.Str("unique_id"))

	switch {
	case first == "" || last == "":
		return httpx.E(400, "Укажите имя и фамилию")
	case phone == "":
		return httpx.E(400, "Укажите номер телефона")
	case len([]rune(password)) < 4:
		return httpx.E(400, "Пароль не менее 4 символов")
	case name == "":
		return httpx.E(400, "Укажите имя и фамилию")
	}
	device := auth.DeviceID(r)
	if device == "" {
		return httpx.E(400, "Не удалось определить устройство")
	}
	existing, err := db.One(ctx, db.Pool, "SELECT id FROM users WHERE phone = ?", phone)
	if err != nil {
		return err
	}
	if existing != nil {
		return httpx.E(409, "Номер уже зарегистрирован")
	}

	var userID int64
	var shoe any
	err = db.Tx(ctx, func(tx *sql.Tx) error {
		hash, err := bcrypt.GenerateFromPassword([]byte(password), 10)
		if err != nil {
			return err
		}
		userID, _, err = db.Exec(ctx, tx, `INSERT INTO users (name, first_name, last_name, phone, password_hash, city, device_id, device_bound_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`, name, first, last, phone, string(hash), city, device)
		if err != nil {
			return err
		}
		if _, _, err = db.Exec(ctx, tx, `INSERT INTO user_bonus_wallets (user_id, balance, blocked_balance, total_earned, total_spent, total_withdrawn) VALUES (?, 0, 0, 0, 0, 0)`, userID); err != nil {
			return err
		}
		if shoeCode != "" {
			check, err := shoes.ValidateQR(ctx, tx, shoeCode)
			if err != nil {
				return err
			}
			if !check.Valid {
				msg := check.Error
				if msg == "" {
					msg = "QR-код недействителен"
				}
				return httpx.EC(400, msg, check.Code)
			}
			s, err := shoes.ActivateForUser(ctx, tx, userID, shoeCode, device)
			if err != nil {
				return err
			}
			shoe = s
		}
		return nil
	})
	if err != nil {
		return err
	}
	return respondWithToken(w, r, 201, userID, device, httpx.M{"shoe": shoe, "redirectToShop": shoeCode == ""})
}

func login(w http.ResponseWriter, r *http.Request) error {
	ctx, b := r.Context(), httpx.BodyOf(r)
	user, err := db.One(ctx, db.Pool, "SELECT * FROM users WHERE phone = ?", b.Raw("phone"))
	if err != nil {
		return err
	}
	if user == nil {
		return httpx.E(401, "Неверный телефон или пароль")
	}
	if user.Str("status") == "blocked" {
		return httpx.E(403, "Аккаунт заблокирован")
	}
	if bcrypt.CompareHashAndPassword([]byte(user.Str("password_hash")), []byte(b.Str("password"))) != nil {
		return httpx.E(401, "Неверный телефон или пароль")
	}
	device := auth.DeviceID(r)
	if device == "" {
		return httpx.E(400, "Не удалось определить устройство")
	}
	changed, err := auth.BindDeviceOnLogin(ctx, db.Pool, user.Int("id"), device)
	if err != nil {
		return err
	}
	extra := httpx.M{"device_changed": changed}
	if changed {
		extra["message"] = deviceChangedMsg
	}
	return respondWithToken(w, r, 200, user.Int("id"), device, extra)
}

func respondWithToken(w http.ResponseWriter, r *http.Request, status int, userID int64, device string, extra httpx.M) error {
	token, err := auth.SignUser(userID)
	if err != nil {
		return err
	}
	profile, err := BuildProfile(r.Context(), userID, device)
	if err != nil {
		return err
	}
	out := httpx.M{"token": token, "user": profile}
	for k, v := range extra {
		out[k] = v
	}
	httpx.JSON(w, status, out)
	return nil
}

func me(w http.ResponseWriter, r *http.Request) error {
	p, err := BuildProfile(r.Context(), auth.UserID(r), auth.RequestDevice(r))
	if err != nil {
		return err
	}
	if p == nil {
		return httpx.E(404, "Пользователь не найден")
	}
	httpx.OK(w, p)
	return nil
}

func logout(w http.ResponseWriter, r *http.Request) error {
	cleared, mismatch, err := auth.UnbindDeviceOnLogout(r.Context(), auth.UserID(r), auth.RequestDevice(r))
	if err != nil {
		return err
	}
	msg := "Выход выполнен."
	if cleared {
		msg = "Выход выполнен. Привязка к этому телефону снята."
	} else if mismatch {
		msg = "Выход выполнен. Это устройство не было основным для аккаунта."
	}
	httpx.OK(w, httpx.M{"ok": true, "device_cleared": cleared, "message": msg})
	return nil
}

func updateProfile(w http.ResponseWriter, r *http.Request) error {
	ctx, b, uid := r.Context(), httpx.BodyOf(r), auth.UserID(r)
	first := strings.TrimSpace(b.Str("firstName", "first_name"))
	last := strings.TrimSpace(b.Str("lastName", "last_name"))
	avatar := b.Str("avatarBase64", "avatar_base64")

	cityGiven := b.Has("city")
	var city *string
	if v := b.Raw("city"); v != nil {
		c := strings.TrimSpace(httpx.ToString(v))
		city = &c
	}
	if cityGiven && (city == nil || *city == "") {
		return httpx.E(400, "Выберите город")
	}
	if city != nil && first == "" {
		return httpx.E(400, "Укажите имя")
	}
	if first == "" && !cityGiven && avatar == "" {
		return httpx.E(400, "Укажите имя")
	}

	name := BuildDisplayName(first, last)
	if name == "" {
		name = "Клиент RB-" + strconv.FormatInt(uid, 10)
	}
	var lastVal any
	if last != "" {
		lastVal = last
	}

	set := []string{"name = ?", "first_name = ?", "last_name = ?"}
	args := []any{name, first, lastVal}
	if avatar != "" {
		url, err := SaveAvatar(uid, avatar)
		if err != nil {
			return err
		}
		set = append(set, "avatar_url = ?")
		args = append(args, url)
	}
	if city != nil {
		set = append(set, "city = ?")
		args = append(args, *city)
	}
	args = append(args, uid)
	if _, _, err := db.Exec(ctx, db.Pool, "UPDATE users SET "+strings.Join(set, ", ")+" WHERE id = ?", args...); err != nil {
		return err
	}
	p, err := BuildProfile(ctx, uid, auth.DeviceID(r))
	if err != nil {
		return err
	}
	httpx.OK(w, p)
	return nil
}
