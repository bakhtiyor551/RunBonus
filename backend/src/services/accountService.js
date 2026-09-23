import { pool } from '../db.js';

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

export async function getBonusFundBalance(conn = pool) {
  const [rows] = await conn.query(
    `SELECT current_balance, currency FROM accounts
     WHERE type = 'bonus_fund' AND status = 'active'
     ORDER BY id ASC LIMIT 1`
  );
  if (!rows.length) return { balance: 0, currency: 'TJS' };
  return {
    balance: Number(rows[0].current_balance),
    currency: rows[0].currency || 'TJS',
  };
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

export async function getWalletSummary(conn, userId, lock = false) {
  const wallet = await ensureUserWallet(conn, userId, lock);
  const balance = Number(wallet.balance);
  const blocked = Number(wallet.blocked_balance || 0);
  return {
    balance,
    blocked_balance: blocked,
    available_balance: Math.round((balance - blocked) * 100) / 100,
    total_withdrawn: Number(wallet.total_withdrawn || 0),
  };
}
