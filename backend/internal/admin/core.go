// Package admin — API админ-панели (/api/admin/**).
package admin

import (
	"context"
	"crypto/rand"
	"database/sql"
	"math"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"

	"runbonus/api/internal/auth"
	"runbonus/api/internal/config"
	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/util"
	"runbonus/api/internal/workouts"
)

const shoeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func genShoeID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = shoeAlphabet[int(b[i])%len(shoeAlphabet)]
	}
	return string(b)
}

func copyRow(r db.Row) httpx.M {
	m := httpx.M{}
	for k, v := range r {
		m[k] = v
	}
	return m
}

func list(rows []db.Row, fn func(db.Row, httpx.M)) []httpx.M {
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		m := copyRow(r)
		if fn != nil {
			fn(r, m)
		}
		out = append(out, m)
	}
	return out
}

// DeviceInfo — formatDeviceAdminInfo.
func DeviceInfo(deviceID string, boundAt time.Time) httpx.M {
	bound := deviceID != ""
	var short, boundISO, label, days any
	if bound {
		short = deviceID
		if r := []rune(deviceID); len(r) > 12 {
			short = string(r[:8]) + "…" + string(r[len(r)-4:])
		}
	}
	if !boundAt.IsZero() {
		boundISO = db.ISO(boundAt)
		label = boundAt.Local().Format("02.01.2006, 15:04")
		days = int64(math.Floor(time.Since(boundAt).Hours() / 24))
	}
	status, hint := "Не привязано",
		"Клиент ещё не входил в приложение с привязкой или привязка была сброшена. После следующего входа в приложение устройство запишется автоматически."
	if bound {
		status, hint = "Привязано",
			"Сканирование QR и активация кроссовок разрешены только с этого телефона. При входе с другого устройства QR будет заблокирован."
	}
	return httpx.M{
		"bound": bound, "device_id": util.NilIfEmpty(deviceID), "device_id_short": short,
		"device_bound_at": boundISO, "device_bound_at_label": label, "days_bound": days,
		"status_label": status, "status_hint": hint,
		"qr_rule":    "Первый успешный вход или регистрация в мобильном приложении фиксирует ID установки (UUID в памяти телефона).",
		"reset_hint": "Сброс позволяет клиенту войти на новом телефоне и снова активировать QR. Старый ID устройства перестаёт действовать.",
	}
}

func handle(fallback string, fn func(w http.ResponseWriter, r *http.Request) error) http.HandlerFunc {
	return httpx.H(fallback, fn)
}

func ok(w http.ResponseWriter, v any) error { httpx.OK(w, v); return nil }

func created(w http.ResponseWriter, v any) error { httpx.JSON(w, 201, v); return nil }

func registerCore(r chi.Router) {
	r.Post("/login", handle("Ошибка входа", login))
	r.Group(func(r chi.Router) {
		r.Use(auth.AdminMW)
		r.Get("/users", handle("Ошибка", usersList))
		r.Get("/users/{id}", handle("Ошибка загрузки профиля", userDetail))
		r.Post("/users/block", handle("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
			b := httpx.BodyOf(r)
			status := "active"
			if b.Bool("blocked") {
				status = "blocked"
			}
			if _, _, err := db.Exec(r.Context(), db.Pool, "UPDATE users SET status = ? WHERE id = ?", status, httpx.ToString(b.Raw("user_id"))); err != nil {
				return err
			}
			return ok(w, httpx.M{"ok": true})
		}))
		r.Post("/users/reset-device", handle("Не удалось сбросить устройство", resetDevice))
		r.Get("/shoes", handle("Ошибка", shoesList))
		r.Post("/shoes/generate", handle("Ошибка генерации", generateShoes))
		r.Get("/workouts", handle("Ошибка", workoutsList))
		r.Get("/workouts/live", handle("Ошибка загрузки live GPS", func(w http.ResponseWriter, r *http.Request) error {
			w.Header().Set("Cache-Control", "no-store")
			snap, err := workouts.LiveSnapshot(r.Context())
			if err != nil {
				return err
			}
			return ok(w, snap)
		}))
		r.Get("/workouts/{id}", handle("Ошибка", workoutDetail))

		gone := func(msg string) http.HandlerFunc {
			return func(w http.ResponseWriter, _ *http.Request) {
				httpx.JSON(w, 410, httpx.M{"error": msg, "code": "WALLET_DEPRECATED"})
			}
		}
		r.Post("/bonus/topup", gone("Пополнение бонусного баланса отключено. Используйте систему наград."))
		r.Post("/bonus/manual", gone("Ручное начисление бонусов отключено. Используйте /api/admin/rewards/*"))
		r.Get("/bonus-fund", gone("Бонусный фонд deprecated. Смотрите статистику наград."))
	})
}

