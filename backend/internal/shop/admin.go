package shop

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strings"

	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
	"runbonus/api/internal/notify"
	"runbonus/api/internal/shoes"
)

// --- товары ---

func AdminProducts(ctx context.Context) ([]httpx.M, error) {
	products, err := db.Query(ctx, db.Pool, "SELECT * FROM products ORDER BY id DESC")
	if err != nil || len(products) == 0 {
		return []httpx.M{}, err
	}
	ex, err := loadExtras(ctx, idsArgs(products, "id"))
	if err != nil {
		return nil, err
	}
	cats, err := categoriesMap(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(products))
	for _, p := range products {
		id := p.Int("id")
		var colors []db.Row
		for _, c := range ex.colors {
			if c.Int("product_id") == id {
				colors = append(colors, c)
			}
		}
		m := mapProduct(p, byProduct(ex.images, id), byProduct(ex.sizes, id), colors, resolveCategory(cats, p["category_id"]), ex.colorSizes)
		m["slug"], m["description"], m["status"] = p["slug"], p["description"], p["status"]
		out = append(out, m)
	}
	return out, nil
}

func listOfMaps(v any) []httpx.Body {
	l, _ := v.([]any)
	out := make([]httpx.Body, 0, len(l))
	for _, it := range l {
		if m, ok := it.(map[string]any); ok {
			out = append(out, m)
		} else {
			out = append(out, nil)
		}
	}
	return out
}

func orDefault(b httpx.Body, k string, def any) any {
	if v := b.Raw(k); v != nil {
		return httpx.ToString(v)
	}
	return def
}

