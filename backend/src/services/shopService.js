import { pool } from '../db.js';

function mapProductRow(row, images = [], sizes = []) {
  const activeSizes = sizes.filter((s) => s.status === 'active' && s.stock_qty > 0);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    color: row.color,
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
    image_url: images[0]?.image_url || null,
  };
}

export async function listActiveProducts() {
  const [products] = await pool.query(
    `SELECT * FROM products WHERE status = 'active' ORDER BY id ASC`
  );
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

  return products.map((p) =>
    mapProductRow(
      p,
      images.filter((i) => i.product_id === p.id),
      sizes.filter((s) => s.product_id === p.id)
    )
  );
}

export async function getProductById(id) {
  const [rows] = await pool.query(`SELECT * FROM products WHERE id = ? AND status = 'active'`, [id]);
  if (!rows.length) return null;
  const [images] = await pool.query(
    `SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, id`,
    [id]
  );
  const [sizes] = await pool.query(
    `SELECT * FROM product_sizes WHERE product_id = ? ORDER BY size`,
    [id]
  );
  return mapProductRow(rows[0], images, sizes);
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
