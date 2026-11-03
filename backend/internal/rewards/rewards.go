package rewards

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strings"
	"time"

	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/notify"
)

// codedErr — ошибка с кодом без статуса (как err.code в rewardService); статус выбирает маршрут.
type codedErr struct{ Code, Msg string }

func (e *codedErr) Error() string { return e.Msg }

func cerr(code, msg string) error { return &codedErr{Code: code, Msg: msg} }

// Options — варианты наград для одного набора строк rewards (milestone_rewards / challenge_level_rewards).
func Options(ctx context.Context, rows []db.Row, lenientSizes bool) ([]httpx.M, error) {
	options := []httpx.M{}
	for _, r := range rows {
		inStock := true
		var stockLeft any
		var sizes any
		typ := r.Str("type")
		switch {
		case typ == "DISCOUNT":
		case r.Bool("requires_size"):
			stockRows, err := db.Query(ctx, db.Pool, "SELECT size, quantity, reserved FROM reward_stock WHERE reward_id = ?", r["id"])
			if err != nil {
				return nil, err
			}
			opts, ok := ParseList(r["size_options"])
			if !ok {
				if lenientSizes {
					opts = []any{}
				} else {
					return nil, fmt.Errorf("size_options: invalid JSON")
				}
			}
			list := make([]httpx.M, 0, len(opts))
			total := 0.0
			any := false
			for _, sz := range opts {
				left := 0.0
				for _, s := range stockRows {
					if s["size"] == sz {
						left = math.Max(0, s.Float("quantity")-s.Float("reserved"))
						break
					}
				}
				list = append(list, httpx.M{"size": sz, "available": left, "inStock": left > 0})
				total += left
				any = any || left > 0
			}
			sizes, inStock, stockLeft = list, any, total
		default:
			left := math.Max(0, r.Float("stock")-r.Float("reserved"))
			stockLeft, inStock = left, left > 0
		}

		var colors any
		if arr, ok := ParseList(r["color_options"]); ok && r["color_options"] != nil && r.Str("color_options") != "" && len(arr) > 0 {
			colors = arr
		}
		var discount any
		if r["discount_percent"] != nil {
			discount = r.Float("discount_percent")
		}
		if typ == "DISCOUNT" {
			stockLeft = nil
		}
		var reason any
		if !inStock {
			reason = "Временно нет в наличии"
		}
		options = append(options, httpx.M{
			"id": r["id"], "name": r["name"], "type": r["type"], "description": r["description"], "image": r["image"],
			"requiresSize": r.Bool("requires_size"), "discountPercent": discount,
			"inStock": inStock, "stockLeft": stockLeft, "sizes": sizes,
			"colors": colors, "hasColors": colors != nil, "unavailableReason": reason,
		})
	}
	return options, nil
}

func findMilestone(progress httpx.M, key string) httpx.M {
	n := db.ToFloat(key)
	if strings.TrimSpace(key) == "" {
		n = 0
	}
	for _, m := range progress["milestones"].([]httpx.M) {
		if db.ToFloat(m["id"]) == n || db.ToFloat(m["distance"]) == n {
			return m
		}
	}
	return nil
}

// MilestoneOptions — getMilestoneRewardOptions.
func MilestoneOptions(ctx context.Context, userID int64, key string) (httpx.M, error) {
	progress, err := Progress(ctx, userID)
	if err != nil {
		return nil, err
	}
	m := findMilestone(progress, key)
	if m == nil {
		return nil, cerr("NOT_FOUND", "Контрольная точка не найдена")
	}
	rows, err := db.Query(ctx, db.Pool, `SELECT r.*, mr.sort_order AS link_sort
		FROM milestone_rewards mr JOIN rewards r ON r.id = mr.reward_id
		WHERE mr.milestone_id = ? AND mr.active = 1 AND r.active = 1
		ORDER BY mr.sort_order ASC, r.id ASC`, m["id"])
	if err != nil {
		return nil, err
	}
	opts, err := Options(ctx, rows, false)
	if err != nil {
		return nil, err
	}
	st := m["status"]
	return httpx.M{
		"milestone": httpx.M{"id": m["id"], "distance": m["distance"], "name": m["name"], "status": st},
		"canSelect": st == "AVAILABLE" || st == "CHOOSING",
		"selected":  m["reward"],
		"options":   opts,
	}, nil
}

