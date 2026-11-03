// Package auth — JWT, привязка к устройству и middleware authUser/authAdmin.
package auth

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"runbonus/api/internal/config"
	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
)

type ctxKey int

const (
	userKey ctxKey = iota
	deviceKey
	adminKey
)

// SignUser выпускает токен в формате jsonwebtoken: {userId, iat, exp}, 30 дней.
func SignUser(userID int64) (string, error) {
	now := time.Now()
	return jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"userId": userID,
		"iat":    now.Unix(),
		"exp":    now.Add(30 * 24 * time.Hour).Unix(),
	}).SignedString([]byte(config.C.JWTSecret))
}

func SignAdmin(adminID int64, role string) (string, error) {
	now := time.Now()
	return jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"adminId": adminID,
		"role":    role,
		"iat":     now.Unix(),
		"exp":     now.Add(7 * 24 * time.Hour).Unix(),
	}).SignedString([]byte(config.C.JWTAdminSecret))
}

func parse(token, secret string) (jwt.MapClaims, error) {
	claims := jwt.MapClaims{}
	_, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		return []byte(secret), nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	return claims, err
}

func bearer(r *http.Request) (string, bool) {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return "", false
	}
	return h[7:], true
}

// DeviceID — X-Device-Id, ?device_id / ?deviceId или deviceId / device_id в теле.
func DeviceID(r *http.Request) string {
	raw := r.Header.Get("X-Device-Id")
	if raw == "" {
		raw = httpx.Query(r, "device_id", "deviceId")
	}
	if raw == "" {
		raw = httpx.BodyOf(r).Str("deviceId", "device_id")
	}
	id := strings.TrimSpace(raw)
	if id == "" || len(id) > 64 {
		return ""
	}
	return id
}

func UserID(r *http.Request) int64 {
	id, _ := r.Context().Value(userKey).(int64)
	return id
}

func RequestDevice(r *http.Request) string {
	d, _ := r.Context().Value(deviceKey).(string)
	return d
}

type Admin struct {
	ID   int64
	Role string
}

func AdminOf(r *http.Request) Admin {
	a, _ := r.Context().Value(adminKey).(Admin)
	return a
}

func verifyUser(r *http.Request) (*http.Request, error) {
	tok, ok := bearer(r)
	if !ok {
		return nil, httpx.E(401, "Требуется авторизация")
	}
	claims, err := parse(tok, config.C.JWTSecret)
	if err != nil {
		return nil, httpx.E(401, "Недействительный токен")
	}
	uid := int64(db.ToFloat(claims["userId"]))
	if uid == 0 {
		return nil, httpx.E(401, "Недействительный токен")
	}
	ctx := context.WithValue(r.Context(), userKey, uid)
	ctx = context.WithValue(ctx, deviceKey, DeviceID(r))
	return r.WithContext(ctx), nil
}

// UserToken — только JWT, без проверки устройства (выход с «чужого» телефона).
func UserToken(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r2, err := verifyUser(r)
		if err != nil {
			httpx.WriteError(w, r, err, "")
			return
		}
		next.ServeHTTP(w, r2)
	})
}

// User — JWT + запрос только с привязанного устройства.
func User(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r2, err := verifyUser(r)
		if err == nil {
			err = AssertMatchingDevice(r.Context(), db.Pool, UserID(r2), RequestDevice(r2))
		}
		if err != nil {
			if _, ok := err.(*httpx.Error); !ok {
				err = httpx.E(401, "Недействительный токен")
			}
			httpx.WriteError(w, r, err, "")
			return
		}
		next.ServeHTTP(w, r2)
	})
}

// ActiveUser — 403 для заблокированного аккаунта.
func ActiveUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		row, err := db.One(r.Context(), db.Pool, "SELECT status FROM users WHERE id = ?", UserID(r))
		if err != nil {
			httpx.WriteError(w, r, err, "")
			return
		}
		if row == nil || row.Str("status") == "blocked" {
			httpx.JSON(w, 403, httpx.M{"error": "Аккаунт заблокирован"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func AdminMW(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tok, ok := bearer(r)
		if !ok {
			httpx.JSON(w, 401, httpx.M{"error": "Требуется авторизация администратора"})
			return
		}
		claims, err := parse(tok, config.C.JWTAdminSecret)
		if err != nil {
			httpx.JSON(w, 401, httpx.M{"error": "Недействительный токен"})
			return
		}
		role, _ := claims["role"].(string)
		a := Admin{ID: int64(db.ToFloat(claims["adminId"])), Role: role}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), adminKey, a)))
	})
}