// SaveProduct — adminSaveProduct (id = 0 — новый товар).
func SaveProduct(ctx context.Context, b httpx.Body, id int64) (db.Row, error) {
	var colorRows []httpx.Body
	for _, c := range listOfMaps(b["colors"]) {
		if c != nil && strings.TrimSpace(c.Str("label")) != "" {
			colorRows = append(colorRows, c)
		}
	}
	primary := any(nil)
	if len(colorRows) > 0 {
		primary = strings.TrimSpace(colorRows[0].Str("label"))
	} else if c := strings.TrimSpace(b.Str("color")); c != "" {
		primary = c
	}
	var catID any
	if strings.TrimSpace(b.Str("category_id")) != "" {
		catID = NormalizeCategoryID(b.Raw("category_id"))
	}
	status := b.Str("status")
	if status == "" {
		status = "active"
	}
	sizes := listOfMaps(b["sizes"])
	isNew := id == 0

	err := db.Tx(ctx, func(tx *sql.Tx) error {
		if id != 0 {
			if _, _, err := db.Exec(ctx, tx, `UPDATE products SET name=?, slug=?, description=?, color=?, price=?, status=?, category_id=? WHERE id=?`,
				b.Raw("name"), nilEmpty(b.Str("slug")), nilEmpty(b.Str("description")), primary, b.Raw("price"), status, catID, id); err != nil {
				return err
			}
			existing, err := db.Query(ctx, tx, "SELECT size, stock_qty FROM product_sizes WHERE product_id = ?", id)
			if err != nil {
				return err
			}
			stock := map[string]float64{}
			for _, s := range existing {
				stock[s.Str("size")] = s.Float("stock_qty")
			}
			for _, q := range []string{"DELETE FROM product_sizes WHERE product_id = ?", "DELETE FROM product_images WHERE product_id = ?", "DELETE FROM product_colors WHERE product_id = ?"} {
				if _, _, err := db.Exec(ctx, tx, q, id); err != nil && !db.IsNoTable(err) {
					return err
				}
			}
			// Остатки по размерам сохраняются при редактировании.
			for _, s := range sizes {
				if s == nil {
					continue
				}
				if _, _, err := db.Exec(ctx, tx, "INSERT INTO product_sizes (product_id, size, stock_qty, status) VALUES (?,?,?,?)",
					id, s.Raw("size"), stock[s.Str("size")], orDefault(s, "status", "active")); err != nil {
					return err
				}
			}
		} else {
			newID, _, err := db.Exec(ctx, tx, "INSERT INTO products (name, slug, description, color, price, status, category_id) VALUES (?,?,?,?,?,?,?)",
				b.Raw("name"), nilEmpty(b.Str("slug")), nilEmpty(b.Str("description")), primary, b.Raw("price"), status, catID)
			if err != nil {
				return err
			}
			id = newID
		}

		for _, img := range listOfMaps(b["images"]) {
			if img == nil || img.Str("image_url") == "" {
				continue
			}
			if _, _, err := db.Exec(ctx, tx, "INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?,?,?)", id, img.Str("image_url"), orDefault(img, "sort_order", 0)); err != nil {
				return err
			}
		}

		if len(colorRows) > 0 {
			for i, c := range colorRows {
				cs := "active"
				if c.Str("status") == "inactive" {
					cs = "inactive"
				}
				cid, _, err := db.Exec(ctx, tx, "INSERT INTO product_colors (product_id, label, hex_code, image_url, sort_order, status) VALUES (?,?,?,?,?,?)",
					id, strings.TrimSpace(c.Str("label")), nilEmpty(strings.TrimSpace(c.Str("hex_code"))), nilEmpty(strings.TrimSpace(c.Str("image_url"))),
					orDefault(c, "sort_order", (i+1)*10), cs)
				if err != nil {
					return err
				}
				for _, s := range listOfMaps(c["sizes"]) {
					if s == nil || strings.TrimSpace(s.Str("size")) == "" {
						continue
					}
					if _, _, err := db.Exec(ctx, tx, "INSERT INTO product_color_sizes (product_color_id, size, stock_qty, status) VALUES (?,?,?,?)",
						cid, strings.TrimSpace(s.Str("size")), orDefault(s, "stock_qty", 0), orDefault(s, "status", "active")); err != nil && !db.IsNoTable(err) {
						return err
					}
				}
			}
		} else if isNew {
			// В Node при редактировании без цветов размеры вставлялись повторно (дубль ключа) — здесь только для нового товара.
			for _, s := range sizes {
				if s == nil || strings.TrimSpace(s.Str("size")) == "" {
					continue
				}
				if _, _, err := db.Exec(ctx, tx, "INSERT INTO product_sizes (product_id, size, stock_qty, status) VALUES (?,?,?,?)",
					id, strings.TrimSpace(s.Str("size")), orDefault(s, "stock_qty", 0), orDefault(s, "status", "active")); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return db.One(ctx, db.Pool, "SELECT * FROM products WHERE id = ?", id)
}

func DeleteProduct(ctx context.Context, raw string) (httpx.M, error) {
	id := db.ToFloat(raw)
	if id <= 0 || math.IsInf(id, 0) {
		return nil, httpx.E(400, "Некорректный ID товара")
	}
	p, err := db.One(ctx, db.Pool, "SELECT id, name FROM products WHERE id = ?", id)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, httpx.E(404, "Товар не найден")
	}
	if o, err := db.One(ctx, db.Pool, "SELECT id FROM shop_orders WHERE product_id = ? LIMIT 1", id); err != nil || o != nil {
		if err != nil {
			return nil, err
		}
		return nil, httpx.E(409, "Нельзя удалить товар: есть связанные заказы")
	}
	if _, _, err := db.Exec(ctx, db.Pool, "DELETE FROM products WHERE id = ?", id); err != nil {
		return nil, err
	}
	return httpx.M{"ok": true, "id": id}, nil
}

// --- категории магазина ---

func AllShopCategories(ctx context.Context) ([]httpx.M, error) {
	ensureCategoryTable(ctx)
	return listCategories(ctx, false)
}

func CreateShopCategory(ctx context.Context, b httpx.Body) (httpx.M, error) {
	ensureCategoryTable(ctx)
	id := NormalizeCode(util2(b.Str("id"), b.Str("slug")))
	if id == "" {
		return nil, httpx.E(400, "Укажите код категории (латиница)")
	}
	name := strings.TrimSpace(b.Str("name"))
	if name == "" {
		return nil, httpx.E(400, "Укажите название")
	}
	if dup, err := db.One(ctx, db.Pool, "SELECT id FROM shop_categories WHERE id = ?", id); err != nil || dup != nil {
		if err != nil {
			return nil, err
		}
		return nil, httpx.E(409, "Такой код уже есть")
	}
	slug := strings.TrimSpace(b.Str("slug"))
	if slug == "" {
		slug = id
	}
	status := "active"
	if b.Str("status") == "inactive" {
		status = "inactive"
	}
	if _, _, err := db.Exec(ctx, db.Pool, "INSERT INTO shop_categories (id, name, slug, sort_order, status) VALUES (?, ?, ?, ?, ?)", id, name, slug, b.Float("sort_order"), status); err != nil {
		return nil, err
	}
	row, err := db.One(ctx, db.Pool, "SELECT c.*, 0 AS product_count FROM shop_categories c WHERE c.id = ?", id)
	if err != nil {
		return nil, err
	}
	return mapCategory(row), nil
}

func util2(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func UpdateShopCategory(ctx context.Context, id string, b httpx.Body) (httpx.M, error) {
	ensureCategoryTable(ctx)
	row, err := db.One(ctx, db.Pool, "SELECT * FROM shop_categories WHERE id = ?", id)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, httpx.E(404, "Категория не найдена")
	}
	slug := trimmedOr(b, "slug", row["slug"])
	if slug == nil || httpx.ToString(slug) == "" {
		slug = id
	}
	if _, _, err := db.Exec(ctx, db.Pool, "UPDATE shop_categories SET name = ?, slug = ?, sort_order = ?, status = ? WHERE id = ?",
		trimmedOr(b, "name", row["name"]), slug, sortOf(b, row["sort_order"]), statusOf(b, row["status"]), id); err != nil {
		return nil, err
	}
	all, err := listCategories(ctx, false)
	if err != nil {
		return nil, err
	}
	for _, c := range all {
		if keyOf(c["id"]) == id {
			return c, nil
		}
	}
	return nil, nil
}

// --- категории товаров (product_categories) ---

var defaultProductCategories = [][2]string{{"shoes", "Кроссовки"}, {"tshirt", "Футболки"}, {"shorts", "Шорты"}}

var productCatsTable seededTable

func productCatsReady(ctx context.Context) bool {
	return productCatsTable.ensure(ctx, "product_categories", func() error {
		for i, c := range defaultProductCategories {
			if _, _, err := db.Exec(ctx, db.Pool, "INSERT INTO product_categories (id, name, sort_order, status, is_builtin) VALUES (?, ?, ?, 'active', 1)", c[0], c[1], (i+1)*10); err != nil {
				return err
			}
		}
		return nil
	})
}

func mapProductCategory(r db.Row) httpx.M {
	return httpx.M{"id": r["id"], "name": r["name"], "sort_order": r.Float("sort_order"), "status": r["status"], "is_builtin": r.Bool("is_builtin")}
}

func AllProductCategories(ctx context.Context) ([]httpx.M, error) {
	if !productCatsReady(ctx) {
		out := []httpx.M{}
		for i, c := range defaultProductCategories {
			out = append(out, httpx.M{"id": c[0], "name": c[1], "sort_order": float64((i + 1) * 10), "status": "active", "is_builtin": true})
		}
		return out, nil
	}
	rows, err := db.Query(ctx, db.Pool, "SELECT * FROM product_categories ORDER BY sort_order ASC, id ASC")
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapProductCategory(r))
	}
	return out, nil
}

func productCategoryByID(ctx context.Context, id string) (httpx.M, error) {
	r, err := db.One(ctx, db.Pool, "SELECT * FROM product_categories WHERE id = ?", id)
	if err != nil || r == nil {
		return nil, err
	}
	return mapProductCategory(r), nil
}

func CreateProductCategory(ctx context.Context, b httpx.Body) (httpx.M, error) {
	productCatsReady(ctx)
	id, name := NormalizeCode(b.Str("id")), strings.TrimSpace(b.Str("name"))
	if id == "" || name == "" {
		return nil, httpx.E(400, "Укажите код и название категории")
	}
	if dup, err := db.One(ctx, db.Pool, "SELECT id FROM product_categories WHERE id = ?", id); err != nil || dup != nil {
		if err != nil {
			return nil, err
		}
		return nil, httpx.E(409, "Такой код уже существует")
	}
	status := "active"
	if b.Str("status") == "inactive" {
		status = "inactive"
	}
	if _, _, err := db.Exec(ctx, db.Pool, "INSERT INTO product_categories (id, name, sort_order, status, is_builtin) VALUES (?, ?, ?, ?, 0)", id, name, b.Float("sort_order"), status); err != nil {
		return nil, err
	}
	return productCategoryByID(ctx, id)
}

func UpdateProductCategory(ctx context.Context, id string, b httpx.Body) (httpx.M, error) {
	productCatsReady(ctx)
	row, err := db.One(ctx, db.Pool, "SELECT * FROM product_categories WHERE id = ?", id)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, httpx.E(404, "Категория не найдена")
	}
	if _, _, err := db.Exec(ctx, db.Pool, "UPDATE product_categories SET name = ?, sort_order = ?, status = ? WHERE id = ?",
		trimmedOr(b, "name", row["name"]), sortOf(b, row["sort_order"]), statusOf(b, row["status"]), id); err != nil {
		return nil, err
	}
	return productCategoryByID(ctx, id)
}

