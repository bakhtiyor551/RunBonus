package shop

import (
	"context"
	"os"
	"sync"

	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
)

type paymentDef struct {
	ID, Label, DetailsLabel string
	NeedsDetails, Transfer  bool
}

var defaultPayments = []paymentDef{
	{ID: "cash", Label: "Наличные при доставке"},
	{ID: "delivery", Label: "Доставка"},
	{ID: "card", Label: "Банковская карта", NeedsDetails: true, DetailsLabel: "Номер карты или последние 4 цифры"},
	{ID: "mobile", Label: "Мобильный перевод", Transfer: true},
	{ID: "bank", Label: "Перевод на расчётный счёт", NeedsDetails: true, DetailsLabel: "Банк или ФИО плательщика"},
}

type deliveryDef struct {
	ID, Label       string
	RequiresAddress bool
	Price           float64
}

var defaultDeliveries = []deliveryDef{
	{"courier", "Доставка курьером", true, 25},
	{"pickup", "Самовывоз", false, 0},
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func defaultMobileAccounts() []httpx.M {
	return []httpx.M{
		{"id": "alif", "provider": "Alif Mobi", "number": envOr("SHOP_ALIF_WALLET", "+992 90 000 00 01"), "holder": envOr("SHOP_ALIF_HOLDER", "RunBonus")},
		{"id": "dc", "provider": "DC Wallet", "number": envOr("SHOP_DC_WALLET", "+992 90 000 00 02"), "holder": envOr("SHOP_DC_HOLDER", "RunBonus")},
		{"id": "eskhata", "provider": "Эсхата Онлайн", "number": envOr("SHOP_ESKHATA_WALLET", "+992 90 000 00 03"), "holder": envOr("SHOP_ESKHATA_HOLDER", "RunBonus")},
	}
}

// seededTable — таблица существует; пустая заполняется значениями по умолчанию (как ensureTable в Node).
type seededTable struct {
	once   sync.Once
	exists bool
}

func (t *seededTable) ensure(ctx context.Context, table string, seed func() error) bool {
	t.once.Do(func() {
		if _, _, err := db.Exec(ctx, db.Pool, "SELECT 1 FROM "+table+" LIMIT 1"); err != nil {
			return
		}
		t.exists = true
		if n, err := db.Scalar(ctx, db.Pool, "SELECT COUNT(*) AS c FROM "+table); err == nil && db.ToFloat(n) == 0 {
			if err := seed(); err != nil {
				t.exists = false
			}
		}
	})
	return t.exists
}

var paymentsTable, deliveriesTable, accountsTable seededTable

func paymentsReady(ctx context.Context) bool {
	return paymentsTable.ensure(ctx, "payment_methods", func() error {
		for i, m := range defaultPayments {
			if _, _, err := db.Exec(ctx, db.Pool, `INSERT INTO payment_methods (id, label, needs_details, details_label, uses_transfer_modal, sort_order, status, is_builtin)
				VALUES (?, ?, ?, ?, ?, ?, 'active', 1)`, m.ID, m.Label, b2i(m.NeedsDetails), nilEmpty(m.DetailsLabel), b2i(m.Transfer), (i+1)*10); err != nil {
				return err
			}
		}
		return nil
	})
}

func deliveriesReady(ctx context.Context) bool {
	return deliveriesTable.ensure(ctx, "delivery_methods", func() error {
		for i, m := range defaultDeliveries {
			if _, _, err := db.Exec(ctx, db.Pool, `INSERT INTO delivery_methods (id, label, requires_address, price, sort_order, status, is_builtin)
				VALUES (?, ?, ?, ?, ?, 'active', 1)`, m.ID, m.Label, b2i(m.RequiresAddress), m.Price, (i+1)*10); err != nil {
				return err
			}
		}
		return nil
	})
}

func accountsReady(ctx context.Context) bool {
	return accountsTable.ensure(ctx, "mobile_payment_accounts", func() error {
		for i, a := range defaultMobileAccounts() {
			if _, _, err := db.Exec(ctx, db.Pool, `INSERT INTO mobile_payment_accounts (id, provider, number, holder, sort_order, status) VALUES (?, ?, ?, ?, ?, 'active')`,
				a["id"], a["provider"], a["number"], a["holder"], (i+1)*10); err != nil {
				return err
			}
		}
		return nil
	})
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

func mapPayment(r db.Row) httpx.M {
	m := httpx.M{"id": r["id"], "label": r["label"], "needsDetails": r.Bool("needs_details"), "usesTransferModal": r.Bool("uses_transfer_modal"),
		"sort_order": r.Float("sort_order"), "status": r["status"], "is_builtin": r.Bool("is_builtin")}
	if s := r.Str("details_label"); s != "" {
		m["detailsLabel"] = s
	}
	return m
}

func paymentFromDef(m paymentDef, sortOrder int) httpx.M {
	return mapPayment(db.Row{"id": m.ID, "label": m.Label, "needs_details": b2i(m.NeedsDetails), "details_label": nilEmpty(m.DetailsLabel),
		"uses_transfer_modal": b2i(m.Transfer), "sort_order": int64(sortOrder), "status": "active", "is_builtin": int64(1)})
}

// ActivePaymentMethods — listActivePaymentMethods.
func ActivePaymentMethods(ctx context.Context) ([]httpx.M, error) {
	if !paymentsReady(ctx) {
		out := make([]httpx.M, 0, len(defaultPayments))
		for i, m := range defaultPayments {
			out = append(out, paymentFromDef(m, (i+1)*10))
		}
		return out, nil
	}
	rows, err := db.Query(ctx, db.Pool, "SELECT * FROM payment_methods WHERE status = 'active' ORDER BY sort_order ASC, id ASC")
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapPayment(r))
	}
	return out, nil
}

