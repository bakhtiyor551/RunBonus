package shop

import (
	"context"
	"database/sql"
	"encoding/base64"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"runbonus/api/internal/config"
	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/notify"
	"runbonus/api/internal/users"
	"runbonus/api/internal/util"
)

var statusLabels = map[string]string{
	"new": "Новый заказ", "confirmed": "Подтверждён", "paid": "Оплачен",
	"delivered": "Доставлен", "cancelled": "Отменён", "qr_issued": "Кроссовки привязаны",
}

func StatusLabel(s string) string {
	if l, ok := statusLabels[s]; ok {
		return l
	}
	return s
}

var receiptDataURL = regexp.MustCompile(`(?is)^data:image/(jpeg|jpg|png|webp);base64,(.+)$`)
var unsafeName = regexp.MustCompile(`[^a-zA-Z0-9._-]`)

// SaveReceipt — чек оплаты в uploads/order-receipts.
func SaveReceipt(key, dataURL string) (string, error) {
	m := receiptDataURL.FindStringSubmatch(dataURL)
	if m == nil {
		return "", httpx.E(400, "Неверный формат чека (JPEG или PNG)")
	}
	ext := "jpg"
	switch strings.ToLower(m[1]) {
	case "png":
		ext = "png"
	case "webp":
		ext = "webp"
	}
	buf, err := base64.StdEncoding.DecodeString(strings.TrimSpace(m[2]))
	if err != nil {
		return "", httpx.E(400, "Неверный формат чека (JPEG или PNG)")
	}
	if len(buf) > 4*1024*1024 {
		return "", httpx.E(400, "Чек не больше 4 МБ")
	}
	dir := filepath.Join(config.C.UploadsRoot, "order-receipts")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	name := "order-" + unsafeName.ReplaceAllString(key, "_") + "." + ext
	if err := os.WriteFile(filepath.Join(dir, name), buf, 0o644); err != nil {
		return "", err
	}
	return "/api/uploads/order-receipts/" + name, nil
}

type OrderInput struct {
	ProductID                                     any
	Size, Color, ColorID                          string
	Quantity                                      any
	CustomerName, Phone, City, Address, Comment   string
	DeliveryMethod, PaymentMethod, PaymentDetails string
	ReceiptBase64, ReceiptURL                     string
	ApplyDeliveryFee                              bool
}

func trimNil(s string) any { return util.NilIfEmpty(strings.TrimSpace(s)) }

// assertSizeInStock — assertProductSizeInStock (цвет из каталога или со склада).
func assertSizeInStock(ctx context.Context, tx *sql.Tx, productID any, size, color, colorID string, qty float64) error {
	if size == "" {
		return nil
	}
	unavailable := httpx.E(400, "Выбранный размер недоступен для этого цвета")
	var colorRow db.Row
	var err error
	if colorID != "" {
		colorRow, err = db.One(ctx, tx, "SELECT id, label FROM product_colors WHERE id = ? AND product_id = ? AND status = 'active'", colorID, productID)
	} else if strings.TrimSpace(color) != "" {
		colorRow, err = db.One(ctx, tx, "SELECT id, label FROM product_colors WHERE product_id = ? AND label = ? AND status = 'active'", productID, strings.TrimSpace(color))
		if err == nil && colorRow == nil {
			all, e := db.Query(ctx, tx, "SELECT id, label FROM product_colors WHERE product_id = ? AND status = 'active'", productID)
			err = e
			for _, c := range all {
				if strings.EqualFold(colorLabel(c["label"]), strings.TrimSpace(color)) {
					colorRow = c
					break
				}
			}
		}
	}
	if err != nil && !db.IsNoTable(err) {
		return err
	}
	if colorRow != nil {
		labeled, err := db.Query(ctx, tx, `SELECT stock_qty FROM product_sizes WHERE product_id = ? AND size = ? AND color_label = ? AND status = 'active'`,
			productID, size, colorLabel(colorRow["label"]))
		switch {
		case err != nil && !db.IsBadField(err):
			return err
		case err == nil && len(labeled) > 0:
			if labeled[0].Float("stock_qty") >= qty {
				return nil
			}
			return unavailable
		case err == nil:
			any, err := db.Query(ctx, tx, "SELECT 1 FROM product_sizes WHERE product_id = ? AND TRIM(color_label) <> '' LIMIT 1", productID)
			if err != nil && !db.IsBadField(err) {
				return err
			}
			if len(any) > 0 {
				return unavailable
			}
		}
		perColor, err := db.Query(ctx, tx, "SELECT * FROM product_color_sizes WHERE product_color_id = ? AND size = ? AND status = 'active'", colorRow["id"], size)
		if err != nil && !db.IsNoTable(err) {
			return err
		}
		if err == nil {
			anyForColor, err := db.Query(ctx, tx, "SELECT 1 FROM product_color_sizes WHERE product_color_id = ? LIMIT 1", colorRow["id"])
			if err != nil {
				return err
			}
			if len(anyForColor) > 0 {
				if len(perColor) == 0 || perColor[0].Float("stock_qty") < qty {
					return unavailable
				}
				return nil
			}
		}
	}
	rows, err := db.Query(ctx, tx, `SELECT * FROM product_sizes WHERE product_id = ? AND size = ? AND status = 'active'
		AND (color_label IS NULL OR TRIM(color_label) = '')`, productID, size)
	if err != nil {
		return err
	}
	if len(rows) == 0 || rows[0].Float("stock_qty") < qty {
		return httpx.E(400, "Выбранный размер недоступен")
	}
	return nil
}