func login(w http.ResponseWriter, r *http.Request) error {
	b := httpx.BodyOf(r)
	a, err := db.One(r.Context(), db.Pool, "SELECT * FROM admin_users WHERE login = ?", b.Raw("login"))
	if err != nil {
		return err
	}
	if a == nil || bcrypt.CompareHashAndPassword([]byte(a.Str("password_hash")), []byte(b.Str("password"))) != nil {
		return httpx.E(401, "Неверный логин или пароль")
	}
	token, err := auth.SignAdmin(a.Int("id"), a.Str("role"))
	if err != nil {
		return err
	}
	return ok(w, httpx.M{"token": token, "admin": httpx.M{"id": a["id"], "login": a["login"], "role": a["role"]}})
}

func usersList(w http.ResponseWriter, r *http.Request) error {
	rows, err := db.Query(r.Context(), db.Pool, `SELECT u.id, u.name, u.phone, u.city, u.status, u.created_at,
			u.device_id, u.device_bound_at,
			(SELECT COALESCE(SUM(w.distance_km), 0) FROM workouts w WHERE w.user_id = u.id AND w.status = 'approved') AS total_distance_km,
			s.unique_id AS activated_shoe_id,
			COALESCE(ubw.balance, (SELECT balance_after FROM bonuses WHERE user_id = u.id ORDER BY id DESC LIMIT 1), 0) AS balance
		FROM users u
		LEFT JOIN user_bonus_wallets ubw ON ubw.user_id = u.id
		LEFT JOIN user_active_shoes uas ON uas.user_id = u.id
		LEFT JOIN shoes s ON s.id = uas.shoe_id
		ORDER BY u.created_at DESC`)
	if err != nil {
		return err
	}
	return ok(w, list(rows, func(r db.Row, m httpx.M) {
		m["balance"] = r.Float("balance")
		m["total_distance_km"], m["total_km"] = r.Float("total_distance_km"), r.Float("total_distance_km")
		m["device"] = DeviceInfo(r.Str("device_id"), r.Time("device_bound_at"))
	}))
}

