// Package shop — каталог, оформление и заказы (этап 9).
package shop

import (
	"context"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"

	"runbonus/api/internal/db"
	"runbonus/api/internal/httpx"
)

var fallbackCategories = []struct {
	ID, Name, Slug string
	Sort           int
}{{"shoes", "Кроссовки", "shoes", 10}, {"tshirt", "Футболки", "tshirt", 20}, {"shorts", "Шорты", "shorts", 30}}

var fallbackNames = func() map[string]string {
	m := map[string]string{}
	for _, c := range fallbackCategories {
		m[c.ID] = c.Name
		m[c.Slug] = c.Name
	}
	return m
}()

var legacyShoeIDs = map[string]bool{"1": true, "2": true, "3": true, "running": true, "urban": true, "trail": true}
var allDigits = regexp.MustCompile(`^\d+$`)

// NormalizeCategoryID — число для цифровых id, иначе строка; nil для пустого.
func NormalizeCategoryID(raw any) any {
	if raw == nil {
		return nil
	}
	s := strings.TrimSpace(httpx.ToString(raw))
	if s == "" {
		return nil
	}
	if allDigits.MatchString(s) {
		n, _ := strconv.ParseInt(s, 10, 64)
		return n
	}
	return s
}

// NormalizeProductCategoryID — устаревшие категории кроссовок сводятся к "shoes".
func NormalizeProductCategoryID(raw any) any {
	id := NormalizeCategoryID(raw)
	if id == nil {
		return nil
	}
	if legacyShoeIDs[httpx.ToString(id)] {
		return "shoes"
	}
	return id
}

func keyOf(v any) string {
	if v == nil {
		return ""
	}
	if n, ok := v.(int64); ok {
		return strconv.FormatInt(n, 10)
	}
	return httpx.ToString(v)
}

func CategoryDisplayName(id any, name string) string {
	if t := strings.TrimSpace(name); t != "" {
		return t
	}
	k := keyOf(id)
	if n, ok := fallbackNames[k]; ok {
		return n
	}
	if n, ok := fallbackNames[strings.ToLower(k)]; ok {
		return n
	}
	return k
}

var catTableOnce sync.Once

