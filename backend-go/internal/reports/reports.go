// Package reports — отчёты админки и утренний Telegram-отчёт.
package reports

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"runbonus/api/internal/db"
	"runbonus/api/internal/gps"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/util"
)

// Period — parseReportPeriod: ?period=today|yesterday|7d|30d|month|last_month|year|custom&from=&to=.
type Period struct {
	Preset     string
	Start, End time.Time
}

func (p Period) JSON() httpx.M {
	return httpx.M{"preset": p.Preset, "start": db.ISO(p.Start), "end": db.ISO(p.End)}
}

func startOfDay(t time.Time) time.Time {
	t = t.Local()
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.Local)
}

func endOfDay(t time.Time) time.Time {
	t = t.Local()
	return time.Date(t.Year(), t.Month(), t.Day(), 23, 59, 59, int(999*time.Millisecond), time.Local)
}

func ParsePeriod(q map[string]string) Period {
	preset := strings.ToLower(util.FirstNonEmpty(q["period"], q["preset"], "30d"))
	now := time.Now()
	end := endOfDay(now)
	if q["to"] != "" {
		if t, ok := gps.ParseJSDate(q["to"]); ok {
			end = endOfDay(t)
		}
	}
	back := func(days int) time.Time { return startOfDay(end.AddDate(0, 0, -days)) }
	switch preset {
	case "today":
		return Period{preset, startOfDay(now), end}
	case "yesterday":
		d := now.AddDate(0, 0, -1)
		return Period{preset, startOfDay(d), endOfDay(d)}
	case "7d":
		return Period{preset, back(6), end}
	case "month", "this_month":
		return Period{preset, time.Date(end.Year(), end.Month(), 1, 0, 0, 0, 0, time.Local), end}
	case "last_month":
		first := time.Date(end.Year(), end.Month()-1, 1, 0, 0, 0, 0, time.Local)
		last := time.Date(end.Year(), end.Month(), 0, 23, 59, 59, int(999*time.Millisecond), time.Local)
		return Period{preset, first, last}
	case "year":
		return Period{preset, time.Date(end.Year(), 1, 1, 0, 0, 0, 0, time.Local), end}
	case "custom":
		start := startOfDay(now)
		if q["from"] != "" {
			if t, ok := gps.ParseJSDate(q["from"]); ok {
				start = startOfDay(t)
			}
		}
		return Period{preset, start, end}
	default: // 30d и неизвестные
		return Period{preset, back(29), end}
	}
}

var incomeStatuses = []any{"new", "confirmed", "paid", "delivered", "qr_issued"}

const incomeIn = "(?, ?, ?, ?, ?)"

func n(v any) float64 { return util.Round(db.ToFloat(v), 2) }

func one(ctx context.Context, q string, args ...any) (db.Row, error) {
	r, err := db.One(ctx, db.Pool, q, args...)
	if r == nil {
		r = db.Row{}
	}
	return r, err
}

func shopIncome(ctx context.Context, start, end time.Time) (float64, float64, error) {
	r, err := one(ctx, `SELECT COALESCE(SUM(o.total_amount), 0) AS total, COALESCE(SUM(o.quantity), 0) AS pairs
		FROM shop_orders o WHERE o.status IN `+incomeIn+` AND o.created_at >= ? AND o.created_at <= ?`,
		append(append([]any{}, incomeStatuses...), start, end)...)
	return n(r["total"]), r.Float("pairs"), err
}

func bonusEarned(ctx context.Context, start, end time.Time) float64 {
	r, err := one(ctx, "SELECT COALESCE(SUM(amount), 0) AS t FROM user_bonus_transactions WHERE type = 'earn' AND created_at >= ? AND created_at <= ?", start, end)
	if err != nil {
		r, _ = one(ctx, "SELECT COALESCE(SUM(amount), 0) AS t FROM bonuses WHERE type = 'earn' AND created_at >= ? AND created_at <= ?", start, end)
	}
	return n(r["t"])
}

func bonusSpent(ctx context.Context, start, end time.Time) float64 {
	r, err := one(ctx, `SELECT COALESCE(SUM(ABS(amount)), 0) AS t FROM user_bonus_transactions
		WHERE type IN ('spend', 'withdraw_success') AND created_at >= ? AND created_at <= ?`, start, end)
	if err != nil {
		return 0
	}
	return n(r["t"])
}

