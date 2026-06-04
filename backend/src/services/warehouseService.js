import { pool } from '../db.js';

let tableReady = null;

async function ensureTable() {
  if (tableReady) return tableReady;
  tableReady = (async () => {
    try {
      await pool.query(`SELECT 1 FROM stock_movements LIMIT 1`);
      return true;
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
      await pool.query(`
        CREATE TABLE IF NOT EXISTS stock_movements (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          product_id BIGINT NOT NULL,
          size VARCHAR(20) NOT NULL,
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
      return true;
    }
  })();
  return tableReady;
}

async function logMovement(conn, { productId, size, quantity, movementType, reason, orderId = null, comment = null }) {
  await ensureTable();
  const db = conn || pool;
  await db.query(
    `INSERT INTO stock_movements (product_id, size, quantity, movement_type, reason, order_id, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [productId, size, Math.abs(quantity), movementType, reason, orderId, comment]
  );
}

export async function listWarehouseStock() {
  const [rows] = await pool.query(
    `SELECT p.id AS product_id, p.name AS product_name, p.status AS product_status,
            pc.name AS category_name,
            ps.id AS size_id, ps.size, ps.stock_qty, ps.status AS size_status
     FROM products p
     LEFT JOIN product_categories pc ON pc.id COLLATE utf8mb4_unicode_ci = p.category_id
     LEFT JOIN product_sizes ps ON ps.product_id = p.id
     ORDER BY p.id DESC, ps.size ASC`
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
        sizes: [],
      });
    }
    if (row.size) {
      const qty = Number(row.stock_qty) || 0;
      byProduct.get(row.product_id).sizes.push({
        id: row.size_id,
        size: row.size,
        stock_qty: qty,
        status: row.size_status,
      });
      if (row.size_status === 'active') {
        byProduct.get(row.product_id).total_stock += qty;
      }
    }
  }
  return [...byProduct.values()];
}

export async function listStockMovements(limit = 100) {
  await ensureTable();
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
    quantity: r.quantity,
    movement_type: r.movement_type,
    reason: r.reason,
    order_id: r.order_id,
    comment: r.comment,
    created_at: r.created_at,
  }));
}

export async function addStock({ product_id, size, quantity, comment }) {
  const productId = Number(product_id);
  const sizeLabel = String(size || '').trim();
  const qty = Math.max(1, Math.min(9999, Number(quantity) || 0));

  if (!productId || !sizeLabel) {
    const err = new Error('Укажите товар, размер и количество');
    err.status = 400;
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [products] = await conn.query(`SELECT id, name FROM products WHERE id = ?`, [productId]);
    if (!products.length) {
      const err = new Error('Товар не найден');
      err.status = 404;
      throw err;
    }

    const [sizeRows] = await conn.query(
      `SELECT id, stock_qty FROM product_sizes WHERE product_id = ? AND size = ? FOR UPDATE`,
      [productId, sizeLabel]
    );

    if (sizeRows.length) {
      await conn.query(`UPDATE product_sizes SET stock_qty = stock_qty + ?, status = 'active' WHERE id = ?`, [
        qty,
        sizeRows[0].id,
      ]);
    } else {
      await conn.query(
        `INSERT INTO product_sizes (product_id, size, stock_qty, status) VALUES (?, ?, ?, 'active')`,
        [productId, sizeLabel, qty]
      );
    }

    await logMovement(conn, {
      productId,
      size: sizeLabel,
      quantity: qty,
      movementType: 'in',
      reason: 'receipt',
      comment: comment?.trim() || null,
    });

    await conn.commit();

    const [updated] = await conn.query(
      `SELECT stock_qty FROM product_sizes WHERE product_id = ? AND size = ?`,
      [productId, sizeLabel]
    );

    return {
      ok: true,
      product_id: productId,
      product_name: products[0].name,
      size: sizeLabel,
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

export async function decrementStockForOrder(conn, { productId, size, quantity, orderId }) {
  const sizeLabel = String(size || '').trim();
  const qty = Math.max(1, Number(quantity) || 1);
  if (!sizeLabel) return;

  await ensureTable();

  const [sizeRows] = await conn.query(
    `SELECT id, stock_qty FROM product_sizes WHERE product_id = ? AND size = ? AND status = 'active' FOR UPDATE`,
    [productId, sizeLabel]
  );

  if (!sizeRows.length || sizeRows[0].stock_qty < qty) {
    const err = new Error('Выбранный размер недоступен');
    err.status = 400;
    throw err;
  }

  await conn.query(`UPDATE product_sizes SET stock_qty = stock_qty - ? WHERE id = ?`, [qty, sizeRows[0].id]);

  await logMovement(conn, {
    productId,
    size: sizeLabel,
    quantity: qty,
    movementType: 'out',
    reason: 'order',
    orderId,
  });
}

export async function restoreStockForCancelledOrder(conn, orderId) {
  await ensureTable();

  const [orders] = await conn.query(`SELECT product_id, size, quantity FROM shop_orders WHERE id = ?`, [orderId]);
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

  const [sizeRows] = await conn.query(
    `SELECT id FROM product_sizes WHERE product_id = ? AND size = ? FOR UPDATE`,
    [order.product_id, sizeLabel]
  );

  if (sizeRows.length) {
    await conn.query(`UPDATE product_sizes SET stock_qty = stock_qty + ? WHERE id = ?`, [qty, sizeRows[0].id]);
  } else {
    await conn.query(
      `INSERT INTO product_sizes (product_id, size, stock_qty, status) VALUES (?, ?, ?, 'active')`,
      [order.product_id, sizeLabel, qty]
    );
  }

  await logMovement(conn, {
    productId: order.product_id,
    size: sizeLabel,
    quantity: qty,
    movementType: 'in',
    reason: 'cancel',
    orderId,
    comment: 'Возврат при отмене заказа',
  });
}