// --- курьеры ---

func mapCourier(r db.Row) httpx.M {
	return httpx.M{"id": r["id"], "name": r["name"], "phone": r["phone"], "status": r["status"], "created_at": r["created_at"], "updated_at": r["updated_at"]}
}

func Couriers(ctx context.Context) ([]httpx.M, error) {
	rows, err := db.Query(ctx, db.Pool, "SELECT id, name, phone, status, created_at, updated_at FROM couriers ORDER BY name ASC")
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapCourier(r))
	}
	return out, nil
}

func courierByID(ctx context.Context, id any) (httpx.M, error) {
	r, err := db.One(ctx, db.Pool, "SELECT * FROM couriers WHERE id = ?", id)
	if err != nil || r == nil {
		return nil, err
	}
	return mapCourier(r), nil
}

func CreateCourier(ctx context.Context, b httpx.Body) (httpx.M, error) {
	name, phone := strings.TrimSpace(b.Str("name")), strings.TrimSpace(b.Str("phone"))
	if name == "" || phone == "" {
		return nil, httpx.E(400, "Укажите имя и телефон курьера")
	}
	id, _, err := db.Exec(ctx, db.Pool, "INSERT INTO couriers (name, phone, status) VALUES (?, ?, 'active')", name, phone)
	if err != nil {
		return nil, err
	}
	return courierByID(ctx, id)
}