// MyRewards — getMyRewards.
func MyRewards(ctx context.Context, userID int64) ([]httpx.M, error) {
	p, err := Progress(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := []httpx.M{}
	for _, m := range p["milestones"].([]httpx.M) {
		if s, _ := m["status"].(string); s == "" || s == "LOCKED" {
			continue
		}
		var promo any
		if rw, ok := m["reward"].(httpx.M); ok {
			promo = rw["promoCode"]
		}
		out = append(out, httpx.M{
			"id": m["id"], "milestone_id": m["id"], "name": m["name"], "distance": m["distance"],
			"status": m["status"], "reward": m["reward"], "promoCode": promo,
			"selectedAt": m["selectedAt"], "deliveredAt": m["deliveredAt"],
		})
	}
	return out, nil
}

// ListActiveMilestones — запасной список без прогресса.
func ListActiveMilestones(ctx context.Context) ([]httpx.M, error) {
	rows, err := db.Query(ctx, db.Pool, `SELECT id, name, distance_km, description, sort_order
		FROM reward_milestones WHERE status = 'active' ORDER BY distance_km ASC, sort_order ASC`)
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		out = append(out, httpx.M{"id": r["id"], "name": r["name"], "distance": r.Float("distance_km"), "description": r["description"]})
	}
	return out, nil
}

func availableQty(ctx context.Context, tx *sql.Tx, reward db.Row, size, color string) (float64, error) {
	if reward.Str("type") == "DISCOUNT" {
		return math.Inf(1), nil
	}
	left := func(r db.Row, a, b string) float64 { return math.Max(0, r.Float(a)-r.Float(b)) }
	if reward.Bool("requires_size") {
		r, err := db.One(ctx, tx, `SELECT quantity, reserved FROM reward_stock WHERE reward_id = ? AND size = ? AND color = '' FOR UPDATE`, reward["id"], size)
		if err != nil || r == nil {
			return 0, err
		}
		return left(r, "quantity", "reserved"), nil
	}
	if color != "" {
		r, err := db.One(ctx, tx, `SELECT quantity, reserved FROM reward_stock WHERE reward_id = ? AND size = '' AND color = ? FOR UPDATE`, reward["id"], color)
		if err != nil {
			return 0, err
		}
		if r != nil {
			return left(r, "quantity", "reserved"), nil
		}
	}
	r, err := db.One(ctx, tx, "SELECT stock, reserved FROM rewards WHERE id = ? FOR UPDATE", reward["id"])
	if err != nil || r == nil {
		return 0, err
	}
	return left(r, "stock", "reserved"), nil
}

func reserveStock(ctx context.Context, tx *sql.Tx, reward db.Row, size, color string) error {
	if reward.Str("type") == "DISCOUNT" {
		return nil
	}
	if reward.Bool("requires_size") {
		_, n, err := db.Exec(ctx, tx, `UPDATE reward_stock SET reserved = reserved + 1 WHERE reward_id = ? AND size = ? AND color = '' AND quantity > reserved`, reward["id"], size)
		if err != nil {
			return err
		}
		if n == 0 {
			return cerr("OUT_OF_STOCK", "Нет в наличии")
		}
		return nil
	}
	if color != "" {
		_, n, err := db.Exec(ctx, tx, `UPDATE reward_stock SET reserved = reserved + 1 WHERE reward_id = ? AND size = '' AND color = ? AND quantity > reserved`, reward["id"], color)
		if err != nil {
			return err
		}
		if n > 0 {
			return nil
		}
	}
	_, n, err := db.Exec(ctx, tx, "UPDATE rewards SET reserved = reserved + 1 WHERE id = ? AND stock > reserved", reward["id"])
	if err != nil {
		return err
	}
	if n == 0 {
		return cerr("OUT_OF_STOCK", "Нет в наличии")
	}
	return nil
}

// jsNumStr — `${Number(x)}` для DECIMAL-строк (50.00 → 50).
func jsNumStr(v any) string { return fmt.Sprint(db.ToFloat(v)) }

type SelectInput struct {
	MilestoneID, RewardID             int64
	Size, Color, Phone, Address, City string
	SizeGiven                         bool
}