func ensureCategoryTable(ctx context.Context) {
	catTableOnce.Do(func() {
		_, _, err := db.Exec(ctx, db.Pool, "SELECT 1 FROM shop_categories LIMIT 1")
		if err == nil || !db.IsNoTable(err) {
			return
		}
		_, _, _ = db.Exec(ctx, db.Pool, `CREATE TABLE shop_categories (
			id VARCHAR(32) NOT NULL PRIMARY KEY,
			name VARCHAR(128) NOT NULL,
			slug VARCHAR(64) NULL,
			sort_order INT NOT NULL DEFAULT 0,
			status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			KEY idx_shop_categories_status (status),
			KEY idx_shop_categories_sort (sort_order)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
		_, _, _ = db.Exec(ctx, db.Pool, "ALTER TABLE products ADD COLUMN category_id VARCHAR(32) NULL")
	})
}

func ensureDefaultCategories(ctx context.Context) error {
	ensureCategoryTable(ctx)
	for _, c := range fallbackCategories {
		ex, err := db.One(ctx, db.Pool, "SELECT id, status FROM shop_categories WHERE CAST(id AS CHAR) = ? LIMIT 1", c.ID)
		if err != nil {
			return err
		}
		if ex == nil {
			if _, _, err := db.Exec(ctx, db.Pool, "INSERT INTO shop_categories (id, name, slug, sort_order, status) VALUES (?, ?, ?, ?, 'active')", c.ID, c.Name, c.Slug, c.Sort); err != nil {
				return err
			}
		}
	}
	return nil
}

func mapCategory(r db.Row) httpx.M {
	slug := r["slug"]
	if r.Str("slug") == "" {
		slug = r["id"]
	}
	return httpx.M{"id": NormalizeCategoryID(r["id"]), "name": r["name"], "slug": slug,
		"sort_order": r.Float("sort_order"), "status": r["status"], "product_count": r.Float("product_count")}
}

const categoriesSQL = `SELECT c.*,
		(SELECT COUNT(*) FROM products p WHERE CAST(p.category_id AS CHAR) = CAST(c.id AS CHAR) AND p.status = 'active') AS product_count
	FROM shop_categories c`

func listCategories(ctx context.Context, activeOnly bool) ([]httpx.M, error) {
	q := categoriesSQL
	if activeOnly {
		q += " WHERE c.status = 'active'"
	}
	rows, err := db.Query(ctx, db.Pool, q+" ORDER BY c.sort_order ASC, c.name ASC")
	if err != nil {
		return nil, err
	}
	out := make([]httpx.M, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapCategory(r))
	}
	return out, nil
}

// CatalogCategories — категории для мобильного каталога.
func CatalogCategories(ctx context.Context) ([]httpx.M, error) {
	if err := ensureDefaultCategories(ctx); err != nil {
		return nil, err
	}
	active, err := listCategories(ctx, true)
	if err != nil || len(active) > 0 {
		return active, err
	}
	return categoriesFromProducts(ctx)
}

func categoriesFromProducts(ctx context.Context) ([]httpx.M, error) {
	all, err := listCategories(ctx, false)
	if err != nil {
		return nil, err
	}
	byID := map[string]httpx.M{}
	for _, c := range all {
		byID[keyOf(c["id"])] = c
	}
	rows, err := db.Query(ctx, db.Pool, `SELECT DISTINCT category_id FROM products
		WHERE status = 'active' AND category_id IS NOT NULL AND TRIM(CAST(category_id AS CHAR)) != ''`)
	if err != nil {
		return nil, err
	}
	result := []httpx.M{}
	seen := map[string]bool{}
	for _, r := range rows {
		id := NormalizeProductCategoryID(r["category_id"])
		k := keyOf(id)
		if id == nil || seen[k] {
			continue
		}
		fromDB := byID[k]
		_, known := fallbackNames[k]
		if (fromDB == nil || fromDB["status"] != "active") && !known {
			continue
		}
		dbName := ""
		if fromDB != nil {
			dbName = httpx.ToString(fromDB["name"])
		}
		name := CategoryDisplayName(id, dbName)
		if name == "" {
			continue
		}
		item := httpx.M{"id": id, "name": name, "slug": k, "sort_order": 999.0, "status": "active", "product_count": 0.0}
		if fromDB != nil {
			if s := httpx.ToString(fromDB["slug"]); s != "" {
				item["slug"] = fromDB["slug"]
			}
			item["sort_order"], item["product_count"] = fromDB["sort_order"], fromDB["product_count"]
		}
		result = append(result, item)
		seen[k] = true
	}
	sort.SliceStable(result, func(i, j int) bool {
		a, b := db.ToFloat(result[i]["sort_order"]), db.ToFloat(result[j]["sort_order"])
		if a != b {
			return a < b
		}
		return httpx.ToString(result[i]["name"]) < httpx.ToString(result[j]["name"])
	})
	return result, nil
}

// --- товары ---

func mapSize(s db.Row) httpx.M {
	return httpx.M{"id": s["id"], "size": s["size"], "stock_qty": s.Float("stock_qty"),
		"in_stock": s.Str("status") == "active" && s.Float("stock_qty") > 0}
}

func mapColor(c db.Row, sizes []db.Row) httpx.M {
	list := make([]httpx.M, 0, len(sizes))
	in := false
	for _, s := range sizes {
		m := mapSize(s)
		list = append(list, m)
		in = in || m["in_stock"] == true
	}
	return httpx.M{"id": c["id"], "label": c["label"], "hex_code": nilEmpty(c.Str("hex_code")), "image_url": nilEmpty(c.Str("image_url")),
		"sort_order": c.Float("sort_order"), "status": c["status"], "sizes": list, "in_stock": in}
}

func nilEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func colorLabel(v any) string { return strings.TrimSpace(httpx.ToString(v)) }

func mapProduct(row db.Row, images, sizes, colors []db.Row, category httpx.M, colorSizeRows []db.Row) httpx.M {
	var activeSizes []db.Row
	for _, s := range sizes {
		if s.Str("status") == "active" && s.Float("stock_qty") > 0 {
			activeSizes = append(activeSizes, s)
		}
	}
	var activeColors []db.Row
	for _, c := range colors {
		if c.Str("status") == "active" {
			activeColors = append(activeColors, c)
		}
	}
	byColorID := map[int64][]db.Row{}
	for _, s := range colorSizeRows {
		byColorID[s.Int("product_color_id")] = append(byColorID[s.Int("product_color_id")], s)
	}
	byLabel := map[int64][]db.Row{}
	for _, s := range sizes {
		label := colorLabel(s["color_label"])
		if label == "" {
			continue
		}
		for _, c := range activeColors {
			if strings.EqualFold(colorLabel(c["label"]), label) {
				byLabel[c.Int("id")] = append(byLabel[c.Int("id")], s)
				break
			}
		}
	}
	warehouse := len(byLabel) > 0
	perColor := len(activeColors) > 0 && ((len(colorSizeRows) > 0 && len(byColorID) > 0) || warehouse)

	colorList := []httpx.M{}
	if len(activeColors) > 0 {
		for _, c := range activeColors {
			src := byColorID[c.Int("id")]
			if len(src) == 0 {
				src = byLabel[c.Int("id")]
			}
			colorList = append(colorList, mapColor(c, src))
		}
	} else if row.Str("color") != "" {
		colorList = append(colorList, httpx.M{"id": nil, "label": row["color"], "hex_code": nil, "image_url": nil, "sizes": []httpx.M{}, "in_stock": len(activeSizes) > 0})
	}

	var defaultColor any
	if len(colorList) > 0 && httpx.ToString(colorList[0]["label"]) != "" {
		defaultColor = colorList[0]["label"]
	} else {
		defaultColor = nilEmpty(row.Str("color"))
	}
	var hero any
	for _, c := range colorList {
		if c["image_url"] != nil {
			hero = c["image_url"]
			break
		}
	}
	if hero == nil && len(images) > 0 {
		hero = nilEmpty(images[0].Str("image_url"))
	}

	inStock := len(activeSizes) > 0
	if perColor {
		inStock = false
		for _, c := range colorList {
			if c["in_stock"] == true {
				inStock = true
			}
		}
	}
	productSizes := []httpx.M{}
	switch {
	case perColor && warehouse:
	case perColor:
		for _, s := range sizes {
			if colorLabel(s["color_label"]) == "" {
				productSizes = append(productSizes, mapSize(s))
			}
		}
	default:
		for _, s := range sizes {
			productSizes = append(productSizes, mapSize(s))
		}
	}
	imgs := []any{}
	for _, i := range images {
		if u := i.Str("image_url"); u != "" {
			imgs = append(imgs, u)
		}
	}

	var catID any = row["category_id"]
	if category != nil && category["id"] != nil {
		catID = category["id"]
	}
	var catName any
	if category != nil && category["name"] != nil {
		catName = category["name"]
	} else if strings.TrimSpace(row.Str("category_id")) != "" {
		id := NormalizeProductCategoryID(row["category_id"])
		if id == nil {
			id = row["category_id"]
		}
		catName = CategoryDisplayName(id, "")
	}

	return httpx.M{
		"id": row["id"], "name": row["name"], "slug": row["slug"], "description": row["description"],
		"color": defaultColor, "colors": colorList,
		"category_id": NormalizeProductCategoryID(catID), "category_name": catName,
		"price": row.Float("price"), "status": row["status"], "in_stock": inStock,
		"sizes": productSizes, "images": imgs, "image_url": hero,
	}
}

func placeholders(n int) string { return strings.TrimSuffix(strings.Repeat("?,", n), ",") }

func idsArgs(rows []db.Row, key string) []any {
	out := make([]any, len(rows))
	for i, r := range rows {
		out[i] = r[key]
	}
	return out
}

func queryIn(ctx context.Context, sqlPrefix string, ids []any, suffix string) ([]db.Row, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	rows, err := db.Query(ctx, db.Pool, sqlPrefix+" IN ("+placeholders(len(ids))+") "+suffix, ids...)
	if db.IsNoTable(err) {
		return nil, nil
	}
	return rows, err
}

type extras struct{ images, sizes, colors, colorSizes []db.Row }

func loadExtras(ctx context.Context, ids []any) (extras, error) {
	var e extras
	var err error
	if e.images, err = queryIn(ctx, "SELECT * FROM product_images WHERE product_id", ids, "ORDER BY sort_order, id"); err != nil {
		return e, err
	}
	if e.sizes, err = queryIn(ctx, "SELECT * FROM product_sizes WHERE product_id", ids, "ORDER BY size"); err != nil {
		return e, err
	}
	if e.colors, err = queryIn(ctx, "SELECT * FROM product_colors WHERE product_id", ids, "ORDER BY sort_order, id"); err != nil {
		return e, err
	}
	e.colorSizes, err = queryIn(ctx, "SELECT * FROM product_color_sizes WHERE product_color_id", idsArgs(e.colors, "id"), "ORDER BY size")
	return e, err
}

func categoriesMap(ctx context.Context) (map[string]httpx.M, error) {
	ensureCategoryTable(ctx)
	all, err := listCategories(ctx, false)
	if err != nil {
		return nil, err
	}
	m := map[string]httpx.M{}
	for _, c := range all {
		if k := keyOf(c["id"]); k != "" {
			m[k] = httpx.M{"id": c["id"], "name": c["name"], "slug": c["slug"]}
		}
	}
	return m, nil
}

func resolveCategory(m map[string]httpx.M, categoryID any) httpx.M {
	if categoryID == nil || httpx.ToString(categoryID) == "" {
		return nil
	}
	n := NormalizeProductCategoryID(categoryID)
	if n == nil {
		n = categoryID
	}
	if c := m[keyOf(NormalizeCategoryID(n))]; c != nil {
		return c
	}
	return m[keyOf(n)]
}

func byProduct(rows []db.Row, id int64) []db.Row {
	var out []db.Row
	for _, r := range rows {
		if r.Int("product_id") == id {
			out = append(out, r)
		}
	}
	return out
}

// ActiveProducts — listActiveProducts.
func ActiveProducts(ctx context.Context, categoryID string) ([]httpx.M, error) {
	base := "SELECT * FROM products WHERE status = 'active'"
	var products []db.Row
	var err error
	if filter := filterValues(categoryID); len(filter) > 0 {
		products, err = db.Query(ctx, db.Pool, base+" AND CAST(category_id AS CHAR) IN ("+placeholders(len(filter))+") ORDER BY id ASC", filter...)
		if db.IsBadField(err) {
			products, err = db.Query(ctx, db.Pool, base+" ORDER BY id ASC")
		}
	} else {
		products, err = db.Query(ctx, db.Pool, base+" ORDER BY id ASC")
	}
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
		out = append(out, mapProduct(p, byProduct(ex.images, id), byProduct(ex.sizes, id), colors, resolveCategory(cats, p["category_id"]), ex.colorSizes))
	}
	return out, nil
}

func filterValues(categoryID string) []any {
	id := NormalizeCategoryID(strings.TrimSpace(categoryID))
	if id == nil {
		return nil
	}
	n := NormalizeProductCategoryID(id)
	if n == nil {
		n = id
	}
	k := keyOf(n)
	if k == "shoes" {
		return []any{"shoes", "1", "2", "3", "running", "urban", "trail"}
	}
	return []any{k}
}

// ProductByID — getProductById (nil — нет такого активного товара).
func ProductByID(ctx context.Context, id string) (httpx.M, error) {
	row, err := db.One(ctx, db.Pool, `SELECT p.*, c.name AS category_name FROM products p
		LEFT JOIN product_categories c ON c.id COLLATE utf8mb4_unicode_ci = p.category_id
		WHERE p.id = ? AND p.status = 'active'`, id)
	if err != nil || row == nil {
		return nil, err
	}
	ex, err := loadExtras(ctx, []any{row["id"]})
	if err != nil {
		return nil, err
	}
	cats, err := categoriesMap(ctx)
	if err != nil {
		return nil, err
	}
	return mapProduct(row, ex.images, ex.sizes, ex.colors, resolveCategory(cats, row["category_id"]), ex.colorSizes), nil
}
