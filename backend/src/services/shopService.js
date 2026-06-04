import { pool } from '../db.js';
import { normalizeCategoryId, categoryMapKey } from '../utils/categoryId.js';
import {
  listActiveShopCategories,
  listAllShopCategoriesAdmin,
  listCatalogShopCategories,
  categoryDisplayName,
  normalizeProductCategoryId,
} from './shopCategoryService.js';

export { listActiveShopCategories, listAllShopCategoriesAdmin, listCatalogShopCategories };

let colorsTableReady = null;
let colorSizesTableReady = null;

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

async function hasColorSizesTable() {
  if (colorSizesTableReady != null) return colorSizesTableReady;
  try {
    await pool.query(`SELECT 1 FROM product_color_sizes LIMIT 1`);
    colorSizesTableReady = true;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') colorSizesTableReady = false;
    else throw err;
  }
  return colorSizesTableReady;
}

function mapSizeRow(s) {
  return {
    id: s.id,
    size: s.size,
    stock_qty: Number(s.stock_qty) || 0,
    in_stock: s.status === 'active' && Number(s.stock_qty) > 0,
  };
}

function mapColorRow(row, colorSizeRows = []) {
  const sizes = colorSizeRows.map(mapSizeRow);
  return {
    id: row.id,
    label: row.label,
    hex_code: row.hex_code || null,
    image_url: row.image_url || null,
    sort_order: Number(row.sort_order) || 0,
    status: row.status,
    sizes,
    in_stock: sizes.some((s) => s.in_stock),
  };
}

function normalizeStockColorLabel(color) {
  return String(color || '').trim();
}

function stockColorLabelsMatch(a, b) {
  return normalizeStockColorLabel(a).toLowerCase() === normalizeStockColorLabel(b).toLowerCase();
}

/** Остатки со склада: product_sizes с color_label → размеры по цвету. */
function buildSizesByColorLabel(activeColors, sizes) {
  const map = new Map();
  for (const s of sizes) {
    const label = normalizeStockColorLabel(s.color_label);
    if (!label) continue;
    const color = activeColors.find((c) => stockColorLabelsMatch(c.label, label));
    if (!color) continue;
    const cid = Number(color.id);
    if (!map.has(cid)) map.set(cid, []);
    map.get(cid).push(s);
  }
  return map;
}

function mapProductRow(row, images = [], sizes = [], colors = [], category = null, colorSizeRows = []) {
  const activeSizes = sizes.filter((s) => s.status === 'active' && Number(s.stock_qty) > 0);
  const activeColors = colors.filter((c) => c.status === 'active');
  const sizesByColorId = new Map();
  for (const s of colorSizeRows) {
    const cid = Number(s.product_color_id);
    if (!sizesByColorId.has(cid)) sizesByColorId.set(cid, []);
    sizesByColorId.get(cid).push(s);
  }

  const sizesByColorLabel = buildSizesByColorLabel(activeColors, sizes);
  const hasWarehouseColorStock = sizesByColorLabel.size > 0;

  const usesPerColorSizes =
    (activeColors.length > 0 && colorSizeRows.length > 0 && sizesByColorId.size > 0) ||
    (activeColors.length > 0 && hasWarehouseColorStock);

  const genericSizes = sizes.filter((s) => !normalizeStockColorLabel(s.color_label));

  const colorList = activeColors.length
    ? activeColors.map((c) => {
        const cid = Number(c.id);
        const fromCatalog = sizesByColorId.get(cid) || [];
        const fromWarehouse = sizesByColorLabel.get(cid) || [];
        return mapColorRow(c, fromCatalog.length ? fromCatalog : fromWarehouse);
      })
    : row.color
      ? [{ id: null, label: row.color, hex_code: null, image_url: null, sizes: [], in_stock: activeSizes.length > 0 }]
      : [];

  const defaultColor = colorList[0]?.label || row.color || null;
  const heroImage =
    colorList.find((c) => c.image_url)?.image_url ||
    images[0]?.image_url ||
    null;

  const in_stock = usesPerColorSizes
    ? colorList.some((c) => c.in_stock)
    : activeSizes.length > 0;

  const productSizes = usesPerColorSizes
    ? hasWarehouseColorStock
      ? []
      : genericSizes.map(mapSizeRow)
    : sizes.map(mapSizeRow);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category_id: row.category_id || null,
    category_name: row.category_name || null,
    description: row.description,
    color: defaultColor,
    colors: colorList,
    category_id: normalizeProductCategoryId(category?.id ?? row.category_id) ?? null,
    category_name:
      category?.name ??
      (row.category_id != null && String(row.category_id).trim() !== ''
        ? categoryDisplayName(normalizeProductCategoryId(row.category_id) ?? row.category_id, null)
        : null),
    price: Number(row.price),
    status: row.status,
    in_stock,
    sizes: productSizes,
    images: images.map((i) => i.image_url).filter(Boolean),
    image_url: heroImage,
  };
}

