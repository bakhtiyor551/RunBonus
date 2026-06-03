import { pool } from '../db.js';
import { DELIVERY_METHODS as DEFAULT_METHODS } from '../constants/deliveryMethods.js';

let tableReady = null;

async function ensureTable() {
  if (tableReady) return tableReady;
  tableReady = (async () => {
    try {
      await pool.query(`SELECT 1 FROM delivery_methods LIMIT 1`);
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
      return false;
    }
    const [rows] = await pool.query(`SELECT COUNT(*) AS c FROM delivery_methods`);
    if (Number(rows[0]?.c) === 0) {
      for (let i = 0; i < DEFAULT_METHODS.length; i++) {
        const m = DEFAULT_METHODS[i];
        await pool.query(
          `INSERT INTO delivery_methods (id, label, requires_address, sort_order, status, is_builtin)
           VALUES (?, ?, ?, ?, 'active', 1)`,
          [m.id, m.label, m.requiresAddress ? 1 : 0, (i + 1) * 10]
        );
      }
    }
    return true;
  })();
  return tableReady;
}

export function mapDeliveryMethodRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    requiresAddress: Boolean(row.requires_address),
    sort_order: Number(row.sort_order) || 0,
    status: row.status,
    is_builtin: Boolean(row.is_builtin),
  };
}

async function loadRows({ activeOnly = false } = {}) {
  const hasTable = await ensureTable();
  if (!hasTable) {
    return DEFAULT_METHODS.map((m, i) => ({
      id: m.id,
      label: m.label,
      requires_address: m.requiresAddress ? 1 : 0,
      sort_order: (i + 1) * 10,
      status: 'active',
      is_builtin: 1,
    }));
  }
  let sql = `SELECT * FROM delivery_methods`;
  if (activeOnly) sql += ` WHERE status = 'active'`;
  sql += ` ORDER BY sort_order ASC, id ASC`;
  const [rows] = await pool.query(sql);
  return rows;
}

export async function listActiveDeliveryMethods() {
  const rows = await loadRows({ activeOnly: true });
  return rows.map(mapDeliveryMethodRow).filter(Boolean);
}

export async function listAllDeliveryMethodsAdmin() {
  const rows = await loadRows({ activeOnly: false });
  return rows.map(mapDeliveryMethodRow);
}

export async function getDeliveryMethodById(id) {
  const hasTable = await ensureTable();
  if (!hasTable) {
    const m = DEFAULT_METHODS.find((x) => x.id === id);
    return m
      ? mapDeliveryMethodRow({
          id: m.id,
          label: m.label,
          requires_address: m.requiresAddress ? 1 : 0,
          sort_order: 0,
          status: 'active',
          is_builtin: 1,
        })
      : null;
  }
  const [rows] = await pool.query(`SELECT * FROM delivery_methods WHERE id = ?`, [id]);
  return rows.length ? mapDeliveryMethodRow(rows[0]) : null;
}

export async function isValidDeliveryMethod(id) {
  const m = await getDeliveryMethodById(id);
  return Boolean(m && m.status === 'active');
}

export async function deliveryMethodLabel(id) {
  const m = await getDeliveryMethodById(id);
  if (m) return m.label;
  const fallback = DEFAULT_METHODS.find((x) => x.id === id);
  return fallback?.label || id || '—';
}

export async function deliveryMethodRequiresAddress(id) {
  const m = await getDeliveryMethodById(id);
  if (m) return m.requiresAddress;
  const fallback = DEFAULT_METHODS.find((x) => x.id === id);
  return fallback?.requiresAddress ?? true;
}

function normalizeId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 32);
}

export async function createDeliveryMethod(data) {
  await ensureTable();
  const id = normalizeId(data.id);
  if (!id) {
    const err = new Error('Укажите код способа (латиница)');
    err.status = 400;
    throw err;
  }
  if (!data.label?.trim()) {
    const err = new Error('Укажите название');
    err.status = 400;
    throw err;
  }
  const [dup] = await pool.query(`SELECT id FROM delivery_methods WHERE id = ?`, [id]);
  if (dup.length) {
    const err = new Error('Такой код уже существует');
    err.status = 409;
    throw err;
  }
  await pool.query(
    `INSERT INTO delivery_methods (id, label, requires_address, sort_order, status, is_builtin)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [
      id,
      data.label.trim(),
      data.requires_address ? 1 : 0,
      Number(data.sort_order) || 0,
      data.status === 'inactive' ? 'inactive' : 'active',
    ]
  );
  return getDeliveryMethodById(id);
}

export async function updateDeliveryMethod(id, data) {
  await ensureTable();
  const [existing] = await pool.query(`SELECT * FROM delivery_methods WHERE id = ?`, [id]);
  if (!existing.length) {
    const err = new Error('Способ доставки не найден');
    err.status = 404;
    throw err;
  }
  const row = existing[0];
  await pool.query(
    `UPDATE delivery_methods SET label = ?, requires_address = ?, sort_order = ?, status = ? WHERE id = ?`,
    [
      data.label?.trim() || row.label,
      data.requires_address != null ? (data.requires_address ? 1 : 0) : row.requires_address,
      data.sort_order != null ? Number(data.sort_order) : row.sort_order,
      data.status === 'inactive' ? 'inactive' : data.status === 'active' ? 'active' : row.status,
      id,
    ]
  );
  return getDeliveryMethodById(id);
}

export async function setDeliveryMethodStatus(id, status) {
  return updateDeliveryMethod(id, { status: status === 'inactive' ? 'inactive' : 'active' });
}
