// Package rewards — прогресс по км, контрольные точки и награды, рейтинг (этапы 7–8).
package rewards

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"math"

	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/users"
	"runbonus/api/internal/util"
)

func roundKm(n float64) float64 { return util.Round(n, 3) }

// SyncUserTotalDistance — пересчёт users.total_distance_km по одобренным тренировкам.
func SyncUserTotalDistance(ctx context.Context, q db.Querier, userID int64) (float64, error) {
	total, err := users.ConfirmedDistanceKm(ctx, q, userID)
	if err != nil {
		return 0, err
	}
	_, _, err = db.Exec(ctx, q, "UPDATE users SET total_distance_km = ? WHERE id = ?", total, userID)
	return total, err
}

// UnlockMilestones — после одобренной тренировки открывает достигнутые контрольные точки.
func UnlockMilestones(ctx context.Context, q db.Querier, userID int64) ([]db.Row, error) {
	total, err := SyncUserTotalDistance(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	ms, err := db.Query(ctx, q, `SELECT id, name, distance_km FROM reward_milestones
		WHERE status = 'active' AND distance_km <= ? ORDER BY distance_km ASC`, total)
	if err != nil {
		return nil, err
	}
	var unlocked []db.Row
	for _, m := range ms {
		_, n, err := db.Exec(ctx, q, `INSERT IGNORE INTO user_rewards (user_id, milestone_id, status) VALUES (?, ?, 'AVAILABLE')`, userID, m["id"])
		if err != nil {
			return nil, err
		}
		if n > 0 {
			unlocked = append(unlocked, m)
		}
	}
	return unlocked, nil
}

// Milestone — элемент списка контрольных точек в прогрессе.
type Milestone = httpx.M

// Progress — getUserProgress. Возвращается как JSON-объект.
func Progress(ctx context.Context, userID int64) (httpx.M, error) {
	total, err := SyncUserTotalDistance(ctx, db.Pool, userID)
	if err != nil {
		return nil, err
	}
	ms, err := db.Query(ctx, db.Pool, `SELECT id, name, distance_km, description, sort_order
		FROM reward_milestones WHERE status = 'active' ORDER BY distance_km ASC, sort_order ASC`)
	if err != nil {
		return nil, err
	}
	urs, err := db.Query(ctx, db.Pool, `SELECT ur.*, r.name AS reward_name, r.type AS reward_type, r.image AS reward_image,
			rd.size AS delivery_size, rd.color AS delivery_color, rd.delivery_status,
			rpc.code AS promo_code_value, rpc.status AS promo_status, rpc.expires_at AS promo_expires_at,
			rpc.discount_percent
		FROM user_rewards ur
		LEFT JOIN rewards r ON r.id = ur.reward_id
		LEFT JOIN reward_delivery rd ON rd.user_reward_id = ur.id
		LEFT JOIN reward_promo_codes rpc ON rpc.user_reward_id = ur.id
		WHERE ur.user_id = ?`, userID)
	if err != nil {
		return nil, err
	}
	// new Map(...) — при дублях побеждает последняя строка.
	byMilestone := map[int64]db.Row{}
	for _, ur := range urs {
		byMilestone[ur.Int("milestone_id")] = ur
	}

	var next any
	var remaining any
	list := make([]httpx.M, 0, len(ms))
	for _, m := range ms {
		dist := m.Float("distance_km")
		ur := byMilestone[m.Int("id")]
		status := "LOCKED"
		var reward any
		if ur != nil {
			status = ur.Str("status")
			if ur["reward_id"] != nil {
				var discount any
				if ur["discount_percent"] != nil {
					discount = ur.Float("discount_percent")
				}
				reward = httpx.M{
					"id": ur["reward_id"], "name": ur["reward_name"], "type": ur["reward_type"], "image": ur["reward_image"],
					"size":            util.NilIfEmpty(ur.Str("delivery_size")),
					"color":           util.NilIfEmpty(ur.Str("delivery_color")),
					"promoCode":       util.NilIfEmpty(util.FirstNonEmpty(ur.Str("promo_code_value"), ur.Str("promo_code"))),
					"promoStatus":     util.NilIfEmpty(ur.Str("promo_status")),
					"discountPercent": discount,
					"expiresAt":       util.NilIfEmpty(ur.Str("promo_expires_at")),
				}
			}
		} else if total >= dist {
			status = "AVAILABLE"
		}
		if next == nil && status == "LOCKED" {
			next = httpx.M{"id": m["id"], "distance": dist, "name": m["name"], "description": m["description"]}
			remaining = roundKm(math.Max(0, dist-total))
		}
		remainingKm := 0.0
		if status == "LOCKED" {
			remainingKm = roundKm(math.Max(0, dist-total))
		}
		var selectedAt, deliveredAt any
		if ur != nil {
			selectedAt = util.NilIfEmpty(ur.Str("selected_at"))
			deliveredAt = util.NilIfEmpty(ur.Str("delivered_at"))
		}
		list = append(list, httpx.M{
			"id": m["id"], "name": m["name"], "distance": dist, "description": m["description"],
			"status": status, "reward": reward, "remainingKm": remainingKm,
			"selectedAt": selectedAt, "deliveredAt": deliveredAt,
		})
	}
	if next == nil && len(list) > 0 && list[len(list)-1]["status"] != "LOCKED" {
		remaining = 0
	}
	earned := 0
	for _, m := range list {
		switch m["status"] {
		case "SELECTED", "PROCESSING", "READY", "DELIVERED":
			earned++
		}
	}
	return httpx.M{"totalDistance": total, "nextMilestone": next, "remainingDistance": remaining, "earnedCount": earned, "milestones": list}, nil
}

// ParseList — JSON-массив из колонки (уже разобранный JSON или строка).
func ParseList(v any) ([]any, bool) {
	switch x := v.(type) {
	case []any:
		return x, true
	case nil:
		return []any{}, true
	case string:
		if x == "" {
			return []any{}, true
		}
		var out []any
		if json.Unmarshal([]byte(x), &out) != nil {
			return nil, false
		}
		return out, true
	}
	return nil, false
}

const nanoAlphabet = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict"

// NanoID — nanoid(n): URL-safe алфавит.
func NanoID(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = nanoAlphabet[b[i]&63]
	}
	return string(b)
}
