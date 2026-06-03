import { pool } from '../db.js';
import { SHOP_CATEGORIES_FALLBACK } from '../constants/shopCategories.js';
import { normalizeCategoryId, categoryMapKey } from '../utils/categoryId.js';

let categoriesTableReady = null;
let colorsTableReady = null;
let categoriesEnsured = null;

async function hasCategoriesTable() {
  if (categoriesTableReady != null) return categoriesTableReady;
  try {
    await pool.query(`SELECT 1 FROM shop_categories LIMIT 1`);
    categoriesTableReady = true;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') categoriesTableReady = false;
    else throw err;
  }
  return categoriesTableReady;
}

/** Создать таблицу и базовые категории, если миграция 016 ещё не применялась. */
async function ensureShopCategories() {
  if (categoriesEnsured) return categoriesEnsured;
  categoriesEnsured = (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS shop_categories (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(128) NOT NULL,
          slug VARCHAR(64) NULL,
          sort_order INT NOT NULL DEFAULT 0,
          status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_shop_categories_status (status),
          KEY idx_shop_categories_sort (sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      categoriesTableReady = true;
      const [rows] = await pool.query(`SELECT COUNT(*) AS c FROM shop_categories`);
      if (Number(rows[0]?.c) === 0) {
        for (const c of SHOP_CATEGORIES_FALLBACK) {
          await pool.query(
            `INSERT INTO shop_categories (id, name, slug, sort_order, status) VALUES (?, ?, ?, ?, 'active')`,
            [c.id, c.name, c.slug, c.sort_order]
          );
        }
      }
      try {
        await pool.query(`ALTER TABLE products ADD COLUMN category_id BIGINT NULL`);
      } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') throw err;
      }
      await pool.query(`
        UPDATE products SET category_id = CASE slug
          WHEN 'runner-pro' THEN 1
          WHEN 'urban-sprint' THEN 2
          WHEN 'trail-max' THEN 3
          ELSE category_id
        END
        WHERE slug IN ('runner-pro', 'urban-sprint', 'trail-max') AND (category_id IS NULL OR category_id = 0)
      `).catch(() => {});
    } catch (err) {
      console.error('ensureShopCategories:', err.message);
    }
    return true;
  })();
  return categoriesEnsured;
}

async function hasColorsTable() {
  if (colorsTableReady != null) return colorsTableReady;
  try {
    await pool.query(`SELECT 1 FROM product_colors LIMIT 1`);
    colorsTableReady = true;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') colorsTableReady = false;
    else throw err;
  }
  return colorsTableReady;
}

function mapColorRow(row) {
  return {
    id: row.id,
    label: row.label,
    hex_code: row.hex_code || null,
    image_url: row.image_url || null,
    sort_order: Number(row.sort_order) || 0,
    status: row.status,
  };
}

function mapProductRow(row, images = [], sizes = [], colors = [], category = null) {
  const activeSizes = sizes.filter((s) => s.status === 'active' && s.stock_qty > 0);
  const activeColors = colors.filter((c) => c.status === 'active');
  const colorList = activeColors.length
    ? activeColors.map(mapColorRow)
    : row.color
      ? [{ id: null, label: row.color, hex_code: null, image_url: null }]
      : [];

  const defaultColor = colorList[0]?.label || row.color || null;
  const heroImage =
    colorList.find((c) => c.image_url)?.image_url ||
    images[0]?.image_url ||
    null;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category_id: row.category_id || null,
    category_name: row.category_name || null,
    description: row.description,
    color: defaultColor,
    colors: colorList,
    category_id: normalizeCategoryId(category?.id ?? row.category_id) ?? null,
    category_name: category?.name ?? null,
    price: Number(row.price),
    status: row.status,
    in_stock: activeSizes.length > 0,
    sizes: sizes.map((s) => ({
      id: s.id,
      size: s.size,
      stock_qty: s.stock_qty,
      in_stock: s.status === 'active' && s.stock_qty > 0,
    })),
    images: images.map((i) => i.image_url).filter(Boolean),
    image_url: heroImage,
  };
}