// decrementStock — списание со склада с записью движения.
func decrementStock(ctx context.Context, tx *sql.Tx, productID any, size, color string, qty float64, orderID int64) error {
	size, label := strings.TrimSpace(size), strings.TrimSpace(color)
	if size == "" {
		return nil
	}
	sel := `SELECT id, stock_qty FROM product_sizes WHERE product_id = ? AND size = ? AND color_label = ? AND status = 'active' FOR UPDATE`
	row, err := db.One(ctx, tx, sel, productID, size, label)
	if err != nil {
		return err
	}
	if row == nil && label != "" {
		if row, err = db.One(ctx, tx, sel, productID, size, ""); err != nil {
			return err
		}
	}
	if row == nil || row.Float("stock_qty") < qty {
		if label != "" {
			return httpx.E(400, fmt.Sprintf("Размер %s, цвет «%s» недоступен", size, label))
		}
		return httpx.E(400, "Выбранный размер недоступен")
	}
	if _, _, err := db.Exec(ctx, tx, "UPDATE product_sizes SET stock_qty = stock_qty - ? WHERE id = ?", qty, row["id"]); err != nil {
		return err
	}
	_, _, err = db.Exec(ctx, tx, `INSERT INTO stock_movements (product_id, size, color_label, quantity, movement_type, reason, order_id, comment)
		VALUES (?, ?, ?, ?, 'out', 'order', ?, NULL)`, productID, size, label, math.Abs(qty), orderID)
	return err
}

func applyContactToProfile(ctx context.Context, tx *sql.Tx, userID int64, customerName, city string) error {
	name, city := strings.TrimSpace(customerName), strings.TrimSpace(city)
	if userID == 0 || (name == "" && city == "") {
		return nil
	}
	parts := strings.Fields(name)
	first, last := "", ""
	if len(parts) > 0 {
		first, last = parts[0], strings.Join(parts[1:], " ")
	}
	display := util.FirstNonEmpty(users.BuildDisplayName(first, last), name)
	var err error
	switch {
	case name != "" && city != "":
		_, _, err = db.Exec(ctx, tx, "UPDATE users SET name = ?, first_name = ?, last_name = ?, city = ? WHERE id = ?", display, util.NilIfEmpty(first), util.NilIfEmpty(last), city, userID)
	case name != "":
		_, _, err = db.Exec(ctx, tx, "UPDATE users SET name = ?, first_name = ?, last_name = ? WHERE id = ?", display, util.NilIfEmpty(first), util.NilIfEmpty(last), userID)
	default:
		_, _, err = db.Exec(ctx, tx, "UPDATE users SET city = ? WHERE id = ?", city, userID)
	}
	return err
}