func UpdateCourier(ctx context.Context, id float64, b httpx.Body) (httpx.M, error) {
	c, err := courierByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if c == nil {
		return nil, httpx.E(404, "Курьер не найден")
	}
	status := any(b.Str("status"))
	if status == "" {
		status = c["status"]
	}
	if _, _, err := db.Exec(ctx, db.Pool, "UPDATE couriers SET name = ?, phone = ?, status = ? WHERE id = ?",
		trimmedOr(b, "name", c["name"]), trimmedOr(b, "phone", c["phone"]), status, id); err != nil {
		return nil, err
	}
	return courierByID(ctx, id)
}

func AssignCourier(ctx context.Context, orderID, courierID float64) error {
	o, err := db.One(ctx, db.Pool, "SELECT id, status FROM shop_orders WHERE id = ?", orderID)
	if err != nil {
		return err
	}
	if o == nil {
		return httpx.E(404, "Заказ не найден")
	}
	if o.Str("status") == "cancelled" {
		return httpx.E(400, "Нельзя назначить курьера на отменённый заказ")
	}
	c, err := courierByID(ctx, courierID)
	if err != nil {
		return err
	}
	if c == nil || c["status"] != "active" {
		return httpx.E(400, "Курьер не найден или неактивен")
	}
	_, _, err = db.Exec(ctx, db.Pool, "UPDATE shop_orders SET courier_id = ?, delivery_assigned_at = NOW() WHERE id = ?", courierID, orderID)
	if db.IsBadField(err) {
		return httpx.E(500, "Примените миграцию курьеров на сервере (013_couriers)")
	}
	return err
}

