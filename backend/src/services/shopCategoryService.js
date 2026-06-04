import { pool } from '../db.js';
import { normalizeCategoryId } from '../utils/categoryId.js';
import { SHOP_CATEGORIES_FALLBACK } from '../constants/shopCategories.js';

const FALLBACK_CATEGORY_NAMES = new Map();
for (const c of SHOP_CATEGORIES_FALLBACK) {
  FALLBACK_CATEGORY_NAMES.set(String(c.id), c.name);
  if (c.slug) FALLBACK_CATEGORY_NAMES.set(String(c.slug), c.name);
}

let tableReady = null;

async function ensureTable() {
  if (tableReady) return tableReady;
  tableReady = (async () => {
    try {
      await pool.query(`SELECT 1 FROM shop_categories LIMIT 1`);
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
      await pool.query(`
        CREATE TABLE shop_categories (
          id VARCHAR(32) NOT NULL PRIMARY KEY,
          name VARCHAR(128) NOT NULL,
          slug VARCHAR(64) NULL,
          sort_order INT NOT NULL DEFAULT 0,
          status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_shop_categories_status (status),
          KEY idx_shop_categories_sort (sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      try {
        await pool.query(`ALTER TABLE products ADD COLUMN category_id VARCHAR(32) NULL`);
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') throw e;
      }
    }
    return true;
  })();
  return tableReady;
}

function mapRow(row) {
  return {
    id: normalizeCategoryId(row.id),
    name: row.name,
    slug: row.slug || row.id,
    sort_order: Number(row.sort_order) || 0,
    status: row.status,
    product_count: Number(row.product_count) || 0,
  };
}

function normalizeId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 32);
}

export function categoryDisplayName(id, name) {
  const trimmed = String(name || '').trim();
  if (trimmed) return trimmed;
  const key = String(id ?? '');
  if (FALLBACK_CATEGORY_NAMES.has(key)) return FALLBACK_CATEGORY_NAMES.get(key);
  if (FALLBACK_CATEGORY_NAMES.has(key.toLowerCase())) return FALLBACK_CATEGORY_NAMES.get(key.toLowerCase());
  return key;
}

const LEGACY_SHOE_CATEGORY_IDS = new Set(['1', '2', '3', 'running', 'urban', 'trail']);

export function normalizeProductCategoryId(raw) {
  const id = normalizeCategoryId(raw);
  if (id == null) return null;
  if (LEGACY_SHOE_CATEGORY_IDS.has(String(id))) return 'shoes';
  return id;
}

/** Гарантирует категории из админки (Кроссовки, Футболки, Шорты). */
async function ensureDefaultCategories() {
  await ensureTable();
  for (const c of SHOP_CATEGORIES_FALLBACK) {
    const id = String(c.id);
    const [existing] = await pool.query(
      `SELECT id, status FROM shop_categories WHERE CAST(id AS CHAR) = ? LIMIT 1`,
      [id]
    );
    if (!existing.length) {
      await pool.query(
        `INSERT INTO shop_categories (id, name, slug, sort_order, status) VALUES (?, ?, ?, ?, 'active')`,
        [id, c.name, c.slug || id, Number(c.sort_order) || 0]
      );
    }
  }
}

/** Категории для мобильного каталога — активные из админки. */
export async function listCatalogShopCategories() {
  await ensureDefaultCategories();
  const active = await listActiveShopCategories();
  if (active.length) return active;
  return listCategoriesFromActiveProducts();
}

async function listCategoriesFromActiveProducts() {
  await ensureTable();
  const allCats = await listAllShopCategoriesAdmin();
  const catMap = new Map(allCats.map((c) => [String(c.id), c]));

  const [rows] = await pool.query(
    `SELECT DISTINCT category_id
     FROM products
     WHERE status = 'active'
       AND category_id IS NOT NULL
       AND TRIM(CAST(category_id AS CHAR)) != ''`
  );

  const result = [];
  const seen = new Set();

  for (const row of rows) {
    const id = normalizeProductCategoryId(row.category_id);
    if (id == null || seen.has(String(id))) continue;

    const fromDb = catMap.get(String(id));
    const isKnown = FALLBACK_CATEGORY_NAMES.has(String(id));
    if (fromDb?.status !== 'active' && !isKnown) continue;

    const name = categoryDisplayName(id, fromDb?.name);
    if (!name) continue;

    result.push({
      id,
      name,
      slug: fromDb?.slug || (typeof id === 'string' ? id : String(id)),
      sort_order: fromDb?.sort_order ?? 999,
      status: 'active',
      product_count: fromDb?.product_count ?? 0,
    });
    seen.add(String(id));
  }

  return result.sort(
    (a, b) => a.sort_order - b.sort_order || String(a.name).localeCompare(String(b.name), 'ru')
  );
}

export async function listActiveShopCategories() {
  await ensureDefaultCategories();
  await ensureTable();
  const [rows] = await pool.query(
    `SELECT c.*,
      (SELECT COUNT(*) FROM products p
       WHERE CAST(p.category_id AS CHAR) = CAST(c.id AS CHAR) AND p.status = 'active') AS product_count
     FROM shop_categories c
     WHERE c.status = 'active'
     ORDER BY c.sort_order ASC, c.name ASC`
  );
  return rows.map(mapRow);
}

export async function listAllShopCategoriesAdmin() {
  await ensureTable();
  const [rows] = await pool.query(
    `SELECT c.*,
      (SELECT COUNT(*) FROM products p
       WHERE CAST(p.category_id AS CHAR) = CAST(c.id AS CHAR) AND p.status = 'active') AS product_count
     FROM shop_categories c
     ORDER BY c.sort_order ASC, c.name ASC`
  );
  return rows.map(mapRow);
}

export async function createShopCategory(data) {
  await ensureTable();
  const id = normalizeId(data.id || data.slug);
  if (!id) {
    const err = new Error('Укажите код категории (латиница)');
    err.status = 400;
    throw err;
  }
  if (!data.name?.trim()) {
    const err = new Error('Укажите название');
    err.status = 400;
    throw err;
  }
  const [dup] = await pool.query(`SELECT id FROM shop_categories WHERE id = ?`, [id]);
  if (dup.length) {
    const err = new Error('Такой код уже есть');
    err.status = 409;
    throw err;
  }
  await pool.query(
    `INSERT INTO shop_categories (id, name, slug, sort_order, status) VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      data.name.trim(),
      data.slug?.trim() || id,
      Number(data.sort_order) || 0,
      data.status === 'inactive' ? 'inactive' : 'active',
    ]
  );
  const [rows] = await pool.query(
    `SELECT c.*, 0 AS product_count FROM shop_categories c WHERE c.id = ?`,
    [id]
  );
  return mapRow(rows[0]);
}

export async function updateShopCategory(id, data) {
  await ensureTable();
  const [existing] = await pool.query(`SELECT * FROM shop_categories WHERE id = ?`, [id]);
  if (!existing.length) {
    const err = new Error('Категория не найдена');
    err.status = 404;
    throw err;
  }
  const row = existing[0];
  await pool.query(
    `UPDATE shop_categories SET name = ?, slug = ?, sort_order = ?, status = ? WHERE id = ?`,
    [
      data.name?.trim() || row.name,
      data.slug?.trim() || row.slug || id,
      data.sort_order != null ? Number(data.sort_order) : row.sort_order,
      data.status === 'inactive' ? 'inactive' : data.status === 'active' ? 'active' : row.status,
      id,
    ]
  );
  const list = await listAllShopCategoriesAdmin();
  return list.find((c) => String(c.id) === String(id));
}

export async function setShopCategoryStatus(id, status) {
  return updateShopCategory(id, { status: status === 'inactive' ? 'inactive' : 'active' });
}