async function loadCategoriesMap() {
  await ensureShopCategories();
  try {
    const [rows] = await pool.query(
      `SELECT * FROM shop_categories WHERE status = 'active' ORDER BY sort_order, id`
    );
    if (rows.length) {
      return new Map(
        rows.map((r) => {
          const key = categoryMapKey(r.id);
          return key ? [key, r] : null;
        }).filter(Boolean)
      );
    }
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
  return new Map(SHOP_CATEGORIES_FALLBACK.map((c) => [c.id, c]));
}

async function loadColorsForProductIds(ids) {
  if (!ids.length) return [];
  const hasTable = await hasColorsTable();
  if (!hasTable) return [];
  const [rows] = await pool.query(
    `SELECT * FROM product_colors WHERE product_id IN (?) ORDER BY sort_order, id`,
    [ids]
  );
  return rows;
}

function mapCategoryRow(r) {
  return {
    id: normalizeCategoryId(r.id),
    name: r.name,
    slug: r.slug || (typeof r.id === 'string' ? r.id : null),
    sort_order: Number(r.sort_order) || 0,
  };
}

function resolveCategory(catMap, categoryId) {
  if (categoryId == null || categoryId === '') return null;
  const key = categoryMapKey(categoryId);
  return catMap.get(key) || catMap.get(String(categoryId)) || null;
}

export async function listActiveShopCategories() {
  await ensureShopCategories();
  try {
    const [rows] = await pool.query(
      `SELECT id, name, slug, sort_order FROM shop_categories WHERE status = 'active' ORDER BY sort_order, id`
    );
    if (rows.length) return rows.map(mapCategoryRow);
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') console.error('listActiveShopCategories:', err.message);
  }
  return SHOP_CATEGORIES_FALLBACK.map(mapCategoryRow);
}

export async function listAllShopCategoriesAdmin() {
  await ensureShopCategories();
  try {
    const [rows] = await pool.query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM products p
         WHERE CAST(p.category_id AS CHAR) = CAST(c.id AS CHAR) AND p.status = 'active') AS product_count
       FROM shop_categories c
       ORDER BY c.sort_order, c.id`
    );
    return rows.map((r) => ({
      ...mapCategoryRow(r),
      status: r.status,
      product_count: Number(r.product_count) || 0,
    }));
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') console.error('listAllShopCategoriesAdmin:', err.message);
  }
  return SHOP_CATEGORIES_FALLBACK.map((c) => ({ ...mapCategoryRow(c), status: 'active', product_count: 0 }));
}

export async function listActiveProducts({ categoryId = null } = {}) {
  await ensureShopCategories();

  let products = [];
  const baseSql = `SELECT * FROM products WHERE status = 'active'`;
  if (categoryId) {
    try {
      const [rows] = await pool.query(`${baseSql} AND category_id = ? ORDER BY id ASC`, [categoryId]);
      products = rows;
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
      const [rows] = await pool.query(`${baseSql} ORDER BY id ASC`);
      products = rows;
    }
  } else {
    const [rows] = await pool.query(`${baseSql} ORDER BY id ASC`);
    products = rows;
  }

  if (!products.length) return [];

  const ids = products.map((p) => p.id);
  const [images] = await pool.query(
    `SELECT * FROM product_images WHERE product_id IN (?) ORDER BY sort_order, id`,
    [ids]
  );
  const [sizes] = await pool.query(
    `SELECT * FROM product_sizes WHERE product_id IN (?) ORDER BY size`,
    [ids]
  );
  const colorRows = await loadColorsForProductIds(ids);
  const catMap = await loadCategoriesMap();

  return products.map((p) =>
    mapProductRow(
      p,
      images.filter((i) => i.product_id === p.id),
      sizes.filter((s) => s.product_id === p.id),
      colorRows.filter((c) => c.product_id === p.id),
      resolveCategory(catMap, p.category_id)
    )
  );
}

export async function getProductById(id) {
  const [rows] = await pool.query(
    `SELECT p.*, c.name AS category_name
     FROM products p
     LEFT JOIN product_categories c ON c.id COLLATE utf8mb4_unicode_ci = p.category_id
     WHERE p.id = ? AND p.status = 'active'`,
    [id]
  );
  if (!rows.length) return null;
  const [images] = await pool.query(
    `SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, id`,
    [id]
  );
  const [sizes] = await pool.query(
    `SELECT * FROM product_sizes WHERE product_id = ? ORDER BY size`,
    [id]
  );
  const colorRows = await loadColorsForProductIds([id]);
  const catMap = await loadCategoriesMap();
  const category = resolveCategory(catMap, rows[0].category_id);
  return mapProductRow(rows[0], images, sizes, colorRows, category);
}

export async function getUserShoeStatus(userId) {
  const [rows] = await pool.query(
    `SELECT s.id, s.unique_id, s.model_name, s.status, s.activated_at
     FROM user_active_shoes uas
     JOIN shoes s ON s.id = uas.shoe_id
     WHERE uas.user_id = ?`,
    [userId]
  );
  if (!rows.length) {
    return { has_active_shoe: false, needs_activation: true, shoe: null };
  }
  const shoe = rows[0];
  const active = shoe.status === 'activated';
  return {
    has_active_shoe: active,
    needs_activation: !active,
    shoe: {
      id: shoe.id,
      unique_id: shoe.unique_id,
      model_name: shoe.model_name,
      status: shoe.status,
      activated_at: shoe.activated_at,
    },
  };
}

export async function adminListProducts() {
  const [products] = await pool.query(`SELECT * FROM products ORDER BY id DESC`);
  const ids = products.map((p) => p.id);
  if (!ids.length) return [];

  const [images] = await pool.query(`SELECT * FROM product_images WHERE product_id IN (?)`, [ids]);
  const [sizes] = await pool.query(`SELECT * FROM product_sizes WHERE product_id IN (?)`, [ids]);
  const colorRows = await loadColorsForProductIds(ids);
  const catMap = await loadCategoriesMap();

  return products.map((p) => ({
    ...mapProductRow(
      p,
      images.filter((i) => Number(i.product_id) === Number(p.id)),
      sizes.filter((s) => Number(s.product_id) === Number(p.id)),
      colorRows.filter((c) => Number(c.product_id) === Number(p.id)),
      resolveCategory(catMap, p.category_id)
    ),
    slug: p.slug,
    description: p.description,
    status: p.status,
  }));
}

export async function adminSaveProduct(data, id = null) {
  const { name, slug, description, color, price, status, sizes, images, category_id, colors } = data;
  const colorRows = Array.isArray(colors) ? colors.filter((c) => c?.label?.trim()) : [];
  const primaryColor = colorRows[0]?.label?.trim() || color?.trim() || null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let productId = id;
    const catId = category_id != null && String(category_id).trim() !== '' ? normalizeCategoryId(category_id) : null;

    if (productId) {
      await conn.query(
        `UPDATE products SET name=?, slug=?, description=?, color=?, price=?, status=?, category_id=? WHERE id=?`,
        [name, slug || null, description || null, primaryColor, price, status || 'active', catId, productId]
      );
      await conn.query(`DELETE FROM product_sizes WHERE product_id = ?`, [productId]);
      await conn.query(`DELETE FROM product_images WHERE product_id = ?`, [productId]);
      if (await hasColorsTable()) {
        await conn.query(`DELETE FROM product_colors WHERE product_id = ?`, [productId]);
      }
    } else {
      const [r] = await conn.query(
        `INSERT INTO products (name, slug, description, color, price, status, category_id) VALUES (?,?,?,?,?,?,?)`,
        [name, slug || null, description || null, primaryColor, price, status || 'active', catId]
      );
      productId = r.insertId;
    }

    for (const img of images || []) {
      if (!img?.image_url) continue;
      await conn.query(
        `INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?,?,?)`,
        [productId, img.image_url, img.sort_order ?? 0]
      );
    }

    for (const s of sizes || []) {
      await conn.query(
        `INSERT INTO product_sizes (product_id, size, stock_qty, status) VALUES (?,?,?,?)`,
        [productId, s.size, s.stock_qty ?? 0, s.status || 'active']
      );
    }

    if (await hasColorsTable()) {
      for (let i = 0; i < colorRows.length; i++) {
        const c = colorRows[i];
        await conn.query(
          `INSERT INTO product_colors (product_id, label, hex_code, image_url, sort_order, status)
           VALUES (?,?,?,?,?,?)`,
          [
            productId,
            c.label.trim(),
            c.hex_code?.trim() || null,
            c.image_url?.trim() || null,
            c.sort_order ?? (i + 1) * 10,
            c.status === 'inactive' ? 'inactive' : 'active',
          ]
        );
      }
    }

    await conn.commit();
    const [rows] = await pool.query(`SELECT * FROM products WHERE id = ?`, [productId]);
    return rows[0];
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_BAD_FIELD_ERROR' && String(e.message).includes('category_id')) {
      return adminSaveProductLegacy(data, id);
    }
    throw e;
  } finally {
    conn.release();
  }
}

async function adminSaveProductLegacy(data, id = null) {
  const { name, slug, description, color, price, status, sizes, images } = data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let productId = id;
    if (productId) {
      await conn.query(
        `UPDATE products SET name=?, slug=?, description=?, color=?, price=?, status=? WHERE id=?`,
        [name, slug || null, description || null, color || null, price, status || 'active', productId]
      );
      await conn.query(`DELETE FROM product_sizes WHERE product_id = ?`, [productId]);
      await conn.query(`DELETE FROM product_images WHERE product_id = ?`, [productId]);
    } else {
      const [r] = await conn.query(
        `INSERT INTO products (name, slug, description, color, price, status) VALUES (?,?,?,?,?,?)`,
        [name, slug || null, description || null, color || null, price, status || 'active']
      );
      productId = r.insertId;
    }
    for (const img of images || []) {
      if (!img?.image_url) continue;
      await conn.query(
        `INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?,?,?)`,
        [productId, img.image_url, img.sort_order ?? 0]
      );
    }
    for (const s of sizes || []) {
      await conn.query(
        `INSERT INTO product_sizes (product_id, size, stock_qty, status) VALUES (?,?,?,?)`,
        [productId, s.size, s.stock_qty ?? 0, s.status || 'active']
      );
    }
    await conn.commit();
    const [rows] = await pool.query(`SELECT * FROM products WHERE id = ?`, [productId]);
    return rows[0];
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
