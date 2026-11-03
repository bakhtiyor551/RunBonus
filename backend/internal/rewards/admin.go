package rewards

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/notify"
)

func copyRow(r db.Row) httpx.M {
	m := httpx.M{}
	for k, v := range r {
		m[k] = v
	}
	return m
}

func AdminMilestones(ctx context.Context) ([]httpx.M, error) {
	rows, err := db.Query(ctx, db.Pool, `SELECT m.*,
			(SELECT COUNT(*) FROM milestone_rewards mr WHERE mr.milestone_id = m.id AND mr.active = 1) AS rewards_count,
			(SELECT COUNT(*) FROM user_rewards ur WHERE ur.milestone_id = m.id) AS unlocked_count
		FROM reward_milestones m ORDER BY m.distance_km ASC`)
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		links, err := db.Query(ctx, db.Pool, `SELECT mr.*, r.name AS reward_name, r.type AS reward_type
			FROM milestone_rewards mr JOIN rewards r ON r.id = mr.reward_id WHERE mr.milestone_id = ? ORDER BY mr.sort_order`, r["id"])
		if err != nil {
			return nil, err
		}
		m := copyRow(r)
		m["linked_rewards"] = links
		out = append(out, m)
	}
	return out, nil
}

func SaveMilestone(ctx context.Context, b httpx.Body, id int64) (int64, error) {
	status := b.Str("status")
	if status == "" {
		status = "active"
	}
	sortOrder := any(0)
	if v := b.Raw("sort_order"); v != nil {
		sortOrder = httpx.ToString(v)
	}
	args := []any{b.Raw("name"), rawStr(b.Raw("distance_km")), nilIfEmpty(b.Str("description")), status, sortOrder}
	if id != 0 {
		_, _, err := db.Exec(ctx, db.Pool, "UPDATE reward_milestones SET name=?, distance_km=?, description=?, status=?, sort_order=? WHERE id=?", append(args, id)...)
		return id, err
	}
	newID, _, err := db.Exec(ctx, db.Pool, "INSERT INTO reward_milestones (name, distance_km, description, status, sort_order) VALUES (?, ?, ?, ?, ?)", args...)
	return newID, err
}

func rawStr(v any) any {
	if v == nil {
		return nil
	}
	return httpx.ToString(v)
}

// SetMilestoneRewards — набор наград контрольной точки (sort 10, 20, …).
func SetMilestoneRewards(ctx context.Context, milestoneID int64, ids []any) error {
	if _, _, err := db.Exec(ctx, db.Pool, "DELETE FROM milestone_rewards WHERE milestone_id = ?", milestoneID); err != nil {
		return err
	}
	for i, rid := range ids {
		if _, _, err := db.Exec(ctx, db.Pool, "INSERT INTO milestone_rewards (milestone_id, reward_id, sort_order, active) VALUES (?, ?, ?, 1)",
			milestoneID, db.ToFloat(httpx.ToString(rid)), (i+1)*10); err != nil {
			return err
		}
	}
	return nil
}

func AdminCatalog(ctx context.Context) ([]httpx.M, error) {
	rows, err := db.Query(ctx, db.Pool, "SELECT * FROM rewards ORDER BY id DESC")
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		m := copyRow(r)
		for _, k := range []string{"size_options", "color_options"} {
			if s, ok := r[k].(string); ok {
				if l, ok := ParseList(s); ok {
					m[k] = l
				} else {
					m[k] = []any{}
				}
			}
		}
		stock, err := db.Query(ctx, db.Pool, "SELECT * FROM reward_stock WHERE reward_id = ? ORDER BY size, color", r["id"])
		if err != nil {
			return nil, err
		}
		m["stock_variants"] = stock
		m["available"] = math.Max(0, r.Float("stock")-r.Float("reserved"))
		out = append(out, m)
	}
	return out, nil
}

func jsonOrNil(v any) any {
	if !httpx.Truthy(v) {
		return nil
	}
	b, _ := json.Marshal(v)
	return string(b)
}

