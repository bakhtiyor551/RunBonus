import { pool } from '../db.js';

let tableReady = null;
let colorColumnReady = null;

async function ensureColorColumns() {
  if (colorColumnReady != null) return colorColumnReady;
  colorColumnReady = (async () => {
    try {
      await pool.query(`SELECT color_label FROM product_sizes LIMIT 1`);
      return true;
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
      try {
        await pool.query(
          `ALTER TABLE product_sizes ADD COLUMN color_label VARCHAR(128) NOT NULL DEFAULT ''`
        );
        await pool.query(
          `ALTER TABLE stock_movements ADD COLUMN color_label VARCHAR(128) NOT NULL DEFAULT ''`
        );
        try {
          await pool.query(`ALTER TABLE product_sizes DROP INDEX uk_product_size`);
        } catch (e) {
          if (e.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw e;
        }
        try {
          await pool.query(
            `ALTER TABLE product_sizes ADD UNIQUE KEY uk_product_size_color (product_id, size, color_label)`
          );
        } catch (e) {
          if (e.code !== 'ER_DUP_KEYNAME') throw e;
        }
        return true;
      } catch (alterErr) {
        console.error('ensureColorColumns:', alterErr.message);
        return false;
      }
    }
  })();
  return colorColumnReady;
}

async function ensureTable() {
  if (tableReady) return tableReady;
  tableReady = (async () => {
    try {
      await pool.query(`SELECT 1 FROM stock_movements LIMIT 1`);
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
      await pool.query(`
        CREATE TABLE IF NOT EXISTS stock_movements (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          product_id BIGINT NOT NULL,
          size VARCHAR(20) NOT NULL,
          color_label VARCHAR(128) NOT NULL DEFAULT '',
          quantity INT NOT NULL,
          movement_type ENUM('in', 'out') NOT NULL,
          reason ENUM('receipt', 'order', 'cancel', 'adjust') NOT NULL DEFAULT 'receipt',
          order_id BIGINT NULL,
          comment VARCHAR(255) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_stock_movements_product (product_id),
          KEY idx_stock_movements_order (order_id),
          KEY idx_stock_movements_created (created_at),
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }
    await ensureColorColumns();
    return true;
  })();
  return tableReady;
}

function normalizeColorLabel(color) {
  return String(color || '').trim();
}

async function loadProductColors(productId) {
  try {
    const [rows] = await pool.query(
      `SELECT label, hex_code, status FROM product_colors
       WHERE product_id = ? AND status = 'active' ORDER BY sort_order, id`,
      [productId]
    );
    if (rows.length) return rows.map((r) => ({ label: r.label, hex_code: r.hex_code || null }));
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
  const [p] = await pool.query(`SELECT color FROM products WHERE id = ?`, [productId]);
  if (p[0]?.color) return [{ label: p[0].color, hex_code: null }];
  return [];
}

async function logMovement(
  conn,
  { productId, size, colorLabel, quantity, movementType, reason, orderId = null, comment = null }
) {
  await ensureTable();
  const hasColor = await ensureColorColumns();
  const db = conn || pool;
  if (hasColor) {
    await db.query(
      `INSERT INTO stock_movements (product_id, size, color_label, quantity, movement_type, reason, order_id, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [productId, size, colorLabel, Math.abs(quantity), movementType, reason, orderId, comment]
    );
  } else {
    await db.query(
      `INSERT INTO stock_movements (product_id, size, quantity, movement_type, reason, order_id, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [productId, size, Math.abs(quantity), movementType, reason, orderId, comment]
    );
  }
}

export async function listWarehouseStock() {
  await ensureColorColumns();
  const hasColor = await ensureColorColumns();

  const sizeCols = hasColor
    ? `ps.id AS size_id, ps.size, ps.color_label, ps.stock_qty, ps.status AS size_status`
    : `ps.id AS size_id, ps.size, ps.stock_qty, ps.status AS size_status`;

  const [rows] = await pool.query(
    `SELECT p.id AS product_id, p.name AS product_name, p.status AS product_status,
            pc.name AS category_name, ${sizeCols}
     FROM products p
     LEFT JOIN product_categories pc ON pc.id COLLATE utf8mb4_unicode_ci = p.category_id
     LEFT JOIN product_sizes ps ON ps.product_id = p.id
     ORDER BY p.id DESC, ps.size ASC, ps.color_label ASC`
  );

  const byProduct = new Map();
  for (const row of rows) {
    if (!byProduct.has(row.product_id)) {
      byProduct.set(row.product_id, {
        product_id: row.product_id,
        product_name: row.product_name,
        product_status: row.product_status,
        category_name: row.category_name,
        total_stock: 0,
        colors: [],
        sizes: [],
      });
    }
    const item = byProduct.get(row.product_id);
    if (row.size) {
      const colorLabel = hasColor ? normalizeColorLabel(row.color_label) : '';
      const qty = Number(row.stock_qty) || 0;
      item.sizes.push({
        id: row.size_id,
        size: row.size,
        color_label: colorLabel,
        stock_qty: qty,
        status: row.size_status,
        label: colorLabel ? `${row.size} · ${colorLabel}` : row.size,
      });
      if (row.size_status === 'active') item.total_stock += qty;
    }
  }

  const result = [...byProduct.values()];
  for (const p of result) {
    p.colors = await loadProductColors(p.product_id);
  }
  return result;
}

export async function listStockMovements(limit = 100) {
  await ensureTable();
  const hasColor = await ensureColorColumns();
  const [rows] = await pool.query(
    `SELECT sm.*, p.name AS product_name
     FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     ORDER BY sm.created_at DESC
     LIMIT ?`,
    [Math.min(500, Math.max(1, Number(limit) || 100))]
  );
  return rows.map((r) => ({
    id: r.id,
    product_id: r.product_id,
    product_name: r.product_name,
    size: r.size,
    color_label: hasColor ? normalizeColorLabel(r.color_label) : '',
    quantity: r.quantity,
    movement_type: r.movement_type,
    reason: r.reason,
    order_id: r.order_id,
    comment: r.comment,
    created_at: r.created_at,
  }));
}

export async function addStock({ product_id, size, color, quantity, comment }) {
  const productId = Number(product_id);
  const sizeLabel = String(size || '').trim();
  const colorLabel = normalizeColorLabel(color);
  const qty = Math.max(1, Math.min(9999, Number(quantity) || 0));

  if (!productId || !sizeLabel) {
    const err = new Error('Укажите товар, размер и количество');
    err.status = 400;
    throw err;
  }

  const productColors = await loadProductColors(productId);
  if (productColors.length > 0 && !colorLabel) {
    const err = new Error('Выберите цвет товара');
    err.status = 400;
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await ensureColorColumns();

    const [products] = await conn.query(`SELECT id, name FROM products WHERE id = ?`, [productId]);
    if (!products.length) {
      const err = new Error('Товар не найден');
      err.status = 404;
      throw err;
    }

    const [sizeRows] = await conn.query(
      `SELECT id, stock_qty FROM product_sizes
       WHERE product_id = ? AND size = ? AND color_label = ? FOR UPDATE`,
      [productId, sizeLabel, colorLabel]
    );

    if (sizeRows.length) {
      await conn.query(`UPDATE product_sizes SET stock_qty = stock_qty + ?, status = 'active' WHERE id = ?`, [
        qty,
        sizeRows[0].id,
      ]);
    } else {
      await conn.query(
        `INSERT INTO product_sizes (product_id, size, color_label, stock_qty, status) VALUES (?, ?, ?, ?, 'active')`,
        [productId, sizeLabel, colorLabel, qty]
      );
    }

    const movementComment = [
      comment?.trim(),
      colorLabel ? `Цвет: ${colorLabel}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || null;

    await logMovement(conn, {
      productId,
      size: sizeLabel,
      colorLabel,
      quantity: qty,
      movementType: 'in',
      reason: 'receipt',
      comment: movementComment,
    });

    await conn.commit();

    const [updated] = await conn.query(
      `SELECT stock_qty FROM product_sizes WHERE product_id = ? AND size = ? AND color_label = ?`,
      [productId, sizeLabel, colorLabel]
    );

    return {
      ok: true,
      product_id: productId,
      product_name: products[0].name,
      size: sizeLabel,
      color: colorLabel || null,
      added: qty,
      stock_qty: Number(updated[0]?.stock_qty) || 0,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function decrementStockForOrder(conn, { productId, size, color, quantity, orderId }) {
  const sizeLabel = String(size || '').trim();
  const colorLabel = normalizeColorLabel(color);
  const qty = Math.max(1, Number(quantity) || 1);
  if (!sizeLabel) return;

  await ensureTable();

  let [sizeRows] = await conn.query(
    `SELECT id, stock_qty FROM product_sizes
     WHERE product_id = ? AND size = ? AND color_label = ? AND status = 'active' FOR UPDATE`,
    [productId, sizeLabel, colorLabel]
  );

  if (!sizeRows.length && colorLabel) {
    [sizeRows] = await conn.query(
      `SELECT id, stock_qty FROM product_sizes
       WHERE product_id = ? AND size = ? AND color_label = '' AND status = 'active' FOR UPDATE`,
      [productId, sizeLabel]
    );
  }

  if (!sizeRows.length || sizeRows[0].stock_qty < qty) {
    const err = new Error(
      colorLabel ? `Размер ${sizeLabel}, цвет «${colorLabel}» недоступен` : 'Выбранный размер недоступен'
    );
    err.status = 400;
    throw err;
  }

  await conn.query(`UPDATE product_sizes SET stock_qty = stock_qty - ? WHERE id = ?`, [qty, sizeRows[0].id]);

  await logMovement(conn, {
    productId,
    size: sizeLabel,
    colorLabel: colorLabel || '',
    quantity: qty,
    movementType: 'out',
    reason: 'order',
    orderId,
  });
}

export async function restoreStockForCancelledOrder(conn, orderId) {
  await ensureTable();

  const [orders] = await conn.query(
    `SELECT product_id, size, order_color, quantity FROM shop_orders WHERE id = ?`,
    [orderId]
  );
  const order = orders[0];
  if (!order?.size) return;

  const [already] = await conn.query(
    `SELECT id FROM stock_movements WHERE order_id = ? AND reason = 'cancel' LIMIT 1`,
    [orderId]
  );
  if (already.length) return;

  const [deducted] = await conn.query(
    `SELECT id FROM stock_movements WHERE order_id = ? AND reason = 'order' LIMIT 1`,
    [orderId]
  );
  if (!deducted.length) return;

  const qty = Math.max(1, Number(order.quantity) || 1);
  const sizeLabel = String(order.size).trim();
  const colorLabel = normalizeColorLabel(order.order_color);

  const [sizeRows] = await conn.query(
    `SELECT id FROM product_sizes WHERE product_id = ? AND size = ? AND color_label = ? FOR UPDATE`,
    [order.product_id, sizeLabel, colorLabel]
  );

  if (sizeRows.length) {
    await conn.query(`UPDATE product_sizes SET stock_qty = stock_qty + ? WHERE id = ?`, [qty, sizeRows[0].id]);
  } else {
    await conn.query(
      `INSERT INTO product_sizes (product_id, size, color_label, stock_qty, status) VALUES (?, ?, ?, ?, 'active')`,
      [order.product_id, sizeLabel, colorLabel, qty]
    );
  }

  await logMovement(conn, {
    productId: order.product_id,
    size: sizeLabel,
    colorLabel,
    quantity: qty,
    movementType: 'in',
    reason: 'cancel',
    orderId,
    comment: 'Возврат при отмене заказа',
  });
}
