package shop

import (
	"context"
	"regexp"
	"strings"

	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
)

var nonCode = regexp.MustCompile(`[^a-z0-9_-]`)

// NormalizeCode — код способа/категории: латиница в нижнем регистре, до 32 символов.
func NormalizeCode(raw string) string {
	s := nonCode.ReplaceAllString(strings.ToLower(strings.TrimSpace(raw)), "_")
	if r := []rune(s); len(r) > 32 {
		s = string(r[:32])
	}
	return s
}

func statusOf(b httpx.Body, current any) any {
	switch b.Str("status") {
	case "inactive":
		return "inactive"
	case "active":
		return "active"
	}
	return current
}

func sortOf(b httpx.Body, current any) any {
	if b.Raw("sort_order") != nil {
		return b.Float("sort_order")
	}
	return current
}

// trimmedOr — data.x?.trim() || current.
func trimmedOr(b httpx.Body, key string, current any) any {
	if s := strings.TrimSpace(b.Str(key)); s != "" {
		return s
	}
	return current
}

func boolFlagOr(b httpx.Body, key string, current any) any {
	if b.Raw(key) != nil {
		return b2i(b.Bool(key))
	}
	return current
}

// --- способы оплаты ---

func AllPaymentMethods(ctx context.Context) ([]httpx.M, error) {
	if !paymentsReady(ctx) {
		out := []httpx.M{}
		for i, m := range defaultPayments {
			out = append(out, paymentFromDef(m, (i+1)*10))
		}
		return out, nil
	}
	rows, err := db.Query(ctx, db.Pool, "SELECT * FROM payment_methods ORDER BY sort_order ASC, id ASC")
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapPayment(r))
	}
	return out, nil
}

func CreatePaymentMethod(ctx context.Context, b httpx.Body) (httpx.M, error) {
	paymentsReady(ctx)
	id := NormalizeCode(b.Str("id"))
	if id == "" {
		return nil, httpx.E(400, "Укажите код способа (латиница, например card_online)")
	}
	label := strings.TrimSpace(b.Str("label"))
	if label == "" {
		return nil, httpx.E(400, "Укажите название")
	}
	if dup, err := db.One(ctx, db.Pool, "SELECT id FROM payment_methods WHERE id = ?", id); err != nil || dup != nil {
		if err != nil {
			return nil, err
		}
		return nil, httpx.E(409, "Такой код уже существует")
	}
	status := "active"
	if b.Str("status") == "inactive" {
		status = "inactive"
	}
	if _, _, err := db.Exec(ctx, db.Pool, `INSERT INTO payment_methods (id, label, needs_details, details_label, uses_transfer_modal, sort_order, status, is_builtin)
		VALUES (?, ?, ?, ?, ?, ?, ?, 0)`, id, label, b2i(b.Bool("needs_details")), nilEmpty(strings.TrimSpace(b.Str("details_label"))),
		b2i(b.Bool("uses_transfer_modal")), b.Float("sort_order"), status); err != nil {
		return nil, err
	}
	return paymentByID(ctx, id)
}

func UpdatePaymentMethod(ctx context.Context, id string, b httpx.Body) (httpx.M, error) {
	paymentsReady(ctx)
	row, err := db.One(ctx, db.Pool, "SELECT * FROM payment_methods WHERE id = ?", id)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, httpx.E(404, "Способ оплаты не найден")
	}
	details := row["details_label"]
	if b.Has("details_label") {
		details = nilEmpty(strings.TrimSpace(b.Str("details_label")))
	}
	if _, _, err := db.Exec(ctx, db.Pool, `UPDATE payment_methods SET label = ?, needs_details = ?, details_label = ?, uses_transfer_modal = ?, sort_order = ?, status = ? WHERE id = ?`,
		trimmedOr(b, "label", row["label"]), boolFlagOr(b, "needs_details", row["needs_details"]), details,
		boolFlagOr(b, "uses_transfer_modal", row["uses_transfer_modal"]), sortOf(b, row["sort_order"]), statusOf(b, row["status"]), id); err != nil {
		return nil, err
	}
	return paymentByID(ctx, id)
}

// --- способы доставки ---

func AllDeliveryMethods(ctx context.Context) ([]httpx.M, error) {
	if !deliveriesReady(ctx) {
		out := []httpx.M{}
		for i, m := range defaultDeliveries {
			out = append(out, deliveryFromDef(m, (i+1)*10))
		}
		return out, nil
	}
	rows, err := db.Query(ctx, db.Pool, "SELECT * FROM delivery_methods ORDER BY sort_order ASC, id ASC")
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapDelivery(r))
	}
	return out, nil
}