// Select — selectReward.
func Select(ctx context.Context, userID int64, in SelectInput) (httpx.M, error) {
	var user, milestone, reward, ur db.Row
	var chosenSize any
	err := db.Tx(ctx, func(tx *sql.Tx) error {
		var err error
		if user, err = db.One(ctx, tx, "SELECT id, name, phone, status FROM users WHERE id = ? FOR UPDATE", userID); err != nil {
			return err
		}
		if user == nil {
			return cerr("NOT_FOUND", "Пользователь не найден")
		}
		if user.Str("status") == "blocked" {
			return cerr("BLOCKED", "Аккаунт заблокирован")
		}
		shoe, err := db.One(ctx, tx, "SELECT shoe_id AS id FROM user_active_shoes WHERE user_id = ? LIMIT 1", userID)
		if err != nil {
			return err
		}
		if shoe == nil {
			return cerr("NO_SHOE", "Сначала активируйте кроссовки RunBonus")
		}
		total, err := totalKm(ctx, tx, userID)
		if err != nil {
			return err
		}
		if milestone, err = db.One(ctx, tx, "SELECT * FROM reward_milestones WHERE id = ? AND status = 'active' FOR UPDATE", in.MilestoneID); err != nil {
			return err
		}
		if milestone == nil {
			return cerr("NOT_FOUND", "Контрольная точка не найдена")
		}
		selectUR := func() (db.Row, error) {
			return db.One(ctx, tx, "SELECT * FROM user_rewards WHERE user_id = ? AND milestone_id = ? FOR UPDATE", userID, in.MilestoneID)
		}
		if ur, err = selectUR(); err != nil {
			return err
		}
		if ur == nil {
			if total < milestone.Float("distance_km") {
				return cerr("LOCKED", "Километраж ещё не достигнут")
			}
			if _, _, err := db.Exec(ctx, tx, "INSERT INTO user_rewards (user_id, milestone_id, status) VALUES (?, ?, 'AVAILABLE')", userID, in.MilestoneID); err != nil {
				return err
			}
			if ur, err = selectUR(); err != nil {
				return err
			}
		}
		if ur == nil {
			return cerr("NOT_FOUND", "Достижение не найдено")
		}
		if s := ur.Str("status"); s != "AVAILABLE" && s != "CHOOSING" {
			return cerr("ALREADY_SELECTED", "Награда уже выбрана. Изменение только через администратора.")
		}
		link, err := db.One(ctx, tx, "SELECT id FROM milestone_rewards WHERE milestone_id = ? AND reward_id = ? AND active = 1", in.MilestoneID, in.RewardID)
		if err != nil {
			return err
		}
		if link == nil {
			return cerr("INVALID_REWARD", "Эта награда недоступна для данной контрольной точки")
		}
		if reward, err = db.One(ctx, tx, "SELECT * FROM rewards WHERE id = ? AND active = 1 FOR UPDATE", in.RewardID); err != nil {
			return err
		}
		if reward == nil {
			return cerr("NOT_FOUND", "Награда не найдена")
		}

		sizeStr := ""
		if reward.Bool("requires_size") {
			sizeStr = strings.ToUpper(in.Size)
			chosenSize = sizeStr
			allowed, ok := ParseList(reward["size_options"])
			if !ok {
				return fmt.Errorf("size_options: invalid JSON")
			}
			found := false
			for _, a := range allowed {
				if strings.ToUpper(httpx.ToString(a)) == sizeStr {
					found = true
				}
			}
			if sizeStr == "" || !found {
				return cerr("SIZE_REQUIRED", "Выберите размер")
			}
		} else if in.Size != "" {
			sizeStr, chosenSize = in.Size, in.Size
		}

		qty, err := availableQty(ctx, tx, reward, sizeStr, in.Color)
		if err != nil {
			return err
		}
		if qty <= 0 {
			return cerr("OUT_OF_STOCK", "Нет в наличии")
		}
		if err := reserveStock(ctx, tx, reward, sizeStr, in.Color); err != nil {
			return err
		}

		if reward.Str("type") == "DISCOUNT" {
			days := reward.Float("discount_valid_days")
			if days == 0 {
				days = 30
			}
			expires := time.Now().Add(time.Duration(days * float64(24*time.Hour)))
			promo := "RUN" + jsNumStr(milestone["distance_km"]) + "-" + strings.ToUpper(NanoID(6))
			if _, _, err := db.Exec(ctx, tx, `UPDATE user_rewards SET reward_id = ?, status = ?, selected_at = NOW(), delivered_at = NOW(), promo_code = ? WHERE id = ?`,
				in.RewardID, "DELIVERED", promo, ur["id"]); err != nil {
				return err
			}
			minAmount := reward["discount_min_amount"]
			if db.ToFloat(minAmount) == 0 {
				minAmount = 0
			}
			_, _, err = db.Exec(ctx, tx, `INSERT INTO reward_promo_codes
				(user_reward_id, user_id, reward_id, milestone_id, code, discount_percent, min_amount, max_amount, status, expires_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
				ur["id"], userID, in.RewardID, in.MilestoneID, promo, reward["discount_percent"], minAmount, reward["discount_max_amount"], expires)
			return err
		}
		if _, _, err := db.Exec(ctx, tx, `UPDATE user_rewards SET reward_id = ?, status = ?, selected_at = NOW(), processed_at = NOW() WHERE id = ?`,
			in.RewardID, "PROCESSING", ur["id"]); err != nil {
			return err
		}
		phone := in.Phone
		if phone == "" {
			phone = user.Str("phone")
		}
		_, _, err = db.Exec(ctx, tx, `INSERT INTO reward_delivery
			(user_reward_id, user_id, reward_id, size, color, phone, address, city, delivery_status)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')
			ON DUPLICATE KEY UPDATE size = VALUES(size), color = VALUES(color), phone = VALUES(phone),
				address = VALUES(address), city = VALUES(city), delivery_status = 'new'`,
			ur["id"], userID, in.RewardID, chosenSize, nilIfEmpty(in.Color), nilIfEmpty(phone), nilIfEmpty(in.Address), nilIfEmpty(in.City))
		return err
	})
	if err != nil {
		return nil, err
	}

	if reward.Str("type") != "DISCOUNT" {
		sizeLine, colorLine := "", ""
		if s, _ := chosenSize.(string); s != "" {
			sizeLine = "\n👕 Размер: <b>" + s + "</b>"
		}
		if in.Color != "" {
			colorLine = "\n🎨 Цвет: <b>" + in.Color + "</b>"
		}
		notify.TelegramAsync(fmt.Sprintf("🎁 <b>НОВАЯ НАГРАДА</b>\n\nПользователь:\n%s\n\nТелефон:\n%s\n\nДостижение:\n%s (%s км)\n\nНаграда:\n%s%s%s\n\nСтатус:\nНовая заявка\nID: #%v",
			orDash(user.Str("name")), orDash(user.Str("phone")), milestone.Str("name"), milestone.Str("distance_km"),
			reward.Str("name"), sizeLine, colorLine, ur["id"]))
	}
	notify.ToUserAsync(userID, notify.Push{
		Title: "🎁 Награда выбрана",
		Body:  "Ваша награда принята и отправлена на обработку.",
		Data:  map[string]string{"type": "reward_selected", "milestone_id": fmt.Sprint(in.MilestoneID), "path": "/my-rewards"},
	})
	return MilestoneOptions(ctx, userID, fmt.Sprint(in.MilestoneID))
}

func totalKm(ctx context.Context, q db.Querier, userID int64) (float64, error) {
	v, err := db.Scalar(ctx, q, `SELECT COALESCE(SUM(distance_km), 0) AS total FROM workouts WHERE user_id = ? AND status = 'approved'`, userID)
	return roundKm(db.ToFloat(v)), err
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func orDash(s string) string {
	if s == "" {
		return "—"
	}
	return s
}

// NotifyUnlocked — push о каждой открытой контрольной точке.
func NotifyUnlocked(userID int64, unlocked []db.Row) {
	if len(unlocked) == 0 {
		return
	}
	var labels []string
	for _, m := range unlocked {
		km := jsNumStr(m["distance_km"])
		notify.ToUserAsync(userID, notify.Push{
			Title: "🎉 Новая награда!",
			Body:  "Вы достигли " + km + " км. Вам доступна новая награда!",
			Data: map[string]string{
				"type": "reward_unlocked", "milestone_id": m.Str("id"), "distance": km,
				"path": "/rewards?milestone=" + m.Str("id"),
			},
		})
		labels = append(labels, m.Str("distance_km")+"km")
	}
	fmt.Printf("[rewards] user=%d unlocked: %s\n", userID, strings.Join(labels, ", "))
}