func adRevenue(ctx context.Context, start, end time.Time) (float64, error) {
	r, err := one(ctx, `SELECT COALESCE(SUM(amount), 0) AS t FROM ad_payments
		WHERE status = 'paid' AND paid_at IS NOT NULL AND paid_at >= ? AND paid_at <= ?`, start, end)
	if db.IsNoTable(err) {
		return 0, nil
	}
	return n(r["t"]), err
}

type userCounts struct{ total, blocked, active, newRecent float64 }

func countUsers(ctx context.Context) (userCounts, error) {
	var c userCounts
	since := time.Now().AddDate(0, 0, -30)
	scalar := func(q string, args ...any) float64 {
		v, _ := db.Scalar(ctx, db.Pool, q, args...)
		return db.ToFloat(v)
	}
	c.total = scalar("SELECT COUNT(*) AS c FROM users")
	c.blocked = scalar("SELECT COUNT(*) AS c FROM users WHERE status = 'blocked'")
	c.active = scalar("SELECT COUNT(DISTINCT w.user_id) AS c FROM workouts w WHERE w.started_at >= ? AND w.status = 'approved'", since)
	c.newRecent = scalar("SELECT COUNT(*) AS c FROM users WHERE created_at >= ?", since)
	return c, nil
}

func Dashboard(ctx context.Context, q map[string]string) (httpx.M, error) {
	p := ParsePeriod(q)
	revenue, pairs, err := shopIncome(ctx, p.Start, p.End)
	if err != nil {
		return nil, err
	}
	ads, err := adRevenue(ctx, p.Start, p.End)
	if err != nil {
		return nil, err
	}
	income := util.Round(revenue+ads, 2)
	expense := bonusEarned(ctx, p.Start, p.End)
	users, _ := countUsers(ctx)
	km, err := one(ctx, "SELECT COALESCE(SUM(distance_km), 0) AS km, COUNT(*) AS cnt FROM workouts w WHERE w.status = 'approved' AND w.started_at >= ? AND w.started_at <= ?", p.Start, p.End)
	if err != nil {
		return nil, err
	}
	day := startOfDay(time.Now())
	totals := httpx.M{}
	for k, from := range map[string]time.Time{
		"day": day, "week": day.AddDate(0, 0, -6),
		"month": time.Date(day.Year(), day.Month(), 1, 0, 0, 0, 0, time.Local), "year": time.Date(day.Year(), 1, 1, 0, 0, 0, 0, time.Local),
	} {
		_, pr, err := shopIncome(ctx, from, p.End)
		if err != nil {
			return nil, err
		}
		totals[k] = pr
	}
	return httpx.M{
		"period": p.JSON(),
		"cards": httpx.M{"total_clients": users.total, "active_clients": users.active, "shoes_sold_pairs": pairs,
			"total_km": n(km["km"]), "bonuses_earned": expense, "income": income, "expense": expense,
			"profit": util.Round(income-expense, 2), "ad_revenue": ads, "shop_revenue": revenue},
		"sales_totals": totals,
	}, nil
}

func mapRows(rows []db.Row, fn func(db.Row, httpx.M)) []httpx.M {
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		m := httpx.M{}
		for k, v := range r {
			m[k] = v
		}
		fn(r, m)
		out = append(out, m)
	}
	return out
}

func Sales(ctx context.Context, q map[string]string) (httpx.M, error) {
	p := ParsePeriod(q)
	rows, err := db.Query(ctx, db.Pool, `SELECT o.id, o.created_at, p.name AS model_name, o.size, o.order_color AS color,
			o.quantity, o.price, o.total_amount, o.status, o.customer_name, o.phone
		FROM shop_orders o JOIN products p ON p.id = o.product_id
		WHERE o.created_at >= ? AND o.created_at <= ? ORDER BY o.created_at DESC LIMIT 500`, p.Start, p.End)
	if err != nil {
		return nil, err
	}
	revenue, pairs, err := shopIncome(ctx, p.Start, p.End)
	if err != nil {
		return nil, err
	}
	chart, err := db.Query(ctx, db.Pool, `SELECT DATE(o.created_at) AS d, COUNT(*) AS orders, COALESCE(SUM(o.total_amount), 0) AS revenue
		FROM shop_orders o WHERE o.status IN `+incomeIn+` AND o.created_at >= ? AND o.created_at <= ?
		GROUP BY DATE(o.created_at) ORDER BY d`, append(append([]any{}, incomeStatuses...), p.Start, p.End)...)
	if err != nil {
		return nil, err
	}
	charts := make([]httpx.M, 0, len(chart))
	for _, c := range chart {
		charts = append(charts, httpx.M{"date": c["d"], "orders": c.Float("orders"), "revenue": n(c["revenue"])})
	}
	return httpx.M{
		"period": p.JSON(),
		"rows": mapRows(rows, func(r db.Row, m httpx.M) {
			m["price"], m["total_amount"] = n(r["price"]), n(r["total_amount"])
			if q := r.Float("quantity"); q != 0 {
				m["quantity"] = q
			} else {
				m["quantity"] = 1
			}
		}),
		"totals": httpx.M{"pairs": pairs, "revenue": revenue},
		"charts": charts,
	}, nil
}