// --- склад ---

func productColorsForStock(ctx context.Context, productID any) ([]httpx.M, error) {
	rows, err := db.Query(ctx, db.Pool, "SELECT label, hex_code, status FROM product_colors WHERE product_id = ? AND status = 'active' ORDER BY sort_order, id", productID)
	if err != nil && !db.IsNoTable(err) {
		return nil, err
	}
	if len(rows) > 0 {
		out := make([]httpx.M, 0, len(rows))
		for _, r := range rows {
			out = append(out, httpx.M{"label": r["label"], "hex_code": nilEmpty(r.Str("hex_code"))})
		}
		return out, nil
	}
	p, err := db.One(ctx, db.Pool, "SELECT color FROM products WHERE id = ?", productID)
	if err != nil {
		return nil, err
	}
	if p != nil && p.Str("color") != "" {
		return []httpx.M{{"label": p["color"], "hex_code": nil}}, nil
	}
	return []httpx.M{}, nil
}

func WarehouseStock(ctx context.Context) ([]httpx.M, error) {
	rows, err := db.Query(ctx, db.Pool, `SELECT p.id AS product_id, p.name AS product_name, p.status AS product_status,
			pc.name AS category_name, ps.id AS size_id, ps.size, ps.color_label, ps.stock_qty, ps.status AS size_status
		FROM products p
		LEFT JOIN product_categories pc ON pc.id COLLATE utf8mb4_unicode_ci = p.category_id
		LEFT JOIN product_sizes ps ON ps.product_id = p.id
		ORDER BY p.id DESC, ps.size ASC, ps.color_label ASC`)
	if err != nil {
		return nil, err
	}
	var order []int64
	byID := map[int64]httpx.M{}
	for _, r := range rows {
		pid := r.Int("product_id")
		item := byID[pid]
		if item == nil {
			item = httpx.M{"product_id": r["product_id"], "product_name": r["product_name"], "product_status": r["product_status"],
				"category_name": r["category_name"], "total_stock": 0.0, "colors": []httpx.M{}, "sizes": []httpx.M{}}
			byID[pid] = item
			order = append(order, pid)
		}
		if r.Str("size") == "" {
			continue
		}
		label := strings.TrimSpace(r.Str("color_label"))
		qty := r.Float("stock_qty")
		sizeLabel := r.Str("size")
		if label != "" {
			sizeLabel += " · " + label
		}
		item["sizes"] = append(item["sizes"].([]httpx.M), httpx.M{"id": r["size_id"], "size": r["size"], "color_label": label,
			"stock_qty": qty, "status": r["size_status"], "label": sizeLabel})
		if r.Str("size_status") == "active" {
			item["total_stock"] = item["total_stock"].(float64) + qty
		}
	}
	out := make([]httpx.M, 0, len(order))
	for _, pid := range order {
		item := byID[pid]
		colors, err := productColorsForStock(ctx, pid)
		if err != nil {
			return nil, err
		}
		item["colors"] = colors
		out = append(out, item)
	}
	return out, nil
}

func StockMovements(ctx context.Context, limitRaw string) ([]httpx.M, error) {
	limit := db.ToFloat(limitRaw)
	if limit == 0 {
		limit = 100
	}
	limit = math.Min(500, math.Max(1, limit))
	rows, err := db.Query(ctx, db.Pool, `SELECT sm.*, p.name AS product_name FROM stock_movements sm
		JOIN products p ON p.id = sm.product_id ORDER BY sm.created_at DESC LIMIT ?`, int(limit))
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		out = append(out, httpx.M{"id": r["id"], "product_id": r["product_id"], "product_name": r["product_name"], "size": r["size"],
			"color_label": strings.TrimSpace(r.Str("color_label")), "quantity": r["quantity"], "movement_type": r["movement_type"],
			"reason": r["reason"], "order_id": r["order_id"], "comment": r["comment"], "created_at": r["created_at"]})
	}
	return out, nil
}

