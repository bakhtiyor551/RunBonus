package ads

import (
	"context"
	"encoding/json"
	"math"
	"strings"
	"time"

	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/notify"
	"runbonus/api/internal/reports"
	"runbonus/api/internal/util"
)

func tablesReady(ctx context.Context) bool {
	_, _, err := db.Exec(ctx, db.Pool, "SELECT 1 FROM advertisers LIMIT 1")
	return !db.IsNoTable(err)
}

var errNoTables = httpx.E(503, "Таблицы рекламы не созданы")

func copyRow(r db.Row) httpx.M {
	m := httpx.M{}
	for k, v := range r {
		m[k] = v
	}
	return m
}

// AdminSettings — getAdSettings в формате админки.
func AdminSettings(ctx context.Context) (httpx.M, error) {
	s, err := loadSettings(ctx)
	if err != nil {
		return nil, err
	}
	out := httpx.M{"partner_ads_enabled": s.PartnerAds, "impression_cost": s.ImpressionCost, "admob_enabled": s.AdmobEnabled,
		"admob_test_mode": s.AdmobTest, "admob_app_id": s.AppID}
	for _, k := range unitKeys {
		out[k] = s.Units[k]
	}
	return out, nil
}

func UpdateSettings(ctx context.Context, b httpx.Body) (httpx.M, error) {
	if _, _, err := db.Exec(ctx, db.Pool, "SELECT 1 FROM ad_settings LIMIT 1"); db.IsNoTable(err) {
		return nil, httpx.E(503, "Запустите миграцию 024_ad_settings.sql")
	}
	cur, err := AdminSettings(ctx)
	if err != nil {
		return nil, err
	}
	pick := func(k string) any {
		if v := b.Raw(k); v != nil {
			return v
		}
		return cur[k]
	}
	str := func(k string) any {
		v := cur[k]
		if raw, ok := b[k].(string); ok {
			v = strings.TrimSpace(raw)
		}
		return util.NilIfEmpty(httpx.ToString(v))
	}
	cost := db.ToFloat(httpx.ToString(pick("impression_cost")))
	args := []any{b2i(httpx.Truthy(pick("partner_ads_enabled"))), math.Max(0, cost), b2i(httpx.Truthy(pick("admob_enabled"))),
		b2i(httpx.Truthy(pick("admob_test_mode"))), str("admob_app_id")}
	for _, k := range unitKeys {
		args = append(args, str(k))
	}
	if _, _, err := db.Exec(ctx, db.Pool, `UPDATE ad_settings SET partner_ads_enabled = ?, impression_cost = ?, admob_enabled = ?, admob_test_mode = ?,
			admob_app_id = ?, admob_google_home = ?, admob_google_workout = ?, admob_google_shop = ?,
			admob_play_home = ?, admob_play_workout = ?, admob_play_shop = ? WHERE id = 1`, args...); err != nil {
		return nil, err
	}
	return AdminSettings(ctx)
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

func Advertisers(ctx context.Context) ([]httpx.M, error) {
	if !tablesReady(ctx) {
		return []httpx.M{}, nil
	}
	rows, err := db.Query(ctx, db.Pool, "SELECT * FROM advertisers ORDER BY id DESC")
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		m := copyRow(r)
		m["balance"] = r.Float("balance")
		out = append(out, m)
	}
	return out, nil
}

func trimNil(b httpx.Body, k string) any { return util.NilIfEmpty(strings.TrimSpace(b.Str(k))) }