func Workouts(ctx context.Context, q map[string]string) (httpx.M, error) {
	p := ParsePeriod(q)
	st, err := one(ctx, `SELECT COUNT(*) AS total, SUM(status = 'approved') AS approved, SUM(status = 'rejected') AS rejected,
			SUM(status = 'suspicious') AS suspicious,
			COALESCE(SUM(CASE WHEN status = 'approved' THEN distance_km ELSE 0 END), 0) AS total_km
		FROM workouts w WHERE w.started_at >= ? AND w.started_at <= ?`, p.Start, p.End)
	if err != nil {
		return nil, err
	}
	topKm, err := db.Query(ctx, db.Pool, `SELECT u.id, u.name, u.phone, COALESCE(SUM(w.distance_km), 0) AS km
		FROM workouts w JOIN users u ON u.id = w.user_id
		WHERE w.status = 'approved' AND w.started_at >= ? AND w.started_at <= ?
		GROUP BY u.id ORDER BY km DESC LIMIT 10`, p.Start, p.End)
	if err != nil {
		return nil, err
	}
	topBonus, err := db.Query(ctx, db.Pool, `SELECT u.id, u.name, u.phone, COALESCE(SUM(t.amount), 0) AS bonus
		FROM user_bonus_transactions t JOIN users u ON u.id = t.user_id JOIN workouts w ON w.id = t.workout_id
		WHERE t.type = 'earn' AND w.status = 'approved' AND w.started_at >= ? AND w.started_at <= ?
		GROUP BY u.id ORDER BY bonus DESC LIMIT 10`, p.Start, p.End)
	if err != nil {
		if topBonus, err = db.Query(ctx, db.Pool, `SELECT u.id, u.name, u.phone, COALESCE(SUM(w.calculated_bonus), 0) AS bonus
			FROM workouts w JOIN users u ON u.id = w.user_id
			WHERE w.status = 'approved' AND w.started_at >= ? AND w.started_at <= ?
			GROUP BY u.id ORDER BY bonus DESC LIMIT 10`, p.Start, p.End); err != nil {
			return nil, err
		}
	}
	chart, err := db.Query(ctx, db.Pool, `SELECT DATE(started_at) AS d, COUNT(*) AS workouts,
			COALESCE(SUM(CASE WHEN status = 'approved' THEN distance_km ELSE 0 END), 0) AS km
		FROM workouts w WHERE w.started_at >= ? AND w.started_at <= ? GROUP BY DATE(started_at) ORDER BY d`, p.Start, p.End)
	if err != nil {
		return nil, err
	}
	approved, totalKm := st.Float("approved"), n(st["total_km"])
	avg := 0.0
	if approved > 0 {
		avg = util.Round(totalKm/approved, 2)
	}
	charts := make([]httpx.M, 0, len(chart))
	for _, c := range chart {
		charts = append(charts, httpx.M{"date": c["d"], "workouts": c.Float("workouts"), "km": n(c["km"])})
	}
	return httpx.M{
		"period": p.JSON(),
		"summary": httpx.M{"total": st.Float("total"), "approved": approved, "rejected": st.Float("rejected"),
			"suspicious": st.Float("suspicious"), "total_km": totalKm, "avg_km": avg},
		"top_by_km":    mapRows(topKm, func(r db.Row, m httpx.M) { m["km"] = n(r["km"]) }),
		"top_by_bonus": mapRows(topBonus, func(r db.Row, m httpx.M) { m["bonus"] = n(r["bonus"]) }),
		"charts":       charts,
	}, nil
}