// CreateOrder — createOrder (оплата деньгами; бонусы отключены).
func CreateOrder(ctx context.Context, in OrderInput, userID int64) (httpx.M, error) {
	dm, err := deliveryByID(ctx, in.DeliveryMethod)
	if err != nil {
		return nil, err
	}
	if in.DeliveryMethod == "" || dm == nil || dm["status"] != "active" {
		return nil, httpx.E(400, "Выберите способ доставки")
	}
	if dm["requiresAddress"] == true && strings.TrimSpace(in.Address) == "" {
		return nil, httpx.E(400, "Укажите адрес доставки")
	}
	pm, err := paymentByID(ctx, in.PaymentMethod)
	if err != nil {
		return nil, err
	}
	if in.PaymentMethod == "" || pm == nil || pm["status"] != "active" {
		return nil, httpx.E(400, "Выберите способ оплаты")
	}
	if in.PaymentMethod == "bonus" {
		return nil, httpx.EC(400, "Оплата бонусами отключена. Выберите другой способ оплаты.", "BONUS_PAYMENT_DISABLED")
	}
	transfer := pm["usesTransferModal"] == true || in.PaymentMethod == "mobile"
	if transfer {
		if strings.TrimSpace(in.PaymentDetails) == "" {
			return nil, httpx.E(400, "Укажите номер кошелька, с которого вы перевели")
		}
		if in.ReceiptBase64 == "" && in.ReceiptURL == "" {
			return nil, httpx.E(400, "Загрузите чек перевода")
		}
	} else if pm["needsDetails"] == true && strings.TrimSpace(in.PaymentDetails) == "" {
		return nil, httpx.E(400, "Укажите данные для выбранного способа оплаты")
	}

	qtyRaw := db.ToFloat(httpx.ToString(in.Quantity))
	if in.Quantity == nil {
		qtyRaw = 1
	}
	if qtyRaw == 0 {
		qtyRaw = 1
	}
	qty := math.Max(1, math.Min(10, qtyRaw))

	var orderID int64
	var product db.Row
	err = db.Tx(ctx, func(tx *sql.Tx) error {
		var err error
		if product, err = db.One(ctx, tx, "SELECT * FROM products WHERE id = ? AND status = 'active'", in.ProductID); err != nil {
			return err
		}
		if product == nil {
			return httpx.E(404, "Товар не найден")
		}
		if in.Size != "" {
			if err := assertSizeInStock(ctx, tx, in.ProductID, in.Size, in.Color, in.ColorID, qty); err != nil {
				return err
			}
		}
		price := product.Float("price")
		subtotal := util.Round(price*qty, 2)
		fee := 0.0
		if in.ApplyDeliveryFee {
			fee = db.ToFloat(dm["price"])
		}
		total := util.Round(subtotal+fee, 2)
		orderID, _, err = db.Exec(ctx, tx, `INSERT INTO shop_orders
			(user_id, product_id, size, order_color, quantity, price, total_amount, customer_name, phone, city, address, delivery_method, delivery_fee, comment, payment_method, payment_details, status)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
			nullID(userID), in.ProductID, util.NilIfEmpty(in.Size), trimNil(in.Color), qty, price, total,
			strings.TrimSpace(in.CustomerName), strings.TrimSpace(in.Phone), trimNil(in.City), trimNil(in.Address),
			in.DeliveryMethod, fee, trimNil(in.Comment), in.PaymentMethod, trimNil(in.PaymentDetails))
		if db.IsBadField(err) {
			orderID, _, err = db.Exec(ctx, tx, `INSERT INTO shop_orders
				(user_id, product_id, size, quantity, price, total_amount, customer_name, phone, city, address, comment, payment_method, payment_details, status)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
				nullID(userID), in.ProductID, util.NilIfEmpty(in.Size), qty, price, total,
				strings.TrimSpace(in.CustomerName), strings.TrimSpace(in.Phone), trimNil(in.City), trimNil(in.Address),
				trimNil(in.Comment), in.PaymentMethod, trimNil(in.PaymentDetails))
		}
		if err != nil {
			return err
		}
		if in.Size != "" {
			if err := decrementStock(ctx, tx, in.ProductID, in.Size, in.Color, qty, orderID); err != nil {
				return err
			}
		}
		return applyContactToProfile(ctx, tx, userID, in.CustomerName, in.City)
	})
	if err != nil {
		return nil, err
	}

	receipt := in.ReceiptURL
	if transfer && receipt == "" && in.ReceiptBase64 != "" {
		if receipt, err = SaveReceipt(fmt.Sprint(orderID), in.ReceiptBase64); err != nil {
			return nil, err
		}
	}
	if receipt != "" {
		if _, _, err := db.Exec(ctx, db.Pool, "UPDATE shop_orders SET payment_receipt_url = ? WHERE id = ?", receipt, orderID); err != nil && !db.IsBadField(err) {
			return nil, err
		}
	}
	order, err := OrderByID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	notifyOrderTelegram(order, product)
	return order, nil
}