func SaveAdvertiser(ctx context.Context, b httpx.Body, id string) (httpx.M, error) {
	if !tablesReady(ctx) {
		return nil, httpx.E(503, "Таблицы рекламы не созданы. Запустите миграцию 022.")
	}
	name := strings.TrimSpace(b.Str("company_name"))
	if name == "" {
		return nil, httpx.E(400, "Укажите название компании")
	}
	status := util.FirstNonEmpty(b.Str("status"), "active")
	args := []any{name, trimNil(b, "contact_name"), trimNil(b, "phone"), trimNil(b, "email"), trimNil(b, "address"), b.Float("balance"), status}
	if id != "" {
		if _, _, err := db.Exec(ctx, db.Pool, "UPDATE advertisers SET company_name=?, contact_name=?, phone=?, email=?, address=?, balance=?, status=? WHERE id=?", append(args, id)...); err != nil {
			return nil, err
		}
	} else {
		newID, _, err := db.Exec(ctx, db.Pool, "INSERT INTO advertisers (company_name, contact_name, phone, email, address, balance, status) VALUES (?,?,?,?,?,?,?)", args...)
		if err != nil {
			return nil, err
		}
		id = httpx.ToString(float64(newID))
	}
	r, err := db.One(ctx, db.Pool, "SELECT * FROM advertisers WHERE id = ?", id)
	if err != nil || r == nil {
		return nil, err
	}
	m := copyRow(r)
	m["balance"] = r.Float("balance")
	return m, nil
}

const campaignSelect = `SELECT c.*, a.company_name AS advertiser_name, t.name AS tariff_name, t.days AS tariff_days, t.price AS tariff_price
	FROM ad_campaigns c JOIN advertisers a ON a.id = c.advertiser_id LEFT JOIN ad_tariffs t ON t.id = c.tariff_id`

func Campaigns(ctx context.Context) ([]httpx.M, error) {
	if !tablesReady(ctx) {
		return []httpx.M{}, nil
	}
	rows, err := db.Query(ctx, db.Pool, campaignSelect+" ORDER BY c.id DESC")
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapCampaign(r))
	}
	return out, nil
}

func CampaignByID(ctx context.Context, raw string) (httpx.M, error) {
	id := db.ToFloat(raw)
	if !tablesReady(ctx) || id <= 0 {
		return nil, nil
	}
	r, err := db.One(ctx, db.Pool, campaignSelect+" WHERE c.id = ?", id)
	if err != nil || r == nil {
		return nil, err
	}
	return mapCampaign(r), nil
}

func tariff(ctx context.Context, id float64) (db.Row, error) {
	if id == 0 {
		return nil, nil
	}
	return db.One(ctx, db.Pool, "SELECT * FROM ad_tariffs WHERE id = ?", id)
}

func dateOnly(v any) string {
	s := httpx.ToString(v)
	if len(s) >= 10 {
		return s[:10]
	}
	return s
}

func jsonList(v any) string {
	if v == nil {
		v = []any{}
	}
	b, _ := json.Marshal(v)
	return string(b)
}