func userDetail(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id := int64(db.ToFloat(chi.URLParam(r, "id")))
	if id == 0 {
		return httpx.E(400, "Некорректный ID")
	}
	u, err := db.One(ctx, db.Pool, `SELECT u.id, u.name, u.phone, u.city, u.status, u.created_at, u.updated_at,
			u.device_id, u.device_bound_at,
			s.id AS shoe_id, s.unique_id AS shoe_unique_id, s.model_name AS shoe_model,
			s.status AS shoe_status, s.activated_at AS shoe_activated_at
		FROM users u
		LEFT JOIN user_active_shoes uas ON uas.user_id = u.id
		LEFT JOIN shoes s ON s.id = uas.shoe_id
		WHERE u.id = ?`, id)
	if err != nil {
		return err
	}
	if u == nil {
		return httpx.E(404, "Клиент не найден")
	}
	wl, err := db.One(ctx, db.Pool, "SELECT balance, blocked_balance, total_earned, total_spent, total_withdrawn FROM user_bonus_wallets WHERE user_id = ?", id)
	if err != nil {
		return err
	}
	if wl == nil {
		wl = db.Row{}
	}
	st, err := db.One(ctx, db.Pool, `SELECT COUNT(*) AS total,
			SUM(status = 'approved') AS approved, SUM(status = 'rejected') AS rejected,
			SUM(status = 'in_progress') AS in_progress, SUM(status = 'suspicious') AS suspicious,
			COALESCE(SUM(distance_km), 0) AS total_km,
			COALESCE(SUM(CASE WHEN status = 'approved' THEN calculated_bonus ELSE 0 END), 0) AS total_bonus_calc
		FROM workouts WHERE user_id = ?`, id)
	if err != nil {
		return err
	}
	balance, blocked := wl.Float("balance"), wl.Float("blocked_balance")
	var shoe any
	if u["shoe_id"] != nil {
		shoe = httpx.M{"id": u["shoe_id"], "unique_id": u["shoe_unique_id"], "model_name": u["shoe_model"],
			"status": u["shoe_status"], "activated_at": u["shoe_activated_at"]}
	}
	// SUM(...) по пустой выборке — NULL → Number(null) = 0.
	return ok(w, httpx.M{
		"id": u["id"], "name": u["name"], "phone": u["phone"], "city": u["city"], "status": u["status"],
		"created_at": u["created_at"], "updated_at": u["updated_at"],
		"wallet": httpx.M{"balance": balance, "blocked_balance": blocked, "available_balance": util.Round(balance-blocked, 2),
			"total_earned": wl.Float("total_earned"), "total_spent": wl.Float("total_spent")},
		"shoe": shoe,
		"workouts": httpx.M{"total": st.Float("total"), "approved": st.Float("approved"), "rejected": st.Float("rejected"),
			"in_progress": st.Float("in_progress"), "suspicious": st.Float("suspicious"),
			"total_km": st.Float("total_km"), "total_bonus_calc": st.Float("total_bonus_calc")},
		"device": DeviceInfo(u.Str("device_id"), u.Time("device_bound_at")),
	})
}

func resetDevice(w http.ResponseWriter, r *http.Request) error {
	ctx, b := r.Context(), httpx.BodyOf(r)
	uid := b.Raw("user_id", "userId")
	if !httpx.Truthy(uid) {
		return httpx.E(400, "Укажите user_id")
	}
	var user db.Row
	err := db.Tx(ctx, func(tx *sql.Tx) error {
		var err error
		if user, err = db.One(ctx, tx, "SELECT id, name, phone, device_id FROM users WHERE id = ?", httpx.ToString(uid)); err != nil {
			return err
		}
		if user == nil {
			return httpx.E(404, "Клиент не найден")
		}
		_, _, err = db.Exec(ctx, tx, "UPDATE users SET device_id = NULL, device_bound_at = NULL WHERE id = ?", user["id"])
		return err
	})
	if err != nil {
		return err
	}
	return ok(w, httpx.M{
		"ok":      true,
		"message": "Привязка устройства сброшена. Клиент сможет активировать QR на новом телефоне после входа.",
		"user": httpx.M{"id": user["id"], "name": user["name"], "phone": user["phone"], "previous_device_id": user["device_id"],
			"previous_device": DeviceInfo(user.Str("device_id"), time.Time{})},
		"device": DeviceInfo("", time.Time{}),
	})
}

