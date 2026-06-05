import { pool } from '../db.js';
import { PRODUCT_CATEGORIES as DEFAULT_CATEGORIES } from '../constants/productCategories.js';

let tableReady = null;

async function ensureTable() {
  if (tableReady) return tableReady;
  tableReady = (async () => {
    try {
      await pool.query(`SELECT 1 FROM product_categories LIMIT 1`);
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
      return false;
    }
    const [rows] = await pool.query(`SELECT COUNT(*) AS c FROM product_categories`);
    if (Number(rows[0]?.c) === 0) {
      for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
        const c = DEFAULT_CATEGORIES[i];
        await pool.query(
          `INSERT INTO product_categories (id, name, sort_order, status, is_builtin)
           VALUES (?, ?, ?, 'active', 1)`,
          [c.id, c.name, (i + 1) * 10]
        );
      }
    }
    return true;
  })();
  return tableReady;
}

export function mapCategoryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    sort_order: Number(row.sort_order) || 0,
    status: row.status,
    is_builtin: Boolean(row.is_builtin),
  };
}

async function loadRows({ activeOnly = false } = {}) {
  const hasTable = await ensureTable();
  if (!hasTable) {
    return DEFAULT_CATEGORIES.map((c, i) => ({
      id: c.id,
      name: c.name,
      sort_order: (i + 1) * 10,
      status: 'active',
      is_builtin: 1,
    }));
  }
  let sql = `SELECT * FROM product_categories`;
  if (activeOnly) sql += ` WHERE status = 'active'`;
  sql += ` ORDER BY sort_order ASC, id ASC`;
  const [rows] = await pool.query(sql);
  return rows;
}

export async function listActiveProductCategories() {
  const rows = await loadRows({ activeOnly: true });
  return rows.map(mapCategoryRow).filter(Boolean);
}

export async function listAllProductCategoriesAdmin() {
  const rows = await loadRows({ activeOnly: false });
  return rows.map(mapCategoryRow).filter(Boolean);
}

export async function getProductCategoryById(id) {
  if (!id) return null;
  const hasTable = await ensureTable();
  if (!hasTable) {
    const c = DEFAULT_CATEGORIES.find((x) => x.id === id);
    return c ? mapCategoryRow({ ...c, sort_order: 0, status: 'active', is_builtin: 1 }) : null;
  }
  const [rows] = await pool.query(`SELECT * FROM product_categories WHERE id = ?`, [id]);
  return rows.length ? mapCategoryRow(rows[0]) : null;
}

function normalizeId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 32);
}

export async function createProductCategory(data) {
  await ensureTable();
  const id = normalizeId(data.id);
  if (!id || !data.name?.trim()) {
    const err = new Error('Укажите код и название категории');
    err.status = 400;
    throw err;
  }
  const [dup] = await pool.query(`SELECT id FROM product_categories WHERE id = ?`, [id]);
  if (dup.length) {
    const err = new Error('Такой код уже существует');
    err.status = 409;
    throw err;
  }
  await pool.query(
    `INSERT INTO product_categories (id, name, sort_order, status, is_builtin)
     VALUES (?, ?, ?, ?, 0)`,
    [
      id,
      data.name.trim(),
      Number(data.sort_order) || 0,
      data.status === 'inactive' ? 'inactive' : 'active',
    ]
  );
  return getProductCategoryById(id);
}

export async function updateProductCategory(id, data) {
  await ensureTable();
  const [existing] = await pool.query(`SELECT * FROM product_categories WHERE id = ?`, [id]);
  if (!existing.length) {
    const err = new Error('Категория не найдена');
    err.status = 404;
    throw err;
  }
  const row = existing[0];
  await pool.query(
    `UPDATE product_categories SET name = ?, sort_order = ?, status = ? WHERE id = ?`,
    [
      data.name?.trim() || row.name,
      data.sort_order != null ? Number(data.sort_order) : row.sort_order,
      data.status === 'inactive' ? 'inactive' : data.status === 'active' ? 'active' : row.status,
      id,
    ]
  );
  return getProductCategoryById(id);
}

export async function setProductCategoryStatus(id, status) {
  return updateProductCategory(id, { status: status === 'inactive' ? 'inactive' : 'active' });
}