func AddStock(ctx context.Context, b httpx.Body) (httpx.M, error) {
	productID := b.Float("product_id")
	size := strings.TrimSpace(b.Str("size"))
	label := strings.TrimSpace(b.Str("color"))
	qty := math.Max(1, math.Min(9999, b.Float("quantity")))
	if productID == 0 || size == "" {
		return nil, httpx.E(400, "Укажите товар, размер и количество")
	}
	colors, err := productColorsForStock(ctx, productID)
	if err != nil {
		return nil, err
	}
	if len(colors) > 0 && label == "" {
		return nil, httpx.E(400, "Выберите цвет товара")
	}
	var product db.Row
	err = db.Tx(ctx, func(tx *sql.Tx) error {
		var err error
		if product, err = db.One(ctx, tx, "SELECT id, name FROM products WHERE id = ?", productID); err != nil {
			return err
		}
		if product == nil {
			return httpx.E(404, "Товар не найден")
		}
		row, err := db.One(ctx, tx, "SELECT id, stock_qty FROM product_sizes WHERE product_id = ? AND size = ? AND color_label = ? FOR UPDATE", productID, size, label)
		if err != nil {
			return err
		}
		if row != nil {
			_, _, err = db.Exec(ctx, tx, "UPDATE product_sizes SET stock_qty = stock_qty + ?, status = 'active' WHERE id = ?", qty, row["id"])
		} else {
			_, _, err = db.Exec(ctx, tx, "INSERT INTO product_sizes (product_id, size, color_label, stock_qty, status) VALUES (?, ?, ?, ?, 'active')", productID, size, label, qty)
		}
		if err != nil {
			return err
		}
		var parts []string
		if c := strings.TrimSpace(b.Str("comment")); c != "" {
			parts = append(parts, c)
		}
		if label != "" {
			parts = append(parts, "Цвет: "+label)
		}
		_, _, err = db.Exec(ctx, tx, `INSERT INTO stock_movements (product_id, size, color_label, quantity, movement_type, reason, order_id, comment)
			VALUES (?, ?, ?, ?, 'in', 'receipt', NULL, ?)`, productID, size, label, qty, nilEmpty(strings.Join(parts, " · ")))
		return err
	})
	if err != nil {
		return nil, err
	}
	stock, err := db.Scalar(ctx, db.Pool, "SELECT stock_qty FROM product_sizes WHERE product_id = ? AND size = ? AND color_label = ?", productID, size, label)
	if err != nil {
		return nil, err
	}
	return httpx.M{"ok": true, "product_id": productID, "product_name": product["name"], "size": size, "color": nilEmpty(label),
		"added": qty, "stock_qty": db.ToFloat(stock)}, nil
}

func restoreStock(ctx context.Context, tx *sql.Tx, orderID float64) error {
	o, err := db.One(ctx, tx, "SELECT product_id, size, order_color, quantity FROM shop_orders WHERE id = ?", orderID)
	if err != nil || o == nil || o.Str("size") == "" {
		return err
	}
	if done, err := db.One(ctx, tx, "SELECT id FROM stock_movements WHERE order_id = ? AND reason = 'cancel' LIMIT 1", orderID); err != nil || done != nil {
		return err
	}
	if deducted, err := db.One(ctx, tx, "SELECT id FROM stock_movements WHERE order_id = ? AND reason = 'order' LIMIT 1", orderID); err != nil || deducted == nil {
		return err
	}
	qty := o.Float("quantity")
	if qty == 0 {
		qty = 1
	}
	qty = math.Max(1, qty)
	size, label := strings.TrimSpace(o.Str("size")), strings.TrimSpace(o.Str("order_color"))
	row, err := db.One(ctx, tx, "SELECT id FROM product_sizes WHERE product_id = ? AND size = ? AND color_label = ? FOR UPDATE", o["product_id"], size, label)
	if err != nil {
		return err
	}
	if row != nil {
		_, _, err = db.Exec(ctx, tx, "UPDATE product_sizes SET stock_qty = stock_qty + ? WHERE id = ?", qty, row["id"])
	} else {
		_, _, err = db.Exec(ctx, tx, "INSERT INTO product_sizes (product_id, size, color_label, stock_qty, status) VALUES (?, ?, ?, ?, 'active')", o["product_id"], size, label, qty)
	}
	if err != nil {
		return err
	}
	_, _, err = db.Exec(ctx, tx, `INSERT INTO stock_movements (product_id, size, color_label, quantity, movement_type, reason, order_id, comment)
		VALUES (?, ?, ?, ?, 'in', 'cancel', ?, 'Возврат при отмене заказа')`, o["product_id"], size, label, qty, orderID)
	return err
}