func nullID(id int64) any {
	if id == 0 {
		return nil
	}
	return id
}

const orderJoin = `FROM shop_orders o JOIN products p ON p.id = o.product_id LEFT JOIN couriers c ON c.id = o.courier_id`

func mapOrder(ctx context.Context, r db.Row) httpx.M {
	color := r["order_color"]
	if r.Str("order_color") == "" {
		color = r["product_color"]
	}
	var dmLabel any
	if dm := r.Str("delivery_method"); dm != "" {
		dmLabel = DeliveryLabel(ctx, dm)
	}
	courierID := r["courier_id"]
	return httpx.M{
		"id": r["id"], "user_id": r["user_id"], "product_id": r["product_id"], "product_name": r["product_name"],
		"product_color": color, "order_color": util.NilIfEmpty(r.Str("order_color")), "assigned_shoe_id": r["assigned_shoe_id"],
		"size": r["size"], "quantity": r["quantity"], "price": r.Float("price"), "total_amount": r.Float("total_amount"),
		"customer_name": r["customer_name"], "phone": r["phone"], "city": r["city"], "address": r["address"],
		"delivery_method": util.NilIfEmpty(r.Str("delivery_method")), "delivery_fee": r.Float("delivery_fee"),
		"delivery_method_label": dmLabel, "comment": r["comment"],
		"payment_method": r["payment_method"], "payment_method_label": PaymentLabel(ctx, r.Str("payment_method")),
		"payment_details": r["payment_details"], "payment_receipt_url": util.NilIfEmpty(r.Str("payment_receipt_url")),
		"status": r["status"], "status_label": StatusLabel(r.Str("status")),
		"courier_id": courierID, "courier_name": util.NilIfEmpty(r.Str("courier_name")), "courier_phone": util.NilIfEmpty(r.Str("courier_phone")),
		"delivery_assigned_at": util.NilIfEmpty(r.Str("delivery_assigned_at")),
		"created_at":           r["created_at"], "updated_at": r["updated_at"],
	}
}

func OrderByID(ctx context.Context, id int64) (httpx.M, error) {
	r, err := db.One(ctx, db.Pool, `SELECT o.*, p.name AS product_name, p.color AS product_color, c.name AS courier_name, c.phone AS courier_phone `+orderJoin+` WHERE o.id = ?`, id)
	if err != nil || r == nil {
		return nil, err
	}
	return mapOrder(ctx, r), nil
}

