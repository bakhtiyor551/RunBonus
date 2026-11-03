// Package shoes — кроссовки и QR (этап 4).
package shoes

import (
	"context"
	"database/sql"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"runbonus/api/internal/auth"
	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/util"
)

func Register(r chi.Router) {
	r.With(auth.User, auth.ActiveUser).Post("/api/shoes/activate", func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, 410, httpx.M{
			"error": "Активация по QR отключена. Кроссовки активируются автоматически после доставки заказа.",
			"code":  "ACTIVATION_VIA_DELIVERY",
		})
	})

	r.Post("/api/mobile/shoes/validate-qr", httpx.H("Ошибка проверки QR", func(w http.ResponseWriter, r *http.Request) error {
		res, err := ValidateQR(r.Context(), db.Pool, httpx.BodyOf(r).Str("unique_id"))
		if err != nil {
			return err
		}
		if !res.Valid {
			httpx.JSON(w, 400, httpx.M{"error": res.Error, "code": res.Code, "valid": false})
			return nil
		}
		httpx.OK(w, httpx.M{"valid": true, "message": "Кроссовки можно активировать", "shoe": res.Shoe})
		return nil
	}))

	r.With(auth.User).Get("/api/mobile/shoes/status", httpx.H("Ошибка", func(w http.ResponseWriter, r *http.Request) error {
		st, err := UserShoeStatus(r.Context(), auth.UserID(r))
		if err != nil {
			return err
		}
		httpx.OK(w, st)
		return nil
	}))
}

type Validation struct {
	Valid bool
	Error string
	Code  string
	Shoe  httpx.M
}

func ValidateQR(ctx context.Context, q db.Querier, raw string) (Validation, error) {
	uid := strings.ToUpper(strings.TrimSpace(raw))
	if uid == "" {
		return Validation{Error: "QR-код недействителен", Code: "INVALID"}, nil
	}
	shoe, err := db.One(ctx, q, `SELECT s.*, sb.id AS batch_ok
		FROM shoes s LEFT JOIN shoe_batches sb ON sb.id = s.batch_id
		WHERE s.unique_id = ?`, uid)
	if err != nil {
		return Validation{}, err
	}
	if shoe == nil {
		return Validation{Error: "QR-код недействителен", Code: "NOT_FOUND"}, nil
	}
	switch shoe.Str("status") {
	case "blocked":
		return Validation{Error: "QR-код заблокирован", Code: "BLOCKED"}, nil
	case "expired":
		return Validation{Error: "QR-код недействителен", Code: "EXPIRED"}, nil
	case "activated":
		return Validation{Error: "QR-код уже использован", Code: "ALREADY_USED"}, nil
	case "new":
	default:
		return Validation{Error: "QR-код недействителен", Code: "INVALID_STATUS"}, nil
	}
	return Validation{Valid: true, Shoe: httpx.M{
		"unique_id": shoe["unique_id"], "model_name": shoe["model_name"], "batch_id": shoe["batch_id"],
	}}, nil
}

func UserShoeStatus(ctx context.Context, userID int64) (httpx.M, error) {
	shoe, err := db.One(ctx, db.Pool, `SELECT s.id, s.unique_id, s.model_name, s.status, s.activated_at
		FROM user_active_shoes uas JOIN shoes s ON s.id = uas.shoe_id
		WHERE uas.user_id = ?`, userID)
	if err != nil {
		return nil, err
	}
	if shoe == nil {
		return httpx.M{"has_active_shoe": false, "needs_activation": true, "shoe": nil}, nil
	}
	active := shoe.Str("status") == "activated"
	return httpx.M{"has_active_shoe": active, "needs_activation": !active, "shoe": map[string]any(shoe)}, nil
}

// ActivateForUser — активация с проверкой устройства клиента (регистрация с QR).
func ActivateForUser(ctx context.Context, tx *sql.Tx, userID int64, uniqueID, deviceID string) (httpx.M, error) {
	if err := auth.AssertQrActivationDevice(ctx, tx, userID, deviceID); err != nil {
		return nil, err
	}
	return activateCore(ctx, tx, userID, uniqueID)
}

// ActivateForUserAdmin — выдача QR по заказу, без проверки устройства.
func ActivateForUserAdmin(ctx context.Context, tx *sql.Tx, userID int64, uniqueID string) (httpx.M, error) {
	return activateCore(ctx, tx, userID, uniqueID)
}