func Bonuses(ctx context.Context, q map[string]string) (httpx.M, error) {
	p := ParsePeriod(q)
	earned, spent := bonusEarned(ctx, p.Start, p.End), bonusSpent(ctx, p.Start, p.End)
	fund, _ := one(ctx, "SELECT current_balance FROM accounts WHERE type = 'bonus_fund' LIMIT 1")
	clients, err := db.Scalar(ctx, db.Pool, "SELECT COUNT(*) AS c FROM users WHERE status != 'blocked'")
	if err != nil {
		return nil, err
	}
	count := db.ToFloat(clients)
	if count == 0 {
		count = 1
	}
	chart, err := db.Query(ctx, db.Pool, `SELECT DATE(created_at) AS d, COALESCE(SUM(amount), 0) AS earned
		FROM user_bonus_transactions WHERE type = 'earn' AND created_at >= ? AND created_at <= ?
		GROUP BY DATE(created_at) ORDER BY d`, p.Start, p.End)
	if err != nil {
		chart = nil
	}
	list := make([]httpx.M, 0, len(chart))
	for _, c := range chart {
		list = append(list, httpx.M{"date": c["d"], "amount": n(c["earned"])})
	}
	return httpx.M{
		"period":   p.JSON(),
		"summary":  httpx.M{"earned": earned, "spent": spent, "fund_balance": n(fund["current_balance"]), "avg_per_client": util.Round(earned/count, 2)},
		"by_level": []any{},
		"charts":   httpx.M{"earned": list},
	}, nil
}

func Clients(ctx context.Context, q map[string]string) (httpx.M, error) {
	p := ParsePeriod(q)
	scalar := func(qs string, args ...any) (float64, error) {
		v, err := db.Scalar(ctx, db.Pool, qs, args...)
		return db.ToFloat(v), err
	}
	newClients, err := scalar("SELECT COUNT(*) AS c FROM users u WHERE u.created_at >= ? AND u.created_at <= ?", p.Start, p.End)
	if err != nil {
		return nil, err
	}
	inactive, err := scalar(`SELECT COUNT(*) AS c FROM users u WHERE u.status = 'active'
		AND NOT EXISTS (SELECT 1 FROM workouts w WHERE w.user_id = u.id AND w.started_at >= ?)`, p.End.AddDate(0, 0, -30))
	if err != nil {
		return nil, err
	}
	blocked, _ := scalar("SELECT COUNT(*) AS c FROM users WHERE status = 'blocked'")
	users, _ := countUsers(ctx)
	topKm, err := db.Query(ctx, db.Pool, `SELECT u.id, u.name, u.phone, COALESCE(SUM(w.distance_km), 0) AS km, COUNT(*) AS workouts
		FROM workouts w JOIN users u ON u.id = w.user_id
		WHERE w.status = 'approved' AND w.started_at >= ? AND w.started_at <= ?
		GROUP BY u.id ORDER BY km DESC LIMIT 10`, p.Start, p.End)
	if err != nil {
		return nil, err
	}
	topWorkouts, err := db.Query(ctx, db.Pool, `SELECT u.id, u.name, u.phone, COUNT(*) AS workouts
		FROM workouts w JOIN users u ON u.id = w.user_id
		WHERE w.status = 'approved' AND w.started_at >= ? AND w.started_at <= ?
		GROUP BY u.id ORDER BY workouts DESC LIMIT 10`, p.Start, p.End)
	if err != nil {
		return nil, err
	}
	return httpx.M{
		"period": p.JSON(),
		"summary": httpx.M{"new_clients": newClients, "active_clients": users.active, "inactive_clients": inactive,
			"blocked_clients": blocked, "total_clients": users.total},
		"top_by_km":       mapRows(topKm, func(r db.Row, m httpx.M) { m["km"] = n(r["km"]) }),
		"top_by_workouts": topWorkouts,
	}, nil
}

func Shoes(ctx context.Context, q map[string]string) (httpx.M, error) {
	p := ParsePeriod(q)
	_, pairs, err := shopIncome(ctx, p.Start, p.End)
	if err != nil {
		return nil, err
	}
	qr, err := one(ctx, `SELECT SUM(status = 'activated') AS activated, SUM(status = 'new') AS not_activated,
			SUM(status = 'blocked') AS blocked, COUNT(*) AS total FROM shoes`)
	if err != nil {
		return nil, err
	}
	byModel, err := db.Query(ctx, db.Pool, `SELECT s.model_name, COUNT(*) AS total, SUM(s.status = 'activated') AS activated
		FROM shoes s GROUP BY s.model_name ORDER BY total DESC`)
	if err != nil {
		return nil, err
	}
	sold, err := db.Query(ctx, db.Pool, `SELECT p.name AS model_name, COALESCE(SUM(o.quantity), 0) AS sold
		FROM shop_orders o JOIN products p ON p.id = o.product_id
		WHERE o.status IN `+incomeIn+` AND o.created_at >= ? AND o.created_at <= ?
		GROUP BY p.id ORDER BY sold DESC`, append(append([]any{}, incomeStatuses...), p.Start, p.End)...)
	if err != nil {
		return nil, err
	}
	return httpx.M{
		"period": p.JSON(),
		"summary": httpx.M{"pairs_sold": pairs, "qr_activated": qr.Float("activated"), "qr_not_activated": qr.Float("not_activated"),
			"qr_blocked": qr.Float("blocked"), "qr_total": qr.Float("total")},
		"by_model":      byModel,
		"sold_by_model": mapRows(sold, func(r db.Row, m httpx.M) { m["sold"] = r.Float("sold") }),
	}, nil
}