// --- заказы ---

func AdminOrders(ctx context.Context) ([]httpx.M, error) {
	rows, err := db.Query(ctx, db.Pool, `SELECT o.*, p.name AS product_name, p.color AS product_color,
			s.unique_id AS assigned_shoe_code, c.name AS courier_name, c.phone AS courier_phone
		`+orderJoin+` LEFT JOIN shoes s ON s.id = o.assigned_shoe_id ORDER BY o.created_at DESC LIMIT 500`)
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		m := mapOrder(ctx, r)
		m["assigned_shoe_code"] = r["assigned_shoe_code"]
		out = append(out, m)
	}
	return out, nil
}

func statusPushBody(o httpx.M, status string) string {
	product := ""
	if n := httpx.ToString(o["product_name"]); n != "" && o["product_name"] != nil {
		product = " «" + n + "»"
	}
	if status == "delivered" {
		return fmt.Sprintf("Заказ #%v%s доставлен. Кроссовки активированы — можно тренироваться!", o["id"], product)
	}
	return fmt.Sprintf("Заказ #%v%s: %s", o["id"], product, StatusLabel(status))
}

func notifyStatus(o httpx.M, prev, next string) {
	uid := int64(db.ToFloat(o["user_id"]))
	if o == nil || uid == 0 || prev == next {
		return
	}
	go func() {
		ctx := context.Background()
		notify.OrderStatus(ctx, uid, int64(db.ToFloat(o["id"])), "Статус заказа", statusPushBody(o, next), next)
	}()
}

// activateShoeForOrder — при доставке: привязанный код или новые кроссовки SHOE-ORD-<id>.
func activateShoeForOrder(ctx context.Context, tx *sql.Tx, order db.Row) error {
	userID := order.Int("user_id")
	if userID == 0 {
		return nil
	}
	var shoe db.Row
	var err error
	if order.Int("assigned_shoe_id") != 0 {
		if shoe, err = db.One(ctx, tx, "SELECT * FROM shoes WHERE id = ? FOR UPDATE", order["assigned_shoe_id"]); err != nil {
			return err
		}
	}
	if shoe == nil {
		uid := fmt.Sprintf("SHOE-ORD-%v", order["id"])
		model := order.Str("product_name")
		if model == "" {
			model = "RunBonus"
		}
		if r := []rune(model); len(r) > 120 {
			model = string(r[:120])
		}
		if shoe, err = db.One(ctx, tx, "SELECT * FROM shoes WHERE unique_id = ? FOR UPDATE", uid); err != nil {
			return err
		}
		if shoe == nil {
			id, _, err := db.Exec(ctx, tx, "INSERT INTO shoes (batch_id, model_name, qr_code, unique_id, status) VALUES (NULL, ?, ?, ?, 'new')", model, uid, uid)
			if err != nil {
				return err
			}
			if shoe, err = db.One(ctx, tx, "SELECT * FROM shoes WHERE id = ? FOR UPDATE", id); err != nil {
				return err
			}
		}
		if _, _, err := db.Exec(ctx, tx, "UPDATE shop_orders SET assigned_shoe_id = ? WHERE id = ?", shoe["id"], order["id"]); err != nil {
			return err
		}
	}
	if shoe.Str("status") == "activated" {
		if by := shoe.Int("activated_by_user_id"); by != 0 && by != userID {
			return httpx.E(409, "Код кроссовок уже активирован другим пользователем")
		}
		if _, _, err := db.Exec(ctx, tx, "UPDATE shoes SET activated_by_user_id = COALESCE(activated_by_user_id, ?), activated_at = COALESCE(activated_at, NOW()) WHERE id = ?", userID, shoe["id"]); err != nil {
			return err
		}
		if _, _, err := db.Exec(ctx, tx, "INSERT INTO user_active_shoes (user_id, shoe_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE shoe_id = VALUES(shoe_id)", userID, shoe["id"]); err != nil {
			return err
		}
		_, err := shoes.EnsureProgress(ctx, tx, userID, shoe.Int("id"))
		return err
	}
	_, err = shoes.ActivateForUserAdmin(ctx, tx, userID, shoe.Str("unique_id"))
	return err
}