// ActiveShoe — тренировки только с активированными кроссовками.
func ActiveShoe(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		row, err := db.One(r.Context(), db.Pool,
			`SELECT s.status FROM user_active_shoes uas
			 JOIN shoes s ON s.id = uas.shoe_id
			 WHERE uas.user_id = ?`, UserID(r))
		if err != nil {
			httpx.JSON(w, 500, httpx.M{"error": "Ошибка проверки кроссовок"})
			return
		}
		if row == nil || row.Str("status") != "activated" {
			httpx.JSON(w, 403, httpx.M{
				"error": "Кроссовки ещё не активированы. Купите их в магазине — активация после доставки заказа.",
				"code":  "NO_ACTIVE_SHOE",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// --- привязка устройства ---

func deviceRequired() error {
	return httpx.EC(400, "Не удалось определить устройство. Переустановите приложение.", "DEVICE_REQUIRED")
}

// BindDeviceOnLogin — последний вход побеждает. Возвращает device_changed.
func BindDeviceOnLogin(ctx context.Context, q db.Querier, userID int64, deviceID string) (bool, error) {
	if deviceID == "" {
		return false, deviceRequired()
	}
	row, err := db.One(ctx, q, "SELECT device_id FROM users WHERE id = ?", userID)
	if err != nil {
		return false, err
	}
	prev := ""
	if row != nil {
		prev = row.Str("device_id")
	}
	if _, _, err := db.Exec(ctx, q, "UPDATE users SET device_id = ?, device_bound_at = NOW() WHERE id = ?", deviceID, userID); err != nil {
		return false, err
	}
	return prev != "" && prev != deviceID, nil
}

func AssertMatchingDevice(ctx context.Context, q db.Querier, userID int64, deviceID string) error {
	if deviceID == "" {
		return deviceRequired()
	}
	row, err := db.One(ctx, q, "SELECT device_id FROM users WHERE id = ?", userID)
	if err != nil {
		return err
	}
	if row == nil {
		return httpx.E(404, "Пользователь не найден")
	}
	stored := row.Str("device_id")
	if stored == "" {
		_, _, err := db.Exec(ctx, q, "UPDATE users SET device_id = ?, device_bound_at = NOW() WHERE id = ?", deviceID, userID)
		return err
	}
	if stored != deviceID {
		return httpx.EC(403, "Аккаунт активен на другом телефоне. Войдите снова здесь — при входе это устройство станет основным.", "DEVICE_MISMATCH")
	}
	return nil
}

// AssertQrActivationDevice — активация QR только с привязанного устройства (в транзакции).
func AssertQrActivationDevice(ctx context.Context, tx *sql.Tx, userID int64, deviceID string) error {
	if deviceID == "" {
		return deviceRequired()
	}
	row, err := db.One(ctx, tx, "SELECT device_id FROM users WHERE id = ? FOR UPDATE", userID)
	if err != nil {
		return err
	}
	if row == nil {
		return httpx.E(404, "Пользователь не найден")
	}
	stored := row.Str("device_id")
	if stored == "" {
		_, _, err := db.Exec(ctx, tx, "UPDATE users SET device_id = ?, device_bound_at = NOW() WHERE id = ?", deviceID, userID)
		return err
	}
	if stored != deviceID {
		return httpx.EC(403, "Активация QR доступна только на том устройстве, где вы впервые вошли в приложение.", "DEVICE_MISMATCH")
	}
	return nil
}

// UnbindDeviceOnLogout возвращает (cleared, mismatch).
func UnbindDeviceOnLogout(ctx context.Context, userID int64, deviceID string) (bool, bool, error) {
	if deviceID == "" {
		return false, false, nil
	}
	row, err := db.One(ctx, db.Pool, "SELECT device_id FROM users WHERE id = ?", userID)
	if err != nil || row == nil {
		return false, false, err
	}
	if row.Str("device_id") != deviceID {
		return false, true, nil
	}
	_, _, err = db.Exec(ctx, db.Pool, "UPDATE users SET device_id = NULL, device_bound_at = NULL WHERE id = ?", userID)
	return err == nil, false, err
}

func IsDeviceMismatch(stored, request string) bool {
	return stored != "" && request != "" && stored != request
}
