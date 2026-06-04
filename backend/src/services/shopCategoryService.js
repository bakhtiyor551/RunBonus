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

/** Категории для мобильного каталога — только активные из админки. */
export async function listCatalogShopCategories() {
  return listActiveShopCategories();
}

export async function listActiveShopCategories() {
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