func shoesList(w http.ResponseWriter, r *http.Request) error {
	rows, err := db.Query(r.Context(), db.Pool, `SELECT s.id, s.model_name, s.unique_id, s.qr_code, s.status, s.created_at, s.activated_at,
			u.id AS activated_by_user_id, u.name AS activated_by_name, u.phone AS activated_by_phone,
			u.city AS activated_by_city, u.status AS activated_by_status, u.created_at AS activated_by_registered_at,
			COALESCE(ubw.balance, (SELECT balance_after FROM bonuses WHERE user_id = u.id ORDER BY id DESC LIMIT 1), 0) AS activated_by_balance,
			(SELECT COUNT(*) FROM workouts w WHERE w.user_id = u.id) AS activated_by_workouts
		FROM shoes s
		LEFT JOIN users u ON u.id = s.activated_by_user_id
		LEFT JOIN user_bonus_wallets ubw ON ubw.user_id = u.id
		ORDER BY s.id DESC LIMIT 500`)
	if err != nil {
		return err
	}
	return ok(w, list(rows, func(r db.Row, m httpx.M) {
		if r["activated_by_balance"] != nil {
			m["activated_by_balance"] = r.Float("activated_by_balance")
		}
		m["activated_by_workouts"] = r.Float("activated_by_workouts")
	}))
}

func generateShoes(w http.ResponseWriter, r *http.Request) error {
	ctx, b := r.Context(), httpx.BodyOf(r)
	model, qty := b.Str("model_name"), b.Float("quantity")
	if model == "" || qty < 1 || qty > 500 {
		return httpx.E(400, "Укажите модель и количество (1–500)")
	}
	var batchID int64
	shoes := []httpx.M{}
	err := db.Tx(ctx, func(tx *sql.Tx) error {
		var err error
		if batchID, _, err = db.Exec(ctx, tx, "INSERT INTO shoe_batches (model_name, quantity) VALUES (?, ?)", model, qty); err != nil {
			return err
		}
		for i := 0; float64(i) < qty; i++ {
			uid := "SHOE-" + genShoeID()
			id, _, err := db.Exec(ctx, tx, "INSERT INTO shoes (batch_id, model_name, qr_code, unique_id, status) VALUES (?, ?, ?, ?, 'new')", batchID, model, uid, uid)
			if err != nil {
				return err
			}
			shoes = append(shoes, httpx.M{"id": id, "unique_id": uid, "qr_code": uid, "model_name": model})
		}
		return nil
	})
	if err != nil {
		return err
	}
	return created(w, httpx.M{"batch_id": batchID, "count": len(shoes), "shoes": shoes})
}

func workoutsList(w http.ResponseWriter, r *http.Request) error {
	w.Header().Set("Cache-Control", "no-store")
	rows, err := db.Query(r.Context(), db.Pool, `SELECT w.id, w.user_id, u.name AS client_name, u.phone, w.distance_km, w.duration_seconds,
			w.avg_speed, w.max_speed, w.started_at, w.finished_at, w.status, w.reject_reason, w.background_tracking,
			(SELECT COUNT(*) FROM workout_points wp WHERE wp.workout_id = w.id) AS points_count
		FROM workouts w JOIN users u ON u.id = w.user_id
		ORDER BY w.started_at DESC LIMIT 200`)
	if err != nil {
		return err
	}
	return ok(w, list(rows, func(r db.Row, m httpx.M) {
		m["distance_km"], m["bonus"], m["points_count"] = r.Float("distance_km"), 0, r.Float("points_count")
	}))
}

// BonusSettings — getActiveBonusSettings (полный набор для админки).
func BonusSettings(ctx context.Context) httpx.M {
	def := httpx.M{
		"price_per_km": envNum("BONUS_PER_KM", 3), "daily_limit": envNum("DAILY_BONUS_LIMIT", 10),
		"total_limit_per_shoe": envNum("SHOE_BONUS_LIMIT", 200),
		"min_distance_km":      0.5, "min_duration_minutes": 5.0, "max_speed_kmh": 18.0,
	}
	row, err := db.One(ctx, db.Pool, "SELECT * FROM bonus_settings WHERE status = 'active' ORDER BY id DESC LIMIT 1")
	if err != nil || row == nil {
		return def
	}
	return httpx.M{"id": row["id"], "price_per_km": row.Float("price_per_km"), "daily_limit": row.Float("daily_limit"),
		"total_limit_per_shoe": row.Float("total_limit_per_shoe"), "min_distance_km": row.Float("min_distance_km"),
		"min_duration_minutes": row.Float("min_duration_minutes"), "max_speed_kmh": row.Float("max_speed_kmh"),
		"status": row["status"], "updated_at": row["updated_at"]}
}