// orNum — data.x ?? def.
func orNum(b httpx.Body, k string, def any) any {
	if v := b.Raw(k); v != nil {
		return httpx.ToString(v)
	}
	return def
}

func SaveReward(ctx context.Context, b httpx.Body, id int64) (int64, error) {
	typ := b.Str("type")
	if typ == "" {
		typ = "PRODUCT"
	}
	active := 1
	if b.Raw("active") != nil && !b.Bool("active") {
		active = 0
	}
	requires := 0
	if b.Bool("requires_size") {
		requires = 1
	}
	args := []any{b.Raw("name"), typ, nilIfEmpty(b.Str("description")), nilIfEmpty(b.Str("image")), orNum(b, "stock", 0),
		orNum(b, "discount_percent", nil), orNum(b, "discount_min_amount", 0), orNum(b, "discount_max_amount", nil),
		orNum(b, "discount_valid_days", 30), orNum(b, "discount_usage_limit", 1), requires,
		jsonOrNil(b.Raw("size_options")), jsonOrNil(b.Raw("color_options")), orNum(b, "cost_amount", 0), active}
	if id != 0 {
		_, _, err := db.Exec(ctx, db.Pool, `UPDATE rewards SET name=?, type=?, description=?, image=?, stock=?,
			discount_percent=?, discount_min_amount=?, discount_max_amount=?, discount_valid_days=?, discount_usage_limit=?,
			requires_size=?, size_options=?, color_options=?, cost_amount=?, active=? WHERE id=?`, append(args, id)...)
		return id, err
	}
	newID, _, err := db.Exec(ctx, db.Pool, `INSERT INTO rewards (name, type, description, image, stock, discount_percent, discount_min_amount,
			discount_max_amount, discount_valid_days, discount_usage_limit, requires_size, size_options, color_options, cost_amount, active)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args...)
	return newID, err
}

func UpsertStock(ctx context.Context, rewardID float64, size, color string, qty float64) error {
	_, _, err := db.Exec(ctx, db.Pool, `INSERT INTO reward_stock (reward_id, size, color, quantity, reserved) VALUES (?, ?, ?, ?, 0)
		ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`, rewardID, size, color, qty)
	return err
}

func UserRewards(ctx context.Context, f map[string]string) ([]db.Row, error) {
	where := []string{"1=1"}
	var args []any
	add := func(cond string, vals ...any) {
		where = append(where, cond)
		args = append(args, vals...)
	}
	if v := f["status"]; v != "" {
		add("ur.status = ?", v)
	}
	if v := f["user_id"]; v != "" {
		add("ur.user_id = ?", v)
	}
	if v := f["milestone_id"]; v != "" {
		add("ur.milestone_id = ?", v)
	}
	if v := f["q"]; v != "" {
		q := "%" + v + "%"
		add("(u.name LIKE ? OR u.phone LIKE ? OR r.name LIKE ?)", q, q, q)
	}
	if v := f["city"]; v != "" {
		add("rd.city = ?", v)
	}
	return db.Query(ctx, db.Pool, `SELECT ur.*,
			u.name AS user_name, u.phone AS user_phone, u.total_distance_km,
			m.name AS milestone_name, m.distance_km,
			r.name AS reward_name, r.type AS reward_type, r.cost_amount,
			rd.size, rd.color, rd.city, rd.address, rd.phone AS delivery_phone,
			rd.delivery_status, rd.tracking_number, rd.admin_comment AS delivery_comment,
			rpc.code AS promo_code, rpc.status AS promo_status, rpc.expires_at
		FROM user_rewards ur
		JOIN users u ON u.id = ur.user_id
		JOIN reward_milestones m ON m.id = ur.milestone_id
		LEFT JOIN rewards r ON r.id = ur.reward_id
		LEFT JOIN reward_delivery rd ON rd.user_reward_id = ur.id
		LEFT JOIN reward_promo_codes rpc ON rpc.user_reward_id = ur.id
		WHERE `+strings.Join(where, " AND ")+` ORDER BY ur.updated_at DESC LIMIT 500`, args...)
}

var deliveryStatus = map[string]string{"PROCESSING": "processing", "READY": "ready", "DELIVERED": "delivered", "CANCELLED": "cancelled"}

func UpdateUserRewardStatus(ctx context.Context, id int64, status string, comment, tracking any) (any, error) {
	switch status {
	case "AVAILABLE", "SELECTED", "PROCESSING", "READY", "DELIVERED", "CANCELLED":
	default:
		return nil, cerr("BAD_STATUS", "Некорректный статус")
	}
	var userID int64
	err := db.Tx(ctx, func(tx *sql.Tx) error {
		ur, err := db.One(ctx, tx, "SELECT * FROM user_rewards WHERE id = ? FOR UPDATE", id)
		if err != nil {
			return err
		}
		if ur == nil {
			return cerr("NOT_FOUND", "Запись не найдена")
		}
		userID = ur.Int("user_id")
		set, args := "status = ?", []any{status}
		if comment != nil {
			set += ", admin_comment = ?"
			args = append(args, httpx.ToString(comment))
		}
		if status == "READY" || status == "PROCESSING" {
			set += ", processed_at = COALESCE(processed_at, NOW())"
		}
		if status == "DELIVERED" {
			set += ", delivered_at = NOW()"
		}
		if _, _, err := db.Exec(ctx, tx, "UPDATE user_rewards SET "+set+" WHERE id = ?", append(args, id)...); err != nil {
			return err
		}
		if ds, ok := deliveryStatus[status]; ok {
			if _, _, err := db.Exec(ctx, tx, `UPDATE reward_delivery SET delivery_status = ?, tracking_number = COALESCE(?, tracking_number),
				admin_comment = COALESCE(?, admin_comment) WHERE user_reward_id = ?`, ds, truthyOrNil(tracking), truthyOrNil(comment), id); err != nil {
				return err
			}
		}
		if status == "DELIVERED" && ur["reward_id"] != nil {
			reward, err := db.One(ctx, tx, "SELECT * FROM rewards WHERE id = ?", ur["reward_id"])
			if err != nil {
				return err
			}
			del, err := db.One(ctx, tx, "SELECT size FROM reward_delivery WHERE user_reward_id = ?", id)
			if err != nil {
				return err
			}
			if reward != nil && reward.Str("type") != "DISCOUNT" {
				if reward.Bool("requires_size") && del != nil && del.Str("size") != "" {
					_, _, err = db.Exec(ctx, tx, `UPDATE reward_stock SET quantity = GREATEST(0, quantity - 1), reserved = GREATEST(0, reserved - 1)
						WHERE reward_id = ? AND size = ?`, reward["id"], del["size"])
				} else {
					_, _, err = db.Exec(ctx, tx, "UPDATE rewards SET stock = GREATEST(0, stock - 1), reserved = GREATEST(0, reserved - 1) WHERE id = ?", reward["id"])
				}
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	title, body := "🎁 Статус награды", "Статус вашей награды обновлён"
	switch status {
	case "PROCESSING":
		title, body = "🎁 Награда в обработке", "Ваша награда принята и отправлена на обработку."
	case "READY":
		title, body = "✅ Награда готова", "Ваша награда готова к получению."
	case "DELIVERED":
		title, body = "✅ Награда получена", "Ваша награда отмечена как полученная."
	}
	notify.ToUserAsync(userID, notify.Push{Title: title, Body: body, Data: map[string]string{
		"type": "reward_status", "user_reward_id": fmt.Sprint(id), "status": status, "path": "/my-rewards"}})
	rows, err := UserRewards(ctx, nil)
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		if r.Int("id") == id {
			return r, nil
		}
	}
	return nil, nil
}

func truthyOrNil(v any) any {
	if !httpx.Truthy(v) {
		return nil
	}
	return httpx.ToString(v)
}

func ChangeReward(ctx context.Context, urID int64, rewardID float64, size, comment string) error {
	return db.Tx(ctx, func(tx *sql.Tx) error {
		ur, err := db.One(ctx, tx, "SELECT * FROM user_rewards WHERE id = ? FOR UPDATE", urID)
		if err != nil {
			return err
		}
		if ur == nil {
			return cerr("NOT_FOUND", "Не найдено")
		}
		reward, err := db.One(ctx, tx, "SELECT * FROM rewards WHERE id = ?", rewardID)
		if err != nil {
			return err
		}
		if reward == nil {
			return cerr("NOT_FOUND", "Награда не найдена")
		}
		if _, _, err := db.Exec(ctx, tx, "UPDATE user_rewards SET reward_id = ?, status = 'PROCESSING', admin_comment = ?, processed_at = NOW() WHERE id = ?",
			rewardID, nilIfEmpty(comment), urID); err != nil {
			return err
		}
		if reward.Str("type") != "DISCOUNT" {
			_, _, err = db.Exec(ctx, tx, `INSERT INTO reward_delivery (user_reward_id, user_id, reward_id, size, delivery_status)
				VALUES (?, ?, ?, ?, 'processing')
				ON DUPLICATE KEY UPDATE reward_id = VALUES(reward_id), size = VALUES(size), delivery_status = 'processing'`,
				urID, ur["user_id"], rewardID, nilIfEmpty(size))
		}
		return err
	})
}

func PromoCodes(ctx context.Context, status string) ([]db.Row, error) {
	where, args := "1=1", []any{}
	if status != "" {
		where, args = "p.status = ?", []any{status}
	}
	return db.Query(ctx, db.Pool, `SELECT p.*, u.name AS user_name, u.phone AS user_phone, r.name AS reward_name, m.distance_km
		FROM reward_promo_codes p
		JOIN users u ON u.id = p.user_id JOIN rewards r ON r.id = p.reward_id JOIN reward_milestones m ON m.id = p.milestone_id
		WHERE `+where+` ORDER BY p.created_at DESC LIMIT 500`, args...)
}

func Stats(ctx context.Context) (httpx.M, error) {
	count := func(q string) (float64, error) {
		v, err := db.Scalar(ctx, db.Pool, q)
		return db.ToFloat(v), err
	}
	users, err := count("SELECT COUNT(*) AS c FROM users")
	if err != nil {
		return nil, err
	}
	ms, err := db.Query(ctx, db.Pool, `SELECT m.id, m.name, m.distance_km,
			(SELECT COUNT(DISTINCT ur.user_id) FROM user_rewards ur WHERE ur.milestone_id = m.id) AS reached
		FROM reward_milestones m WHERE m.status = 'active' ORDER BY m.distance_km`)
	if err != nil {
		return nil, err
	}
	selected, _ := count(`SELECT COUNT(*) AS c FROM user_rewards WHERE status IN ('SELECTED','PROCESSING','READY','DELIVERED') AND reward_id IS NOT NULL`)
	delivered, _ := count("SELECT COUNT(*) AS c FROM user_rewards WHERE status = 'DELIVERED'")
	promos, _ := count("SELECT COUNT(*) AS c FROM reward_promo_codes WHERE status = 'ACTIVE'")
	cost, _ := count(`SELECT COALESCE(SUM(r.cost_amount), 0) AS c FROM user_rewards ur JOIN rewards r ON r.id = ur.reward_id
		WHERE ur.status IN ('PROCESSING','READY','DELIVERED') AND r.type <> 'DISCOUNT'`)
	stock, err := db.Query(ctx, db.Pool, `SELECT id, name, stock, reserved, (stock - reserved) AS available, cost_amount
		FROM rewards WHERE type IN ('PRODUCT','SPECIAL','VIP') AND active = 1`)
	if err != nil {
		return nil, err
	}
	list := make([]httpx.M, 0, len(ms))
	for _, m := range ms {
		list = append(list, httpx.M{"id": m["id"], "name": m["name"], "distanceKm": m.Float("distance_km"), "reached": m.Float("reached")})
	}
	return httpx.M{"totalUsers": users, "milestones": list, "selectedCount": selected, "deliveredCount": delivered,
		"activePromoCount": promos, "giftCostTotal": cost, "stock": stock}, nil
}

type GiftInput struct {
	UserID, MilestoneID  int64
	RewardID             int64
	Size, Color, Comment string
}

// Gift — adminGiftReward: открыть контрольную точку и, опционально, выдать конкретную награду.
func Gift(ctx context.Context, in GiftInput) (httpx.M, error) {
	comment := in.Comment
	if comment == "" {
		comment = "Подарок от администратора"
	}
	var user, milestone, reward, ur db.Row
	status := "AVAILABLE"
	var promo any
	err := db.Tx(ctx, func(tx *sql.Tx) error {
		var err error
		if user, err = db.One(ctx, tx, "SELECT id, name, phone, status FROM users WHERE id = ? FOR UPDATE", in.UserID); err != nil {
			return err
		}
		if user == nil {
			return cerr("NOT_FOUND", "Пользователь не найден")
		}
		if user.Str("status") == "blocked" {
			return cerr("BLOCKED", "Аккаунт заблокирован")
		}
		if milestone, err = db.One(ctx, tx, "SELECT * FROM reward_milestones WHERE id = ? FOR UPDATE", in.MilestoneID); err != nil {
			return err
		}
		if milestone == nil {
			return cerr("NOT_FOUND", "Контрольная точка не найдена")
		}
		if _, _, err := db.Exec(ctx, tx, `INSERT INTO user_rewards (user_id, milestone_id, status, admin_comment) VALUES (?, ?, 'AVAILABLE', ?)
			ON DUPLICATE KEY UPDATE admin_comment = COALESCE(VALUES(admin_comment), admin_comment)`, in.UserID, in.MilestoneID, comment); err != nil {
			return err
		}
		if ur, err = db.One(ctx, tx, "SELECT * FROM user_rewards WHERE user_id = ? AND milestone_id = ? FOR UPDATE", in.UserID, in.MilestoneID); err != nil {
			return err
		}
		if ur == nil {
			return cerr("CREATE_FAILED", "Не удалось создать награду")
		}
		switch ur.Str("status") {
		case "SELECTED", "PROCESSING", "READY", "DELIVERED":
			if ur["reward_id"] != nil {
				return cerr("ALREADY_SELECTED", "У пользователя уже есть выбранная/выданная награда по этой точке. Сначала отмените её.")
			}
		}
		if in.RewardID == 0 {
			_, _, err := db.Exec(ctx, tx, "UPDATE user_rewards SET status = 'AVAILABLE', reward_id = NULL, admin_comment = COALESCE(?, admin_comment) WHERE id = ?", comment, ur["id"])
			return err
		}
		if reward, err = db.One(ctx, tx, "SELECT * FROM rewards WHERE id = ? AND active = 1 FOR UPDATE", in.RewardID); err != nil {
			return err
		}
		if reward == nil {
			return cerr("NOT_FOUND", "Награда не найдена или неактивна")
		}
		var size any
		sizeStr := ""
		if reward.Bool("requires_size") {
			sizeStr = strings.ToUpper(in.Size)
			if sizeStr == "" {
				return cerr("SIZE_REQUIRED", "Укажите размер")
			}
			size = sizeStr
		} else if in.Size != "" {
			size, sizeStr = in.Size, in.Size
		}
		if err := reserveStock(ctx, tx, reward, sizeStr, in.Color); err != nil {
			return err
		}
		if reward.Str("type") == "DISCOUNT" {
			status = "DELIVERED"
			days := reward.Float("discount_valid_days")
			if days == 0 {
				days = 30
			}
			code := "GIFT" + jsNumStr(milestone["distance_km"]) + "-" + strings.ToUpper(NanoID(6))
			promo = code
			if _, _, err := db.Exec(ctx, tx, `UPDATE user_rewards SET reward_id = ?, status = ?, selected_at = NOW(), delivered_at = NOW(),
				promo_code = ?, admin_comment = ?, processed_at = NOW() WHERE id = ?`, in.RewardID, status, code, comment, ur["id"]); err != nil {
				return err
			}
			minAmount := reward["discount_min_amount"]
			if minAmount == nil {
				minAmount = 0
			}
			_, _, err := db.Exec(ctx, tx, `INSERT INTO reward_promo_codes
				(user_reward_id, user_id, reward_id, milestone_id, code, discount_percent, min_amount, max_amount, status, expires_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`, ur["id"], in.UserID, in.RewardID, in.MilestoneID, code,
				reward["discount_percent"], minAmount, reward["discount_max_amount"], time.Now().Add(time.Duration(days*float64(24*time.Hour))))
			return err
		}
		status = "PROCESSING"
		if _, _, err := db.Exec(ctx, tx, `UPDATE user_rewards SET reward_id = ?, status = ?, selected_at = NOW(), processed_at = NOW(), admin_comment = ? WHERE id = ?`,
			in.RewardID, status, comment, ur["id"]); err != nil {
			return err
		}
		_, _, err = db.Exec(ctx, tx, `INSERT INTO reward_delivery (user_reward_id, user_id, reward_id, size, color, phone, delivery_status, admin_comment)
			VALUES (?, ?, ?, ?, ?, ?, 'processing', ?)
			ON DUPLICATE KEY UPDATE reward_id = VALUES(reward_id), size = VALUES(size), color = VALUES(color),
				delivery_status = 'processing', admin_comment = VALUES(admin_comment)`,
			ur["id"], in.UserID, in.RewardID, size, nilIfEmpty(in.Color), user["phone"], comment)
		return err
	})
	if err != nil {
		return nil, err
	}

	data := map[string]string{"type": "reward_gifted", "milestone_id": fmt.Sprint(in.MilestoneID), "path": "/my-rewards"}
	switch {
	case in.RewardID == 0:
		data["path"] = fmt.Sprintf("/rewards?milestone=%d", in.MilestoneID)
		notify.ToUserAsync(in.UserID, notify.Push{Title: "🎁 Новая награда!", Body: "Вам открыта награда «" + milestone.Str("name") + "». Выберите подарок.", Data: data})
	case reward.Str("type") == "DISCOUNT":
		notify.ToUserAsync(in.UserID, notify.Push{Title: "🎁 Подарок от RunBonus!", Body: "Вам подарили «" + reward.Str("name") + "». Промокод в разделе «Мои награды».", Data: data})
	default:
		notify.ToUserAsync(in.UserID, notify.Push{Title: "🎁 Подарок от RunBonus!", Body: "Вам подарили «" + reward.Str("name") + "».", Data: data})
	}
	if reward != nil && reward.Str("type") != "DISCOUNT" {
		notify.TelegramAsync(fmt.Sprintf("🎁 <b>ПОДАРОК ОТ АДМИНА</b>\n\nПользователь:\n%s\n\nТелефон:\n%s\n\nТочка:\n%s (%s км)\n\nНаграда:\n%s\n\nСтатус:\n%s\nID: #%v",
			orDash(user.Str("name")), orDash(user.Str("phone")), milestone.Str("name"), milestone.Str("distance_km"), reward.Str("name"), status, ur["id"]))
	}
	var rewardID, rewardName any
	if in.RewardID != 0 {
		rewardID = in.RewardID
	}
	if reward != nil {
		rewardName = reward["name"]
	}
	return httpx.M{"userRewardId": ur["id"], "userId": in.UserID, "userName": user["name"], "phone": user["phone"],
		"milestoneId": in.MilestoneID, "milestoneName": milestone["name"], "status": status,
		"rewardId": rewardID, "rewardName": rewardName, "promoCode": promo}, nil
}

// IsNotFound — ошибка с кодом NOT_FOUND (для статуса 404 в маршрутах).
func IsNotFound(err error) bool {
	ce, ok := err.(*codedErr)
	return ok && ce.Code == "NOT_FOUND"
}