func SaveCampaign(ctx context.Context, b httpx.Body, id string) (httpx.M, error) {
	if !tablesReady(ctx) {
		return nil, errNoTables
	}
	title := strings.TrimSpace(b.Str("title"))
	if !httpx.Truthy(b.Raw("advertiser_id")) || title == "" {
		return nil, httpx.E(400, "Укажите рекламодателя и название")
	}
	status := util.FirstNonEmpty(b.Str("status"), "draft")
	activation := status == "active" || status == "pending_payment"
	tariffID := b.Float("tariff_id")
	if activation {
		if tariffID == 0 {
			return nil, httpx.E(400, "Выберите тариф для активации кампании")
		}
		t, err := tariff(ctx, tariffID)
		if err != nil {
			return nil, err
		}
		if t == nil || t.Str("status") != "active" {
			return nil, httpx.E(400, "Тариф не найден или отключён")
		}
	}
	start, end := b.Str("start_date"), b.Str("end_date")
	budget := b.Float("budget")
	if tariffID != 0 {
		t, err := tariff(ctx, tariffID)
		if err != nil {
			return nil, err
		}
		if t == nil {
			return nil, httpx.E(400, "Тариф не найден")
		}
		budget = t.Float("price")
		if start == "" {
			start = time.Now().UTC().Format("2006-01-02")
		}
		if activation || end == "" {
			s, err := time.Parse("2006-01-02", dateOnly(start))
			if err != nil {
				s = time.Now()
			}
			end = s.AddDate(0, 0, int(t.Float("days"))).Format("2006-01-02")
		}
	}
	if start == "" || end == "" {
		return nil, httpx.E(400, "Укажите даты кампании или выберите тариф")
	}
	if end < start {
		return nil, httpx.E(400, "Дата окончания не может быть раньше начала")
	}
	var tid any
	if tariffID != 0 {
		tid = tariffID
	}
	args := []any{httpx.ToString(b.Raw("advertiser_id")), tid, title, trimNil(b, "description"), util.FirstNonEmpty(b.Str("ad_type"), "banner_home"),
		trimNil(b, "banner_url"), trimNil(b, "target_url"), jsonList(b.Raw("audience_cities")), jsonList(b.Raw("audience_levels")),
		jsonList(b.Raw("audience_activity")), start, end, budget, status}
	var err error
	if id != "" {
		_, _, err = db.Exec(ctx, db.Pool, `UPDATE ad_campaigns SET advertiser_id=?, tariff_id=?, title=?, description=?, ad_type=?, banner_url=?, target_url=?,
			audience_cities=?, audience_levels=?, audience_activity=?, start_date=?, end_date=?, budget=?, status=? WHERE id=?`, append(args, id)...)
	} else {
		var newID int64
		newID, _, err = db.Exec(ctx, db.Pool, `INSERT INTO ad_campaigns (advertiser_id, tariff_id, title, description, ad_type, banner_url, target_url,
			audience_cities, audience_levels, audience_activity, start_date, end_date, budget, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, args...)
		id = httpx.ToString(float64(newID))
	}
	if db.IsBadField(err) {
		return nil, httpx.E(503, "Запустите миграцию 023_ad_campaign_tariff.sql")
	}
	if err != nil {
		return nil, err
	}
	return CampaignByID(ctx, id)
}

func DeleteCampaign(ctx context.Context, raw string) (httpx.M, error) {
	if !tablesReady(ctx) {
		return nil, errNoTables
	}
	id := db.ToFloat(raw)
	if id <= 0 {
		return nil, httpx.E(400, "Некорректный ID кампании")
	}
	r, err := db.One(ctx, db.Pool, "SELECT id, title FROM ad_campaigns WHERE id = ?", id)
	if err != nil {
		return nil, err
	}
	if r == nil {
		return nil, httpx.E(404, "Кампания не найдена")
	}
	if _, _, err := db.Exec(ctx, db.Pool, "DELETE FROM ad_campaigns WHERE id = ?", id); err != nil {
		return nil, err
	}
	return httpx.M{"ok": true, "id": id, "title": r["title"]}, nil
}

func mapTariff(r db.Row) httpx.M {
	m := copyRow(r)
	m["price"], m["days"] = r.Float("price"), r.Float("days")
	return m
}

func Tariffs(ctx context.Context, all bool) ([]httpx.M, error) {
	if !tablesReady(ctx) {
		return []httpx.M{}, nil
	}
	q := "SELECT * FROM ad_tariffs WHERE status = 'active' ORDER BY sort_order, id"
	if all {
		q = "SELECT * FROM ad_tariffs ORDER BY sort_order, id"
	}
	rows, err := db.Query(ctx, db.Pool, q)
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapTariff(r))
	}
	return out, nil
}

func SaveTariff(ctx context.Context, b httpx.Body, id string) (httpx.M, error) {
	if !tablesReady(ctx) {
		return nil, errNoTables
	}
	code, name := strings.ToLower(strings.TrimSpace(b.Str("code"))), strings.TrimSpace(b.Str("name"))
	if code == "" || name == "" {
		return nil, httpx.E(400, "Укажите код и название тарифа")
	}
	days := b.Float("days")
	if days == 0 {
		days = 1
	}
	args := []any{code, name, math.Max(1, days), math.Max(0, b.Float("price")), util.FirstNonEmpty(b.Str("status"), "active"), b.Float("sort_order")}
	if id != "" {
		if _, _, err := db.Exec(ctx, db.Pool, "UPDATE ad_tariffs SET code=?, name=?, days=?, price=?, status=?, sort_order=? WHERE id=?", append(args, id)...); err != nil {
			return nil, err
		}
	} else {
		newID, _, err := db.Exec(ctx, db.Pool, "INSERT INTO ad_tariffs (code, name, days, price, status, sort_order) VALUES (?,?,?,?,?,?)", args...)
		if err != nil {
			return nil, err
		}
		id = httpx.ToString(float64(newID))
	}
	r, err := db.One(ctx, db.Pool, "SELECT * FROM ad_tariffs WHERE id = ?", id)
	if err != nil || r == nil {
		return nil, err
	}
	return mapTariff(r), nil
}

func Payments(ctx context.Context) ([]httpx.M, error) {
	if !tablesReady(ctx) {
		return []httpx.M{}, nil
	}
	rows, err := db.Query(ctx, db.Pool, `SELECT p.*, a.company_name AS advertiser_name, c.title AS campaign_title
		FROM ad_payments p JOIN advertisers a ON a.id = p.advertiser_id LEFT JOIN ad_campaigns c ON c.id = p.campaign_id
		ORDER BY p.id DESC LIMIT 200`)
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		m := copyRow(r)
		m["amount"] = r.Float("amount")
		out = append(out, m)
	}
	return out, nil
}

func SavePayment(ctx context.Context, b httpx.Body) (db.Row, error) {
	if !tablesReady(ctx) {
		return nil, errNoTables
	}
	status := util.FirstNonEmpty(b.Str("status"), "new")
	var paidAt any
	if b.Str("status") == "paid" {
		paidAt = time.Now()
	}
	var campaign any
	if httpx.Truthy(b.Raw("campaign_id")) {
		campaign = httpx.ToString(b.Raw("campaign_id"))
	}
	amount := b.Float("amount")
	id, _, err := db.Exec(ctx, db.Pool, "INSERT INTO ad_payments (advertiser_id, campaign_id, amount, status, note, paid_at) VALUES (?,?,?,?,?,?)",
		httpx.ToString(b.Raw("advertiser_id")), campaign, amount, status, trimNil(b, "note"), paidAt)
	if err != nil {
		return nil, err
	}
	if b.Str("status") == "paid" {
		if _, _, err := db.Exec(ctx, db.Pool, "UPDATE advertisers SET balance = balance + ? WHERE id = ?", amount, httpx.ToString(b.Raw("advertiser_id"))); err != nil {
			return nil, err
		}
	}
	return db.One(ctx, db.Pool, "SELECT * FROM ad_payments WHERE id = ?", id)
}

func ctr(clicks, imp float64) float64 {
	if imp == 0 {
		return 0
	}
	return util.Round(clicks/imp*10000, 0) / 100
}

func Statistics(ctx context.Context, q map[string]string) (httpx.M, error) {
	if !tablesReady(ctx) {
		return httpx.M{"summary": httpx.M{}, "campaigns": []any{}, "charts": []any{}}, nil
	}
	p := reports.ParsePeriod(q)
	sum, err := db.One(ctx, db.Pool, `SELECT SUM(event_type = 'impression') AS impressions, SUM(event_type = 'click') AS clicks,
			SUM(event_type = 'open') AS opens, COUNT(DISTINCT user_id) AS unique_users
		FROM ad_statistics s WHERE s.created_at >= ? AND s.created_at <= ?`, p.Start, p.End)
	if err != nil {
		return nil, err
	}
	if sum == nil {
		sum = db.Row{}
	}
	byCampaign, err := db.Query(ctx, db.Pool, `SELECT c.id, c.title, c.budget, c.spent,
			SUM(s.event_type = 'impression') AS impressions, SUM(s.event_type = 'click') AS clicks
		FROM ad_campaigns c
		LEFT JOIN ad_statistics s ON s.campaign_id = c.id AND s.created_at >= ? AND s.created_at <= ?
		GROUP BY c.id ORDER BY clicks DESC LIMIT 50`, p.Start, p.End)
	if err != nil {
		return nil, err
	}
	active, _ := db.Scalar(ctx, db.Pool, "SELECT COUNT(*) AS c FROM ad_campaigns WHERE status = 'active'")
	revenue, _ := db.Scalar(ctx, db.Pool, "SELECT COALESCE(SUM(amount), 0) AS t FROM ad_payments WHERE status = 'paid' AND paid_at >= ? AND paid_at <= ?", p.Start, p.End)
	imp, clicks := sum.Float("impressions"), sum.Float("clicks")
	campaigns := make([]httpx.M, 0, len(byCampaign))
	for _, c := range byCampaign {
		m := copyRow(c)
		m["budget"], m["spent"], m["impressions"], m["clicks"] = c.Float("budget"), c.Float("spent"), c.Float("impressions"), c.Float("clicks")
		m["ctr"] = ctr(c.Float("clicks"), c.Float("impressions"))
		campaigns = append(campaigns, m)
	}
	return httpx.M{
		"period": p.JSON(),
		"summary": httpx.M{"active_campaigns": db.ToFloat(active), "impressions": imp, "clicks": clicks, "opens": sum.Float("opens"),
			"unique_users": sum.Float("unique_users"), "ctr": ctr(clicks, imp), "revenue": db.ToFloat(revenue)},
		"campaigns": campaigns,
	}, nil
}

func Dashboard(ctx context.Context, q map[string]string) (httpx.M, error) {
	st, err := Statistics(ctx, q)
	if err != nil {
		return nil, err
	}
	s, _ := st["summary"].(httpx.M)
	st["cards"] = httpx.M{"active_campaigns": s["active_campaigns"], "ad_revenue": s["revenue"], "impressions": s["impressions"],
		"clicks": s["clicks"], "ctr": s["ctr"]}
	return st, nil
}

// SendCampaignPush — push-кампания по городам аудитории.
func SendCampaignPush(ctx context.Context, c httpx.M) (httpx.M, error) {
	cities, _ := c["audience_cities"].([]any)
	q := `SELECT DISTINCT upt.token, upt.user_id, u.city FROM user_push_tokens upt JOIN users u ON u.id = upt.user_id AND u.status = 'active'`
	var args []any
	for _, ct := range cities {
		if httpx.Truthy(ct) {
			args = append(args, ct)
		}
	}
	if len(args) > 0 {
		q += " WHERE u.city IN (" + strings.TrimSuffix(strings.Repeat("?,", len(args)), ",") + ")"
	}
	rows, err := db.Query(ctx, db.Pool, q, args...)
	if err != nil && !db.IsNoTable(err) {
		return nil, err
	}
	var tokens []string
	for _, r := range rows {
		if t := r.Str("token"); t != "" {
			tokens = append(tokens, t)
		}
	}
	title := util.FirstNonEmpty(strings.TrimSpace(httpx.ToString(c["title"])), "RunBonus")
	body := ""
	if c["description"] != nil {
		body = strings.TrimSpace(httpx.ToString(c["description"]))
	}
	target := ""
	if c["target_url"] != nil {
		target = httpx.ToString(c["target_url"])
	}
	res := notify.SendToTokens(ctx, tokens, notify.Push{Title: title, Body: body, Data: map[string]string{
		"campaign_id": httpx.ToString(c["id"]), "url": target, "type": "ad_campaign"}})
	_, _, _ = db.Exec(ctx, db.Pool, "INSERT INTO push_notification_log (campaign_id, title, body, sent_count, failed_count) VALUES (?, ?, ?, ?, ?)",
		c["id"], title, body, res.Sent, res.Failed)
	_, _, _ = db.Exec(ctx, db.Pool, "INSERT INTO ad_statistics (campaign_id, user_id, event_type) VALUES (?, NULL, 'open')", c["id"])
	out := httpx.M{"sent": res.Sent, "failed": res.Failed, "skipped": res.Skipped, "recipients": len(tokens), "title": title, "body": body}
	if res.Reason != "" {
		out["reason"] = res.Reason
	}
	return out, nil
}