func CreateDeliveryMethod(ctx context.Context, b httpx.Body) (httpx.M, error) {
	deliveriesReady(ctx)
	id := NormalizeCode(b.Str("id"))
	if id == "" {
		return nil, httpx.E(400, "Укажите код способа (латиница)")
	}
	label := strings.TrimSpace(b.Str("label"))
	if label == "" {
		return nil, httpx.E(400, "Укажите название")
	}
	if dup, err := db.One(ctx, db.Pool, "SELECT id FROM delivery_methods WHERE id = ?", id); err != nil || dup != nil {
		if err != nil {
			return nil, err
		}
		return nil, httpx.E(409, "Такой код уже существует")
	}
	status := "active"
	if b.Str("status") == "inactive" {
		status = "inactive"
	}
	if _, _, err := db.Exec(ctx, db.Pool, `INSERT INTO delivery_methods (id, label, requires_address, price, sort_order, status, is_builtin) VALUES (?, ?, ?, ?, ?, ?, 0)`,
		id, label, b2i(b.Bool("requires_address")), max(0, b.Float("price")), b.Float("sort_order"), status); err != nil {
		return nil, err
	}
	return deliveryByID(ctx, id)
}

func UpdateDeliveryMethod(ctx context.Context, id string, b httpx.Body) (httpx.M, error) {
	deliveriesReady(ctx)
	row, err := db.One(ctx, db.Pool, "SELECT * FROM delivery_methods WHERE id = ?", id)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, httpx.E(404, "Способ доставки не найден")
	}
	price := any(row.Float("price"))
	if b.Raw("price") != nil {
		price = max(0, b.Float("price"))
	}
	if _, _, err := db.Exec(ctx, db.Pool, `UPDATE delivery_methods SET label = ?, requires_address = ?, price = ?, sort_order = ?, status = ? WHERE id = ?`,
		trimmedOr(b, "label", row["label"]), boolFlagOr(b, "requires_address", row["requires_address"]), price,
		sortOf(b, row["sort_order"]), statusOf(b, row["status"]), id); err != nil {
		return nil, err
	}
	return deliveryByID(ctx, id)
}

// --- кошельки для мобильного перевода ---

func mapAccount(r db.Row) httpx.M {
	return httpx.M{"id": r["id"], "provider": r["provider"], "number": r["number"], "holder": r["holder"],
		"sort_order": r.Float("sort_order"), "status": r["status"]}
}

func AllMobileAccounts(ctx context.Context) ([]httpx.M, error) {
	if !accountsReady(ctx) {
		out := []httpx.M{}
		for i, a := range defaultMobileAccounts() {
			a["sort_order"], a["status"] = float64((i+1)*10), "active"
			out = append(out, a)
		}
		return out, nil
	}
	rows, err := db.Query(ctx, db.Pool, "SELECT * FROM mobile_payment_accounts ORDER BY sort_order ASC, id ASC")
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapAccount(r))
	}
	return out, nil
}

func accountByID(ctx context.Context, id string) (httpx.M, error) {
	r, err := db.One(ctx, db.Pool, "SELECT * FROM mobile_payment_accounts WHERE id = ?", id)
	if err != nil || r == nil {
		return nil, err
	}
	return mapAccount(r), nil
}

func CreateMobileAccount(ctx context.Context, b httpx.Body) (httpx.M, error) {
	accountsReady(ctx)
	id := NormalizeCode(b.Str("id"))
	provider, number := strings.TrimSpace(b.Str("provider")), strings.TrimSpace(b.Str("number"))
	if id == "" || provider == "" || number == "" {
		return nil, httpx.E(400, "Укажите код, сервис и номер")
	}
	if dup, err := db.One(ctx, db.Pool, "SELECT id FROM mobile_payment_accounts WHERE id = ?", id); err != nil || dup != nil {
		if err != nil {
			return nil, err
		}
		return nil, httpx.E(409, "Такой код уже существует")
	}
	holder := strings.TrimSpace(b.Str("holder"))
	if holder == "" {
		holder = "RunBonus"
	}
	status := "active"
	if b.Str("status") == "inactive" {
		status = "inactive"
	}
	if _, _, err := db.Exec(ctx, db.Pool, `INSERT INTO mobile_payment_accounts (id, provider, number, holder, sort_order, status) VALUES (?, ?, ?, ?, ?, ?)`,
		id, provider, number, holder, b.Float("sort_order"), status); err != nil {
		return nil, err
	}
	return accountByID(ctx, id)
}

// UpdateMobileAccount — при смене только статуса номер не требуется (в Node это отвечало 400).
func UpdateMobileAccount(ctx context.Context, id string, b httpx.Body, statusOnly bool) (httpx.M, error) {
	accountsReady(ctx)
	row, err := db.One(ctx, db.Pool, "SELECT * FROM mobile_payment_accounts WHERE id = ?", id)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, httpx.E(404, "Кошелёк не найден")
	}
	number := strings.TrimSpace(b.Str("number"))
	if number == "" {
		if !statusOnly {
			return nil, httpx.E(400, "Укажите номер кошелька")
		}
		number = row.Str("number")
	}
	if _, _, err := db.Exec(ctx, db.Pool, `UPDATE mobile_payment_accounts SET provider = ?, number = ?, holder = ?, sort_order = ?, status = ? WHERE id = ?`,
		trimmedOr(b, "provider", row["provider"]), number, trimmedOr(b, "holder", row["holder"]),
		sortOf(b, row["sort_order"]), statusOf(b, row["status"]), id); err != nil {
		return nil, err
	}
	return accountByID(ctx, id)
}
