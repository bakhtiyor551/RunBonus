import { pool } from '../db.js';

export async function listAccounts() {
  const [rows] = await pool.query(
    `SELECT id, name, type, initial_balance, current_balance, currency, status, comment, created_at, updated_at
     FROM accounts ORDER BY id DESC`
  );
  return rows.map(mapAccount);
}

export async function getAccountById(id) {
  const [rows] = await pool.query('SELECT * FROM accounts WHERE id = ?', [id]);
  return rows.length ? mapAccount(rows[0]) : null;
}

export async function createAccount(conn, data, adminId = null) {
  const { name, type, initial_balance = 0, currency = 'TJS', comment } = data;
  const balance = Number(initial_balance) || 0;

  const [result] = await conn.query(
    `INSERT INTO accounts (name, type, initial_balance, current_balance, currency, comment)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, type, balance, balance, currency, comment || null]
  );

  if (balance > 0) {
    await conn.query(
      `INSERT INTO account_transactions
       (account_id, type, amount, balance_before, balance_after, comment, created_by)
       VALUES (?, 'topup', ?, 0, ?, ?, ?)`,
      [result.insertId, balance, balance, comment || 'Начальный баланс при открытии счёта', adminId]
    );
  }

  const [rows] = await conn.query('SELECT * FROM accounts WHERE id = ?', [result.insertId]);
  return mapAccount(rows[0]);
}

export async function topupAccount(conn, accountId, amount, comment, adminId) {
  const [rows] = await conn.query('SELECT * FROM accounts WHERE id = ? FOR UPDATE', [accountId]);
  if (!rows.length) throw new Error('ACCOUNT_NOT_FOUND');
  const account = rows[0];
  if (account.status !== 'active') throw new Error('ACCOUNT_NOT_ACTIVE');

  const amt = Number(amount);
  if (amt <= 0) throw new Error('INVALID_AMOUNT');

  const before = Number(account.current_balance);
  const after = before + amt;

  await conn.query('UPDATE accounts SET current_balance = ? WHERE id = ?', [after, accountId]);
  await conn.query(
    `INSERT INTO account_transactions
     (account_id, type, amount, balance_before, balance_after, comment, created_by)
     VALUES (?, 'topup', ?, ?, ?, ?, ?)`,
    [accountId, amt, before, after, comment || 'Пополнение счёта', adminId]
  );

  return { balance_before: before, balance_after: after };
}

export async function setAccountStatus(accountId, status) {
  if (!['active', 'blocked', 'closed'].includes(status)) {
    throw new Error('INVALID_STATUS');
  }
  const [result] = await pool.query('UPDATE accounts SET status = ? WHERE id = ?', [status, accountId]);
  if (result.affectedRows === 0) throw new Error('ACCOUNT_NOT_FOUND');
  return getAccountById(accountId);
}

export async function getAccountTransactions(accountId, limit = 100) {
  const [rows] = await pool.query(
    `SELECT at.id, at.account_id, at.user_id, at.workout_id, at.type, at.amount,
            at.balance_before, at.balance_after, at.comment, at.created_at,
            u.name AS user_name, u.phone AS user_phone
     FROM account_transactions at
     LEFT JOIN users u ON u.id = at.user_id
     WHERE at.account_id = ?
     ORDER BY at.created_at DESC
     LIMIT ?`,
    [accountId, limit]
  );
  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
    balance_before: Number(r.balance_before),
    balance_after: Number(r.balance_after),
  }));
}

export async function getActiveBonusFund(conn) {
  const [rows] = await conn.query(
    `SELECT * FROM accounts
     WHERE type = 'bonus_fund' AND status = 'active'
     ORDER BY id ASC
     LIMIT 1
     FOR UPDATE`
  );
  return rows[0] || null;
}

export async function getBonusFundBalance(conn) {
  const account = await getActiveBonusFund(conn);
  return account ? Number(account.current_balance) : 0;
}

export async function getUserWallet(conn, userId, lock = false) {
  const sql = `SELECT * FROM user_bonus_wallets WHERE user_id = ?${lock ? ' FOR UPDATE' : ''}`;
  const [rows] = await conn.query(sql, [userId]);
  return rows[0] || null;
}

export async function ensureUserWallet(conn, userId, lock = true) {
  let wallet = await getUserWallet(conn, userId, lock);
  if (wallet) return wallet;

  await conn.query(
    'INSERT INTO user_bonus_wallets (user_id, balance, blocked_balance, total_earned, total_spent, total_withdrawn) VALUES (?, 0, 0, 0, 0, 0)',
    [userId]
  );
  wallet = await getUserWallet(conn, userId, lock);
  return wallet;
}

export async function getUserWalletInfo(userId) {
  const wallet = await ensureUserWallet(pool, userId);
  const [tx] = await pool.query(
    `SELECT id, type, amount, balance_before, balance_after, comment, created_at, workout_id, shoe_id
     FROM user_bonus_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  return {
    user_id: userId,
    balance: Number(wallet.balance),
    total_earned: Number(wallet.total_earned),
    total_spent: Number(wallet.total_spent),
    transactions: tx.map((r) => ({
      ...r,
      amount: Number(r.amount),
      balance_before: Number(r.balance_before),
      balance_after: Number(r.balance_after),
    })),
  };
}

function mapAccount(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    initial_balance: Number(row.initial_balance),
    current_balance: Number(row.current_balance),
    currency: row.currency,
    status: row.status,
    comment: row.comment,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
