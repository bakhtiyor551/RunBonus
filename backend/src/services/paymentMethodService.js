import { pool } from '../db.js';
import { PAYMENT_METHODS as DEFAULT_METHODS } from '../constants/paymentMethods.js';

let tableReady = null;

async function ensureTable() {
  if (tableReady) return tableReady;
  tableReady = (async () => {
    try {
      await pool.query(`SELECT 1 FROM payment_methods LIMIT 1`);
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
      for (const m of DEFAULT_METHODS) {
        // таблица создаётся миграцией; без неё — только константы
      }
      return false;
    }
    const [rows] = await pool.query(`SELECT COUNT(*) AS c FROM payment_methods`);
    if (Number(rows[0]?.c) === 0) {
      for (let i = 0; i < DEFAULT_METHODS.length; i++) {
        const m = DEFAULT_METHODS[i];
        await pool.query(
          `INSERT INTO payment_methods (id, label, needs_details, details_label, uses_transfer_modal, sort_order, status, is_builtin)
           VALUES (?, ?, ?, ?, ?, ?, 'active', 1)`,
          [
            m.id,
            m.label,
            m.needsDetails ? 1 : 0,
            m.detailsLabel || null,
            m.usesTransferModal ? 1 : 0,
            (i + 1) * 10,
          ]
        );
      }
    }
    return true;
  })();
  return tableReady;
}

export function mapPaymentMethodRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    needsDetails: Boolean(row.needs_details),
    detailsLabel: row.details_label || undefined,
    usesTransferModal: Boolean(row.uses_transfer_modal),
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
      needs_details: m.needsDetails ? 1 : 0,
      details_label: m.detailsLabel || null,
      uses_transfer_modal: m.usesTransferModal ? 1 : 0,
      sort_order: (i + 1) * 10,
      status: 'active',
      is_builtin: 1,
    }));
  }
  let sql = `SELECT * FROM payment_methods`;
  if (activeOnly) sql += ` WHERE status = 'active'`;
  sql += ` ORDER BY sort_order ASC, id ASC`;
  const [rows] = await pool.query(sql);
  return rows;
}

export async function listActivePaymentMethods({ hideBonusIfNoBalance = false, availableBonus = 0 } = {}) {
  const rows = await loadRows({ activeOnly: true });
  let methods = rows.map(mapPaymentMethodRow).filter(Boolean);
  if (hideBonusIfNoBalance && Number(availableBonus) <= 0) {
    methods = methods.filter((m) => m.id !== 'bonus');
  }
  return methods;
}

export async function listAllPaymentMethodsAdmin() {
  const rows = await loadRows({ activeOnly: false });
  return rows.map(mapPaymentMethodRow);
}

export async function getPaymentMethodById(id) {
  const hasTable = await ensureTable();
  if (!hasTable) {
    const m = DEFAULT_METHODS.find((x) => x.id === id);
    return m ? mapPaymentMethodRow({
      id: m.id,
      label: m.label,
      needs_details: m.needsDetails ? 1 : 0,
      details_label: m.detailsLabel || null,
      uses_transfer_modal: m.usesTransferModal ? 1 : 0,
      sort_order: 0,
      status: 'active',
      is_builtin: 1,
    }) : null;
  }
  const [rows] = await pool.query(`SELECT * FROM payment_methods WHERE id = ?`, [id]);
  return rows.length ? mapPaymentMethodRow(rows[0]) : null;
}

export async function isValidPaymentMethod(id) {
  const m = await getPaymentMethodById(id);
  return Boolean(m && m.status === 'active');
}

export async function paymentMethodLabel(id) {
  const m = await getPaymentMethodById(id);
  if (m) return m.label;
  const fallback = DEFAULT_METHODS.find((x) => x.id === id);
  return fallback?.label || id || '—';
}

export async function paymentMethodNeedsDetails(id) {
  const m = await getPaymentMethodById(id);
  if (m) return m.needsDetails;
  const fallback = DEFAULT_METHODS.find((x) => x.id === id);
  return fallback?.needsDetails ?? false;
}

export async function paymentMethodUsesTransferModal(id) {
  const m = await getPaymentMethodById(id);
  if (m) return m.usesTransferModal;
  return id === 'mobile';
}

function normalizeId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 32);
}

export async function createPaymentMethod(data) {
  await ensureTable();
  const id = normalizeId(data.id);
  if (!id) {
    const err = new Error('Укажите код способа (латиница, например card_online)');
    err.status = 400;
    throw err;
  }
  if (!data.label?.trim()) {
    const err = new Error('Укажите название');
    err.status = 400;
    throw err;
  }
  const [dup] = await pool.query(`SELECT id FROM payment_methods WHERE id = ?`, [id]);
  if (dup.length) {
    const err = new Error('Такой код уже существует');
    err.status = 409;
    throw err;
  }
  await pool.query(
    `INSERT INTO payment_methods (id, label, needs_details, details_label, uses_transfer_modal, sort_order, status, is_builtin)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      data.label.trim(),
      data.needs_details ? 1 : 0,
      data.details_label?.trim() || null,
      data.uses_transfer_modal ? 1 : 0,
      Number(data.sort_order) || 0,
      data.status === 'inactive' ? 'inactive' : 'active',
    ]
  );
  return getPaymentMethodById(id);
}

export async function updatePaymentMethod(id, data) {
  await ensureTable();
  const [existing] = await pool.query(`SELECT * FROM payment_methods WHERE id = ?`, [id]);
  if (!existing.length) {
    const err = new Error('Способ оплаты не найден');
    err.status = 404;
    throw err;
  }
  const row = existing[0];
  await pool.query(
    `UPDATE payment_methods SET
       label = ?,
       needs_details = ?,
       details_label = ?,
       uses_transfer_modal = ?,
       sort_order = ?,
       status = ?
     WHERE id = ?`,
    [
      data.label?.trim() || row.label,
      data.needs_details != null ? (data.needs_details ? 1 : 0) : row.needs_details,
      data.details_label !== undefined ? (data.details_label?.trim() || null) : row.details_label,
      data.uses_transfer_modal != null ? (data.uses_transfer_modal ? 1 : 0) : row.uses_transfer_modal,
      data.sort_order != null ? Number(data.sort_order) : row.sort_order,
      data.status === 'inactive' ? 'inactive' : data.status === 'active' ? 'active' : row.status,
      id,
    ]
  );
  return getPaymentMethodById(id);
}

export async function setPaymentMethodStatus(id, status) {
  return updatePaymentMethod(id, { status: status === 'inactive' ? 'inactive' : 'active' });
}