async function loadCategoriesMap() {
  const cats = await listAllShopCategoriesAdmin();
  return new Map(
    cats.map((c) => {
      const key = categoryMapKey(c.id);
      return key ? [key, { id: c.id, name: c.name, slug: c.slug }] : null;
    }).filter(Boolean)
  );
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

async function loadColorSizesForColorIds(colorIds) {
  if (!colorIds.length) return [];
  if (!(await hasColorSizesTable())) return [];
  const [rows] = await pool.query(
    `SELECT * FROM product_color_sizes WHERE product_color_id IN (?) ORDER BY size`,
    [colorIds]
  );
  return rows;
}

async function loadProductExtras(productIds) {
  if (!productIds.length) {
    return { images: [], sizes: [], colors: [], colorSizes: [] };
  }
  const [images] = await pool.query(
    `SELECT * FROM product_images WHERE product_id IN (?) ORDER BY sort_order, id`,
    [productIds]
  );
  const [sizes] = await pool.query(
    `SELECT * FROM product_sizes WHERE product_id IN (?) ORDER BY size`,
    [productIds]
  );
  const colors = await loadColorsForProductIds(productIds);
  const colorIds = colors.map((c) => c.id);
  const colorSizes = await loadColorSizesForColorIds(colorIds);
  return { images, sizes, colors, colorSizes };
}

function resolveCategory(catMap, categoryId) {
  if (categoryId == null || categoryId === '') return null;
  const normalized = normalizeProductCategoryId(categoryId) ?? categoryId;
  const key = categoryMapKey(normalized);
  return catMap.get(key) || catMap.get(String(normalized)) || null;
}

const LEGACY_SHOE_FILTER_IDS = ['1', '2', '3', 'running', 'urban', 'trail'];

export async function listActiveProducts({ categoryId = null } = {}) {
  const filterId = categoryId != null ? normalizeCategoryId(categoryId) : null;

  let products = [];
  const baseSql = `SELECT * FROM products WHERE status = 'active'`;
  if (filterId) {
    try {
      if (String(filterId) === 'shoes') {
        const ids = ['shoes', ...LEGACY_SHOE_FILTER_IDS];
        const [rows] = await pool.query(
          `${baseSql} AND CAST(category_id AS CHAR) IN (?) ORDER BY id ASC`,
          [ids]
        );
        products = rows;
      } else {
        const [rows] = await pool.query(`${baseSql} AND category_id = ? ORDER BY id ASC`, [filterId]);
        products = rows;
      }
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
  const { images, sizes, colors: colorRows, colorSizes } = await loadProductExtras(ids);
  const catMap = await loadCategoriesMap();

  return products.map((p) =>
    mapProductRow(
      p,
      images.filter((i) => i.product_id === p.id),
      sizes.filter((s) => s.product_id === p.id),
      colorRows.filter((c) => c.product_id === p.id),
      resolveCategory(catMap, p.category_id),
      colorSizes
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
  const colorSizes = await loadColorSizesForColorIds(colorRows.map((c) => c.id));
  const catMap = await loadCategoriesMap();
  const category = resolveCategory(catMap, rows[0].category_id);
  return mapProductRow(rows[0], images, sizes, colorRows, category, colorSizes);
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

  const { images, sizes, colors: colorRows, colorSizes } = await loadProductExtras(ids);
  const catMap = await loadCategoriesMap();

  return products.map((p) => ({
    ...mapProductRow(
      p,
      images.filter((i) => Number(i.product_id) === Number(p.id)),
      sizes.filter((s) => Number(s.product_id) === Number(p.id)),
      colorRows.filter((c) => Number(c.product_id) === Number(p.id)),
      resolveCategory(catMap, p.category_id),
      colorSizes
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
      const [existingSizes] = await conn.query(
        `SELECT size, stock_qty FROM product_sizes WHERE product_id = ?`,
        [productId]
      );
      const stockBySize = new Map(existingSizes.map((s) => [s.size, Number(s.stock_qty) || 0]));
      await conn.query(`DELETE FROM product_sizes WHERE product_id = ?`, [productId]);
      await conn.query(`DELETE FROM product_images WHERE product_id = ?`, [productId]);
      if (await hasColorsTable()) {
        await conn.query(`DELETE FROM product_colors WHERE product_id = ?`, [productId]);
      }
      for (const s of sizes || []) {
        await conn.query(
          `INSERT INTO product_sizes (product_id, size, stock_qty, status) VALUES (?,?,?,?)`,
          [productId, s.size, stockBySize.get(s.size) ?? 0, s.status || 'active']
        );
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

    const saveColors = (await hasColorsTable()) && colorRows.length > 0;
    const saveColorSizes = saveColors && (await hasColorSizesTable());

    if (saveColors) {
      for (let i = 0; i < colorRows.length; i++) {
        const c = colorRows[i];
        const [ins] = await conn.query(
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
        if (saveColorSizes) {
          const colorSizes = Array.isArray(c.sizes) ? c.sizes.filter((s) => s?.size?.trim()) : [];
          for (const s of colorSizes) {
            await conn.query(
              `INSERT INTO product_color_sizes (product_color_id, size, stock_qty, status) VALUES (?,?,?,?)`,
              [ins.insertId, s.size.trim(), s.stock_qty ?? 0, s.status || 'active']
            );
          }
        }
      }
    } else {
      for (const s of sizes || []) {
        if (!s?.size?.trim()) continue;
        await conn.query(
          `INSERT INTO product_sizes (product_id, size, stock_qty, status) VALUES (?,?,?,?)`,
          [productId, s.size.trim(), s.stock_qty ?? 0, s.status || 'active']
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

export async function adminDeleteProduct(id) {
  const productId = Number(id);
  if (!Number.isFinite(productId) || productId <= 0) {
    const err = new Error('Некорректный ID товара');
    err.status = 400;
    throw err;
  }

  const [products] = await pool.query(`SELECT id, name FROM products WHERE id = ?`, [productId]);
  if (!products.length) {
    const err = new Error('Товар не найден');
    err.status = 404;
    throw err;
  }

  const [orders] = await pool.query(
    `SELECT id FROM shop_orders WHERE product_id = ? LIMIT 1`,
    [productId]
  );
  if (orders.length) {
    const err = new Error('Нельзя удалить товар: есть связанные заказы');
    err.status = 409;
    throw err;
  }

  await pool.query(`DELETE FROM products WHERE id = ?`, [productId]);
  return { ok: true, id: productId };
}

/** Проверка наличия размера (с учётом цвета). */
export async function assertProductSizeInStock(
  db,
  { productId, size, color = null, colorId = null, qty = 1 }
) {
  if (!size) return;

  const q = db.query ? db.query.bind(db) : pool.query.bind(pool);

  if (await hasColorsTable()) {
    let colorRow = null;
    if (colorId) {
      const [rows] = await q(
        `SELECT id, label FROM product_colors WHERE id = ? AND product_id = ? AND status = 'active'`,
        [colorId, productId]
      );
      colorRow = rows[0] || null;
    } else if (color?.trim()) {
      const [rows] = await q(
        `SELECT id, label FROM product_colors WHERE product_id = ? AND label = ? AND status = 'active'`,
        [productId, color.trim()]
      );
      colorRow = rows[0] || null;
      if (!colorRow) {
        const [allColors] = await q(
          `SELECT id, label FROM product_colors WHERE product_id = ? AND status = 'active'`,
          [productId]
        );
        colorRow =
          allColors.find((c) => stockColorLabelsMatch(c.label, color)) || null;
      }
    }

    if (colorRow) {
      const colorLabel = normalizeStockColorLabel(colorRow.label);
      try {
        const [labeled] = await q(
          `SELECT stock_qty FROM product_sizes
           WHERE product_id = ? AND size = ? AND color_label = ? AND status = 'active'`,
          [productId, size, colorLabel]
        );
        if (labeled.length) {
          if (Number(labeled[0].stock_qty) >= qty) return;
          const err = new Error('Выбранный размер недоступен для этого цвета');
          err.status = 400;
          throw err;
        }
        const [anyLabeled] = await q(
          `SELECT 1 FROM product_sizes WHERE product_id = ? AND TRIM(color_label) <> '' LIMIT 1`,
          [productId]
        );
        if (anyLabeled.length) {
          const err = new Error('Выбранный размер недоступен для этого цвета');
          err.status = 400;
          throw err;
        }
      } catch (e) {
        if (e.status) throw e;
        if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
      }
    }

    if (colorRow && (await hasColorSizesTable())) {
      const [colorSizeRows] = await q(
        `SELECT * FROM product_color_sizes WHERE product_color_id = ? AND size = ? AND status = 'active'`,
        [colorRow.id, size]
      );
      const [anyForColor] = await q(
        `SELECT 1 FROM product_color_sizes WHERE product_color_id = ? LIMIT 1`,
        [colorRow.id]
      );
      if (anyForColor.length) {
        if (!colorSizeRows.length || colorSizeRows[0].stock_qty < qty) {
          const err = new Error('Выбранный размер недоступен для этого цвета');
          err.status = 400;
          throw err;
        }
        return;
      }
    }
  }

  const [sizeRows] = await q(
    `SELECT * FROM product_sizes
     WHERE product_id = ? AND size = ? AND status = 'active'
       AND (color_label IS NULL OR TRIM(color_label) = '')`,
    [productId, size]
  );
  if (!sizeRows.length || Number(sizeRows[0].stock_qty) < qty) {
    const err = new Error('Выбранный размер недоступен');
    err.status = 400;
    throw err;
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