func Finance(ctx context.Context, q map[string]string) (httpx.M, error) {
	p := ParsePeriod(q)
	revenue, _, err := shopIncome(ctx, p.Start, p.End)
	if err != nil {
		return nil, err
	}
	ads, err := adRevenue(ctx, p.Start, p.End)
	if err != nil {
		return nil, err
	}
	bonus := bonusEarned(ctx, p.Start, p.End)
	income, expense := util.Round(revenue+ads, 2), util.Round(bonus, 2)
	chart, err := db.Query(ctx, db.Pool, `SELECT DATE(o.created_at) AS d, COALESCE(SUM(o.total_amount), 0) AS sales
		FROM shop_orders o WHERE o.status IN `+incomeIn+` AND o.created_at >= ? AND o.created_at <= ?
		GROUP BY DATE(o.created_at) ORDER BY d`, append(append([]any{}, incomeStatuses...), p.Start, p.End)...)
	if err != nil {
		return nil, err
	}
	sales := make([]httpx.M, 0, len(chart))
	for _, c := range chart {
		sales = append(sales, httpx.M{"date": c["d"], "amount": n(c["sales"])})
	}
	return httpx.M{
		"period": p.JSON(),
		"breakdown": httpx.M{"shop_sales": revenue, "ad_revenue": ads, "income": income, "bonus_expense": bonus,
			"other_expense": 0, "expense": expense, "profit": util.Round(income-expense, 2)},
		"formula": "Прибыль = Продажи + Реклама − Бонусы − Прочие расходы",
		"charts":  httpx.M{"sales": sales},
	}, nil
}

func jsNum(f float64) string { return strconv.FormatFloat(f, 'f', -1, 64) }

// DailyTelegram — сводка за вчера для утреннего отчёта.
func DailyTelegram(ctx context.Context) (string, error) {
	d := time.Now().AddDate(0, 0, -1)
	start, end := startOfDay(d), endOfDay(d)
	dash, err := Dashboard(ctx, map[string]string{"period": "custom", "from": db.ISO(start), "to": db.ISO(end)})
	if err != nil {
		return "", err
	}
	cards := dash["cards"].(httpx.M)
	scalar := func(q string, args ...any) float64 {
		v, _ := db.Scalar(ctx, db.Pool, q, args...)
		return db.ToFloat(v)
	}
	workouts := scalar("SELECT COUNT(*) AS c FROM workouts w WHERE w.status = 'approved' AND w.started_at >= ? AND w.started_at <= ?", start, end)
	newUsers := scalar("SELECT COUNT(*) AS c FROM users WHERE created_at >= ? AND created_at <= ?", start, end)
	rs, err := one(ctx, `SELECT SUM(CASE WHEN status IN ('SELECTED','PROCESSING','READY') THEN 1 ELSE 0 END) AS pending,
			SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) AS delivered,
			SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) AS available
		FROM user_rewards WHERE created_at >= ? AND created_at <= ?`, start, end)
	if err != nil {
		return "", err
	}
	num := func(k string) string { return jsNum(db.ToFloat(cards[k])) }
	return fmt.Sprintf("📊 <b>RunBonus Отчёт</b>\n\nНовых клиентов: %s\nПродано кроссовок: %s\nТренировок: %s\nКилометров: %s км\n"+
		"Награды (вчера):\n· доступно к выбору: %s\n· в обработке: %s\n· выдано: %s\nДоход магазина: %s сомони\nПрибыль: %s сомони",
		jsNum(newUsers), num("shoes_sold_pairs"), jsNum(workouts), num("total_km"),
		jsNum(rs.Float("available")), jsNum(rs.Float("pending")), jsNum(rs.Float("delivered")), num("income"), num("profit")), nil
}
