import { pool } from '../db.js';
import { MOBILE_PAYMENT_ACCOUNTS as DEFAULT_ACCOUNTS } from '../constants/mobilePaymentAccounts.js';

let tableReady = null;

async function ensureTable() {
  if (tableReady) return tableReady;
  tableReady = (async () => {
    try {
      await pool.query(`SELECT 1 FROM mobile_payment_accounts LIMIT 1`);
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
      return false;
    }
    const [rows] = await pool.query(`SELECT COUNT(*) AS c FROM mobile_payment_accounts`);
    if (Number(rows[0]?.c) === 0) {
      for (let i = 0; i < DEFAULT_ACCOUNTS.length; i++) {
        const a = DEFAULT_ACCOUNTS[i];
        await pool.query(
          `INSERT INTO mobile_payment_accounts (id, provider, number, holder, sort_order, status)
           VALUES (?, ?, ?, ?, ?, 'active')`,
          [a.id, a.provider, a.number, a.holder || 'RunBonus', (i + 1) * 10]
        );
      }
    }
    return true;
  })();
  return tableReady;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    number: row.number,
    holder: row.holder,
    sort_order: Number(row.sort_order) || 0,
    status: row.status,
  };
}

async function loadRows({ activeOnly = false } = {}) {
  const hasTable = await ensureTable();
  if (!hasTable) {
    return DEFAULT_ACCOUNTS.map((a, i) => ({
      id: a.id,
      provider: a.provider,
      number: a.number,
      holder: a.holder,
      sort_order: (i + 1) * 10,
      status: 'active',
    }));
  }
  let sql = `SELECT * FROM mobile_payment_accounts`;
  if (activeOnly) sql += ` WHERE status = 'active'`;
  sql += ` ORDER BY sort_order ASC, id ASC`;
  const [rows] = await pool.query(sql);
  return rows;
}

export async function listActiveMobilePaymentAccounts() {
  const rows = await loadRows({ activeOnly: true });
  return rows.map(mapRow);
}

export async function listAllMobilePaymentAccountsAdmin() {
  const rows = await loadRows({ activeOnly: false });
  return rows.map(mapRow);
}

function normalizeId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 32);
}

export async function updateMobilePaymentAccount(id, data) {
  await ensureTable();
  const [existing] = await pool.query(`SELECT * FROM mobile_payment_accounts WHERE id = ?`, [id]);
  if (!existing.length) {
    const err = new Error('Кошелёк не найден');
    err.status = 404;
    throw err;
  }
  const row = existing[0];
  if (!data.number?.trim()) {
    const err = new Error('Укажите номер кошелька');
    err.status = 400;
    throw err;
  }
  await pool.query(
    `UPDATE mobile_payment_accounts SET
       provider = ?,
       number = ?,
       holder = ?,
       sort_order = ?,
       status = ?
     WHERE id = ?`,
    [
      data.provider?.trim() || row.provider,
      data.number.trim(),
      data.holder?.trim() || row.holder,
      data.sort_order != null ? Number(data.sort_order) : row.sort_order,
      data.status === 'inactive' ? 'inactive' : data.status === 'active' ? 'active' : row.status,
      id,
    ]
  );
  const [rows] = await pool.query(`SELECT * FROM mobile_payment_accounts WHERE id = ?`, [id]);
  return mapRow(rows[0]);
}

export async function createMobilePaymentAccount(data) {
  await ensureTable();
  const id = normalizeId(data.id);
  if (!id || !data.provider?.trim() || !data.number?.trim()) {
    const err = new Error('Укажите код, сервис и номер');
    err.status = 400;
    throw err;
  }
  const [dup] = await pool.query(`SELECT id FROM mobile_payment_accounts WHERE id = ?`, [id]);
  if (dup.length) {
    const err = new Error('Такой код уже существует');
    err.status = 409;
    throw err;
  }
  await pool.query(
    `INSERT INTO mobile_payment_accounts (id, provider, number, holder, sort_order, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.provider.trim(),
      data.number.trim(),
      data.holder?.trim() || 'RunBonus',
      Number(data.sort_order) || 0,
      data.status === 'inactive' ? 'inactive' : 'active',
    ]
  );
  const [rows] = await pool.query(`SELECT * FROM mobile_payment_accounts WHERE id = ?`, [id]);
  return mapRow(rows[0]);
}

export async function setMobilePaymentAccountStatus(id, status) {
  return updateMobilePaymentAccount(id, { status: status === 'inactive' ? 'inactive' : 'active' });
}