// UserOrders — listUserOrders.
func UserOrders(ctx context.Context, userID int64) ([]httpx.M, error) {
	rows, err := db.Query(ctx, db.Pool, `SELECT o.*, p.name AS product_name, p.color AS product_color,
			c.name AS courier_name, c.phone AS courier_phone, s.unique_id AS assigned_shoe_code,
			(SELECT pi.image_url FROM product_images pi WHERE pi.product_id = o.product_id ORDER BY pi.sort_order ASC, pi.id ASC LIMIT 1) AS product_image
		`+orderJoin+` LEFT JOIN shoes s ON s.id = o.assigned_shoe_id
		WHERE o.user_id = ? ORDER BY o.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		m := mapOrder(ctx, r)
		m["assigned_shoe_code"] = util.NilIfEmpty(r.Str("assigned_shoe_code"))
		m["product_image"] = util.NilIfEmpty(r.Str("product_image"))
		out = append(out, m)
	}
	return out, nil
}

func orDash(s string) string {
	if s == "" {
		return "—"
	}
	return s
}

func orderTelegramText(o httpx.M, product db.Row, withReceiptNote bool) string {
	e := func(k string) string { return notify.EscapeHTML(httpx.ToString(o[k])) }
	model := product.Str("name")
	if model == "" {
		model = httpx.ToString(o["product_name"])
	}
	var addr []string
	for _, k := range []string{"city", "address"} {
		if s := httpx.ToString(o[k]); s != "" {
			addr = append(addr, s)
		}
	}
	var b strings.Builder
	b.WriteString("🛒 <b>Новый заказ кроссовок RunBonus</b>\n\n")
	fmt.Fprintf(&b, "Клиент: %s\nТелефон: %s\nМодель: %s\n", e("customer_name"), e("phone"), notify.EscapeHTML(model))
	fmt.Fprintf(&b, "Размер: %s\nКоличество: %v\nЦена: %v сомони\n", notify.EscapeHTML(orDash(httpx.ToString(o["size"]))), o["quantity"], o["total_amount"])
	fmt.Fprintf(&b, "Город: %s\n", notify.EscapeHTML(orDash(httpx.ToString(o["city"]))))
	fmt.Fprintf(&b, "Доставка: %s\n", notify.EscapeHTML(orDash(util.FirstNonEmpty(httpx.ToString(o["delivery_method_label"]), httpx.ToString(o["delivery_method"])))))
	fmt.Fprintf(&b, "Адрес: %s\n", notify.EscapeHTML(orDash(strings.Join(addr, ", "))))
	if c := httpx.ToString(o["courier_name"]); c != "" {
		fmt.Fprintf(&b, "Курьер: %s · %s\n", notify.EscapeHTML(c), e("courier_phone"))
	}
	fmt.Fprintf(&b, "Комментарий: %s\n", notify.EscapeHTML(orDash(httpx.ToString(o["comment"]))))
	fmt.Fprintf(&b, "Оплата: %s\n", notify.EscapeHTML(orDash(util.FirstNonEmpty(httpx.ToString(o["payment_method_label"]), httpx.ToString(o["payment_method"])))))
	if d := httpx.ToString(o["payment_details"]); d != "" {
		if o["payment_method"] == "mobile" {
			fmt.Fprintf(&b, "Реквизиты перевода:\n%s\n", notify.EscapeHTML(d))
		} else {
			fmt.Fprintf(&b, "Данные оплаты: %s\n", notify.EscapeHTML(d))
		}
	}
	if withReceiptNote && o["payment_receipt_url"] != nil {
		b.WriteString("📎 Чек оплаты — на фото ниже\n")
	}
	fmt.Fprintf(&b, "\nСтатус: Новый заказ\nID: #%v", o["id"])
	return b.String()
}

func notifyOrderTelegram(o httpx.M, product db.Row) {
	receipt := httpx.ToString(o["payment_receipt_url"])
	if o["payment_receipt_url"] == nil {
		receipt = ""
	}
	photo := notify.ResolveReceiptPhoto(receipt)
	if photo != "" {
		if notify.TelegramPhoto(photo, orderTelegramText(o, product, true)) != "" {
			return
		}
		log.Println("[Telegram] Не удалось отправить фото чека, отправляем только текст")
	}
	text := orderTelegramText(o, product, false)
	if receipt != "" && photo == "" {
		text += "\nЧек (файл недоступен): " + notify.EscapeHTML(receipt)
	}
	notify.Telegram(text)
}