func activateCore(ctx context.Context, tx *sql.Tx, userID int64, raw string) (httpx.M, error) {
	uid := strings.ToUpper(strings.TrimSpace(raw))
	if uid == "" {
		return nil, httpx.E(400, "Введите код")
	}
	shoe, err := db.One(ctx, tx, "SELECT * FROM shoes WHERE unique_id = ? FOR UPDATE", uid)
	if err != nil {
		return nil, err
	}
	if shoe == nil {
		return nil, httpx.EC(404, "Код не найден", "NOT_FOUND")
	}
	switch shoe.Str("status") {
	case "blocked":
		return nil, httpx.EC(403, "Код заблокирован", "BLOCKED")
	case "expired":
		return nil, httpx.EC(403, "Срок кода истёк", "EXPIRED")
	case "activated":
		return nil, httpx.EC(409, "Этот код уже активирован", "ALREADY_USED")
	}
	shoeID := shoe.Int("id")
	if _, _, err := db.Exec(ctx, tx, `UPDATE shoes SET status = 'activated', activated_by_user_id = ?, activated_at = NOW() WHERE id = ?`, userID, shoeID); err != nil {
		return nil, err
	}
	if _, _, err := db.Exec(ctx, tx, `INSERT INTO user_active_shoes (user_id, shoe_id) VALUES (?, ?)
		ON DUPLICATE KEY UPDATE shoe_id = VALUES(shoe_id)`, userID, shoeID); err != nil {
		return nil, err
	}
	if _, err := EnsureProgress(ctx, tx, userID, shoeID); err != nil {
		return nil, err
	}
	return httpx.M{"id": shoe["id"], "unique_id": shoe["unique_id"], "model_name": shoe["model_name"]}, nil
}

func backfillKm(ctx context.Context, q db.Querier, userID, shoeID int64) (float64, error) {
	v, err := db.Scalar(ctx, q, `SELECT COALESCE(SUM(distance_km), 0) AS km FROM workouts
		WHERE user_id = ? AND shoe_id = ? AND status = 'approved'`, userID, shoeID)
	return db.ToFloat(v), err
}

// EnsureProgress создаёт/обновляет прогресс по паре (только км).
func EnsureProgress(ctx context.Context, q db.Querier, userID, shoeID int64) (db.Row, error) {
	row, err := db.One(ctx, q, "SELECT * FROM user_shoe_progress WHERE user_id = ? AND shoe_id = ?", userID, shoeID)
	if err != nil {
		return nil, err
	}
	if row != nil {
		if row.Float("total_km") == 0 && !row.Bool("is_completed") {
			km, err := backfillKm(ctx, q, userID, shoeID)
			if err != nil {
				return nil, err
			}
			if km > 0 {
				if _, _, err := db.Exec(ctx, q, "UPDATE user_shoe_progress SET total_km = ?, current_level_id = NULL WHERE id = ?", util.Round(km, 2), row["id"]); err != nil {
					return nil, err
				}
				row["total_km"] = km
			}
		}
		return row, nil
	}
	km, err := backfillKm(ctx, q, userID, shoeID)
	if err != nil {
		return nil, err
	}
	id, _, err := db.Exec(ctx, q, `INSERT INTO user_shoe_progress
		(user_id, shoe_id, total_km, total_bonus, current_level_id, is_completed, completed_at)
		VALUES (?, ?, ?, 0, NULL, 0, NULL)`, userID, shoeID, util.Round(km, 2))
	if err != nil {
		return nil, err
	}
	return db.One(ctx, q, "SELECT * FROM user_shoe_progress WHERE id = ?", id)
}

// ApplyWorkoutProgress добавляет км тренировки к прогрессу пары.
func ApplyWorkoutProgress(ctx context.Context, q db.Querier, userID, shoeID int64, distanceKm, bonus float64) (float64, float64, error) {
	p, err := EnsureProgress(ctx, q, userID, shoeID)
	if err != nil {
		return 0, 0, err
	}
	before := p.Float("total_km")
	after := util.Round(before+max(0, distanceKm), 2)
	_, _, err = db.Exec(ctx, q, `UPDATE user_shoe_progress SET total_km = ?, total_bonus = total_bonus + ?, current_level_id = NULL
		WHERE user_id = ? AND shoe_id = ?`, after, util.Round(bonus, 2), userID, shoeID)
	return before, after, err
}