func envNum(key string, def float64) float64 {
	if v := config.Env(key); v != "" {
		if f := db.ToFloat(v); f != 0 {
			return f
		}
	}
	return def
}

func workoutDetail(w http.ResponseWriter, r *http.Request) error {
	ctx, id := r.Context(), chi.URLParam(r, "id")
	wk, err := db.One(ctx, db.Pool, `SELECT w.*, u.name AS client_name, u.phone, s.unique_id AS shoe_unique_id, s.model_name AS shoe_model
		FROM workouts w JOIN users u ON u.id = w.user_id JOIN shoes s ON s.id = w.shoe_id WHERE w.id = ?`, id)
	if err != nil {
		return err
	}
	if wk == nil {
		return httpx.E(404, "Тренировка не найдена")
	}
	pts, err := db.Query(ctx, db.Pool, `SELECT id, latitude AS lat, longitude AS lng, speed, accuracy, recorded_at
		FROM workout_points WHERE workout_id = ? ORDER BY recorded_at`, id)
	if err != nil {
		return err
	}
	var daily float64
	if wk["started_at"] != nil {
		day := wk.Time("started_at").UTC().Format("2006-01-02")
		v, err := db.Scalar(ctx, db.Pool, "SELECT earned_amount FROM daily_bonus_limits WHERE user_id = ? AND shoe_id = ? AND date = ?", wk["user_id"], wk["shoe_id"], day)
		if err != nil {
			return err
		}
		daily = db.ToFloat(v)
	}
	shoeTotal, err := db.Scalar(ctx, db.Pool, `SELECT COALESCE(SUM(amount), 0) AS total FROM user_bonus_transactions WHERE user_id = ? AND shoe_id = ? AND type = 'earn'`, wk["user_id"], wk["shoe_id"])
	if err != nil {
		return err
	}
	total := db.ToFloat(shoeTotal)
	if total <= 0 {
		legacy, err := db.Scalar(ctx, db.Pool, `SELECT COALESCE(SUM(amount), 0) AS total FROM bonuses WHERE user_id = ? AND shoe_id = ? AND type = 'earn'`, wk["user_id"], wk["shoe_id"])
		if err != nil {
			return err
		}
		total = db.ToFloat(legacy)
	}
	bonus, err := db.Scalar(ctx, db.Pool, "SELECT amount FROM user_bonus_transactions WHERE workout_id = ? AND type = 'earn' LIMIT 1", id)
	if err != nil {
		return err
	}
	s := BonusSettings(ctx)

	out := copyRow(wk)
	out["distance_km"] = wk.Float("distance_km")
	for _, k := range []string{"price_per_km", "calculated_bonus", "avg_speed", "max_speed"} {
		if wk[k] != nil {
			out[k] = wk.Float(k)
		}
	}
	points := list(pts, func(p db.Row, m httpx.M) {
		m["lat"], m["lng"] = p.Float("lat"), p.Float("lng")
		if p["speed"] != nil {
			m["speed"] = p.Float("speed")
		}
		if p["accuracy"] != nil {
			m["accuracy"] = p.Float("accuracy")
		}
	})
	return ok(w, httpx.M{
		"workout": out, "points": points, "bonus_earned": db.ToFloat(bonus),
		"limits": httpx.M{"daily_earned": daily, "daily_limit": s["daily_limit"], "shoe_total_earned": total,
			"shoe_limit": s["total_limit_per_shoe"], "current_price_per_km": s["price_per_km"]},
	})
}