// FallbackPaymentMethods — константы PAYMENT_METHODS (при ошибке БД).
func FallbackPaymentMethods() []httpx.M {
	out := []httpx.M{}
	for _, m := range defaultPayments {
		item := httpx.M{"id": m.ID, "label": m.Label, "needsDetails": m.NeedsDetails}
		if m.DetailsLabel != "" {
			item["detailsLabel"] = m.DetailsLabel
		}
		if m.Transfer {
			item["usesTransferModal"] = true
		}
		out = append(out, item)
	}
	return out
}

func paymentByID(ctx context.Context, id string) (httpx.M, error) {
	if !paymentsReady(ctx) {
		for _, m := range defaultPayments {
			if m.ID == id {
				return paymentFromDef(m, 0), nil
			}
		}
		return nil, nil
	}
	r, err := db.One(ctx, db.Pool, "SELECT * FROM payment_methods WHERE id = ?", id)
	if err != nil || r == nil {
		return nil, err
	}
	return mapPayment(r), nil
}

func PaymentLabel(ctx context.Context, id string) string {
	if m, _ := paymentByID(ctx, id); m != nil {
		return httpx.ToString(m["label"])
	}
	for _, m := range defaultPayments {
		if m.ID == id {
			return m.Label
		}
	}
	if id == "" {
		return "—"
	}
	return id
}

func mapDelivery(r db.Row) httpx.M {
	return httpx.M{"id": r["id"], "label": r["label"], "price": r.Float("price"), "requiresAddress": r.Bool("requires_address"),
		"sort_order": r.Float("sort_order"), "status": r["status"], "is_builtin": r.Bool("is_builtin")}
}

func deliveryFromDef(m deliveryDef, sortOrder int) httpx.M {
	return mapDelivery(db.Row{"id": m.ID, "label": m.Label, "requires_address": b2i(m.RequiresAddress), "price": m.Price,
		"sort_order": int64(sortOrder), "status": "active", "is_builtin": int64(1)})
}

// ActiveDeliveryMethods — listActiveDeliveryMethods.
func ActiveDeliveryMethods(ctx context.Context) ([]httpx.M, error) {
	if !deliveriesReady(ctx) {
		out := []httpx.M{}
		for i, m := range defaultDeliveries {
			out = append(out, deliveryFromDef(m, (i+1)*10))
		}
		return out, nil
	}
	rows, err := db.Query(ctx, db.Pool, "SELECT * FROM delivery_methods WHERE status = 'active' ORDER BY sort_order ASC, id ASC")
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapDelivery(r))
	}
	return out, nil
}

func FallbackDeliveryMethods() []httpx.M {
	out := []httpx.M{}
	for _, m := range defaultDeliveries {
		out = append(out, httpx.M{"id": m.ID, "label": m.Label, "requiresAddress": m.RequiresAddress})
	}
	return out
}

func deliveryByID(ctx context.Context, id string) (httpx.M, error) {
	if !deliveriesReady(ctx) {
		for _, m := range defaultDeliveries {
			if m.ID == id {
				return deliveryFromDef(m, 0), nil
			}
		}
		return nil, nil
	}
	r, err := db.One(ctx, db.Pool, "SELECT * FROM delivery_methods WHERE id = ?", id)
	if err != nil || r == nil {
		return nil, err
	}
	return mapDelivery(r), nil
}

func DeliveryLabel(ctx context.Context, id string) string {
	if m, _ := deliveryByID(ctx, id); m != nil {
		return httpx.ToString(m["label"])
	}
	for _, m := range defaultDeliveries {
		if m.ID == id {
			return m.Label
		}
	}
	if id == "" {
		return "—"
	}
	return id
}

// ActiveMobileAccounts — счета для мобильного перевода (пустой список → константы).
func ActiveMobileAccounts(ctx context.Context) ([]httpx.M, error) {
	if !accountsReady(ctx) {
		out := []httpx.M{}
		for i, a := range defaultMobileAccounts() {
			a["sort_order"], a["status"] = float64((i+1)*10), "active"
			out = append(out, a)
		}
		return out, nil
	}
	rows, err := db.Query(ctx, db.Pool, "SELECT * FROM mobile_payment_accounts WHERE status = 'active' ORDER BY sort_order ASC, id ASC")
	if err != nil {
		return nil, err
	}
	out := []httpx.M{}
	for _, r := range rows {
		out = append(out, httpx.M{"id": r["id"], "provider": r["provider"], "number": r["number"], "holder": r["holder"],
			"sort_order": r.Float("sort_order"), "status": r["status"]})
	}
	if len(out) == 0 {
		return defaultMobileAccounts(), nil
	}
	return out, nil
}
