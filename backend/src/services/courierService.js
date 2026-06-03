import { pool } from '../db.js';

export async function listCouriers({ activeOnly = false } = {}) {
  const where = activeOnly ? "WHERE status = 'active'" : '';
  const [rows] = await pool.query(
    `SELECT id, name, phone, status, created_at, updated_at FROM couriers ${where} ORDER BY name ASC`
  );
  return rows.map(mapCourier);
}

export async function getCourierById(id) {
  const [rows] = await pool.query(`SELECT * FROM couriers WHERE id = ?`, [id]);
  return rows.length ? mapCourier(rows[0]) : null;
}

export async function createCourier({ name, phone }) {
  const n = name?.trim();
  const p = phone?.trim();
  if (!n || !p) {
    const err = new Error('Укажите имя и телефон курьера');
    err.status = 400;
    throw err;
  }
  const [result] = await pool.query(
    `INSERT INTO couriers (name, phone, status) VALUES (?, ?, 'active')`,
    [n, p]
  );
  return getCourierById(result.insertId);
}

export async function updateCourier(id, { name, phone, status }) {
  const existing = await getCourierById(id);
  if (!existing) {
    const err = new Error('Курьер не найден');
    err.status = 404;
    throw err;
  }
  await pool.query(`UPDATE couriers SET name = ?, phone = ?, status = ? WHERE id = ?`, [
    name?.trim() || existing.name,
    phone?.trim() || existing.phone,
    status || existing.status,
    id,
  ]);
  return getCourierById(id);
}

export async function assignCourierToOrder(orderId, courierId) {
  const [orders] = await pool.query(`SELECT id, status FROM shop_orders WHERE id = ?`, [orderId]);
  if (!orders.length) {
    const err = new Error('Заказ не найден');
    err.status = 404;
    throw err;
  }
  if (orders[0].status === 'cancelled') {
    const err = new Error('Нельзя назначить курьера на отменённый заказ');
    err.status = 400;
    throw err;
  }

  const courier = await getCourierById(courierId);
  if (!courier || courier.status !== 'active') {
    const err = new Error('Курьер не найден или неактивен');
    err.status = 400;
    throw err;
  }

  try {
    await pool.query(
      `UPDATE shop_orders SET courier_id = ?, delivery_assigned_at = NOW() WHERE id = ?`,
      [courierId, orderId]
    );
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      const e = new Error('Примените миграцию курьеров на сервере (013_couriers)');
      e.status = 500;
      throw e;
    }
    throw err;
  }

  return { orderId, courier };
}

function mapCourier(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