var allowedStatuses = map[string]bool{"new": true, "confirmed": true, "paid": true, "delivered": true, "cancelled": true, "qr_issued": true}

func UpdateOrderStatus(ctx context.Context, id float64, status string) (httpx.M, error) {
	if !allowedStatuses[status] {
		return nil, httpx.E(400, "Недопустимый статус")
	}
	var prev string
	err := db.Tx(ctx, func(tx *sql.Tx) error {
		order, err := db.One(ctx, tx, "SELECT * FROM shop_orders WHERE id = ? FOR UPDATE", id)
		if err != nil {
			return err
		}
		if order == nil {
			return httpx.E(404, "Заказ не найден")
		}
		prev = order.Str("status")
		if status == "delivered" {
			if order.Int("user_id") == 0 {
				return httpx.E(400, "У заказа нет пользователя приложения — активация невозможна")
			}
			if p, err := db.One(ctx, tx, "SELECT name FROM products WHERE id = ?", order["product_id"]); err == nil && p != nil {
				order["product_name"] = p["name"]
			}
			if err := activateShoeForOrder(ctx, tx, order); err != nil {
				return err
			}
		}
		if _, _, err := db.Exec(ctx, tx, "UPDATE shop_orders SET status = ? WHERE id = ?", status, id); err != nil {
			return err
		}
		if status == "cancelled" && prev != "cancelled" {
			return restoreStock(ctx, tx, id)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	o, err := OrderByID(ctx, int64(id))
	if err != nil {
		return nil, err
	}
	notifyStatus(o, prev, status)
	return o, nil
}

func AssignQR(ctx context.Context, id float64, raw string) (httpx.M, error) {
	var prev string
	var shoe db.Row
	err := db.Tx(ctx, func(tx *sql.Tx) error {
		order, err := db.One(ctx, tx, "SELECT * FROM shop_orders WHERE id = ? FOR UPDATE", id)
		if err != nil {
			return err
		}
		if order == nil {
			return httpx.E(404, "Заказ не найден")
		}
		if order.Int("user_id") == 0 {
			return httpx.E(400, "У заказа нет привязанного пользователя приложения")
		}
		prev = order.Str("status")
		uid := strings.ToUpper(strings.TrimSpace(raw))
		if uid == "" {
			return httpx.E(400, "Введите код кроссовок")
		}
		if shoe, err = db.One(ctx, tx, "SELECT * FROM shoes WHERE unique_id = ? FOR UPDATE", uid); err != nil {
			return err
		}
		if shoe == nil {
			return httpx.E(404, "Код не найден")
		}
		switch shoe.Str("status") {
		case "blocked", "expired":
			return httpx.E(403, "Этот код недоступен")
		case "activated":
			if shoe.Int("activated_by_user_id") != order.Int("user_id") {
				return httpx.E(409, "Код уже активирован другим пользователем")
			}
		}
		_, _, err = db.Exec(ctx, tx, "UPDATE shop_orders SET assigned_shoe_id = ?, status = IF(status = 'delivered', status, 'qr_issued') WHERE id = ?", shoe["id"], id)
		return err
	})
	if err != nil {
		return nil, err
	}
	updated, err := OrderByID(ctx, int64(id))
	if err != nil {
		return nil, err
	}
	if next := httpx.ToString(updated["status"]); next != prev {
		notifyStatus(updated, prev, next)
	}
	return httpx.M{"order": updated, "shoe": httpx.M{"id": shoe["id"], "unique_id": shoe["unique_id"], "model_name": shoe["model_name"]}}, nil
}
