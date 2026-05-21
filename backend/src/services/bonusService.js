import { pool } from '../db.js';
import {
  getActiveBonusFund,
  ensureUserWallet,
  getUserWallet,
} from './accountService.js';

export async function getShoeTotalEarned(userId, shoeId) {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM user_bonus_transactions
     WHERE user_id = ? AND shoe_id = ? AND type = 'earn'`,
    [userId, shoeId]
  );
  const walletTotal = Number(rows[0].total);
  if (walletTotal > 0) return walletTotal;

  const [legacy] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM bonuses
     WHERE user_id = ? AND shoe_id = ? AND type = 'earn'`,
    [userId, shoeId]
  );
  return Number(legacy[0].total);
}

export async function getDailyEarned(userId, shoeId, date) {
  const [rows] = await pool.query(
    `SELECT earned_amount FROM daily_bonus_limits
     WHERE user_id = ? AND shoe_id = ? AND date = ?`,
    [userId, shoeId, date]
  );
  return rows.length ? Number(rows[0].earned_amount) : 0;
}

export async function getUserBalance(userId) {
  const wallet = await getUserWallet(pool, userId);
  if (wallet) return Number(wallet.balance);

  const [rows] = await pool.query(
    `SELECT balance_after FROM bonuses WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  return rows.length ? Number(rows[0].balance_after) : 0;
}

export function calcRawBonus(distanceKm, pricePerKm) {
  return Math.round(distanceKm * pricePerKm * 100) / 100;
}

export function calcBonusAmount(distanceKm, dailyEarned, shoeTotalEarned, settings) {
  const pricePerKm = settings.price_per_km;
  let bonus = calcRawBonus(distanceKm, pricePerKm);
  const dailyRemaining = Math.max(0, settings.daily_limit - dailyEarned);
  if (bonus > dailyRemaining) bonus = dailyRemaining;

  const shoeRemaining = Math.max(0, settings.total_limit_per_shoe - shoeTotalEarned);
  if (bonus > shoeRemaining) bonus = shoeRemaining;

  return Math.max(0, Math.round(bonus * 100) / 100);
}

/**
 * Списание с бонусного фонда компании и зачисление клиенту.
 * @returns {{ balanceAfter, fundAfter, accountId }}
 */
export async function applyBonus(conn, { userId, shoeId, workoutId, amount, adminId = null }) {
  const fund = await getActiveBonusFund(conn);
  if (!fund) {
    const err = new Error('NO_BONUS_FUND');
    err.code = 'NO_BONUS_FUND';
    throw err;
  }

  const fundBefore = Number(fund.current_balance);
  if (fundBefore < amount) {
    const err = new Error('INSUFFICIENT_FUND');
    err.code = 'INSUFFICIENT_FUND';
    throw err;
  }

  const fundAfter = Math.round((fundBefore - amount) * 100) / 100;
  await conn.query('UPDATE accounts SET current_balance = ? WHERE id = ?', [fundAfter, fund.id]);

  const [accTx] = await conn.query(
    `INSERT INTO account_transactions
     (account_id, user_id, workout_id, type, amount, balance_before, balance_after, comment, created_by)
     VALUES (?, ?, ?, 'bonus_to_client', ?, ?, ?, ?, ?)`,
    [
      fund.id,
      userId,
      workoutId,
      amount,
      fundBefore,
      fundAfter,
      'Начисление бонуса клиенту за тренировку',
      adminId,
    ]
  );

  const wallet = await ensureUserWallet(conn, userId);
  const walletBefore = Number(wallet.balance);
  const walletAfter = Math.round((walletBefore + amount) * 100) / 100;

  await conn.query(
    `UPDATE user_bonus_wallets SET balance = ?, total_earned = total_earned + ? WHERE user_id = ?`,
    [walletAfter, amount, userId]
  );

  await conn.query(
    `INSERT INTO user_bonus_transactions
     (user_id, shoe_id, workout_id, account_transaction_id, type, amount, balance_before, balance_after, comment)
     VALUES (?, ?, ?, ?, 'earn', ?, ?, ?, ?)`,
    [
      userId,
      shoeId,
      workoutId,
      accTx.insertId,
      amount,
      walletBefore,
      walletAfter,
      'Начисление за тренировку',
    ]
  );

  await conn.query(
    `INSERT INTO bonuses (user_id, shoe_id, workout_id, type, amount, balance_after, comment)
     VALUES (?, ?, ?, 'earn', ?, ?, 'Начисление за тренировку')`,
    [userId, shoeId, workoutId, amount, walletAfter]
  );

  const today = new Date().toISOString().slice(0, 10);
  await conn.query(
    `INSERT INTO daily_bonus_limits (user_id, shoe_id, date, earned_amount)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE earned_amount = earned_amount + VALUES(earned_amount)`,
    [userId, shoeId, today, amount]
  );

  return { balanceAfter: walletAfter, fundAfter, accountId: fund.id };
}

/**
 * Пополнение кошелька клиента с бонусного фонда (админ).
 */
export async function topupClientBonus(conn, { userId, amount, comment, adminId = null }) {
  const fund = await getActiveBonusFund(conn);
  if (!fund) {
    const err = new Error('NO_BONUS_FUND');
    err.code = 'NO_BONUS_FUND';
    throw err;
  }

  const fundBefore = Number(fund.current_balance);
  if (fundBefore < amount) {
    const err = new Error('INSUFFICIENT_FUND');
    err.code = 'INSUFFICIENT_FUND';
    throw err;
  }

  const fundAfter = Math.round((fundBefore - amount) * 100) / 100;
  await conn.query('UPDATE accounts SET current_balance = ? WHERE id = ?', [fundAfter, fund.id]);

  const note = comment || 'Пополнение баланса клиента (админ)';
  const [accTx] = await conn.query(
    `INSERT INTO account_transactions
     (account_id, user_id, workout_id, type, amount, balance_before, balance_after, comment, created_by)
     VALUES (?, ?, NULL, 'bonus_to_client', ?, ?, ?, ?, ?)`,
    [fund.id, userId, amount, fundBefore, fundAfter, note, adminId]
  );

  const wallet = await ensureUserWallet(conn, userId);
  const walletBefore = Number(wallet.balance);
  const walletAfter = Math.round((walletBefore + amount) * 100) / 100;

  await conn.query(
    `UPDATE user_bonus_wallets SET balance = ?, total_earned = total_earned + ? WHERE user_id = ?`,
    [walletAfter, amount, userId]
  );

  await conn.query(
    `INSERT INTO user_bonus_transactions
     (user_id, account_transaction_id, type, amount, balance_before, balance_after, comment)
     VALUES (?, ?, 'manual', ?, ?, ?, ?)`,
    [userId, accTx.insertId, amount, walletBefore, walletAfter, note]
  );

  await conn.query(
    `INSERT INTO bonuses (user_id, type, amount, balance_after, comment)
     VALUES (?, 'manual_add', ?, ?, ?)`,
    [userId, amount, walletAfter, note]
  );

  return { balanceAfter: walletAfter, fundAfter, accountId: fund.id };
}

export async function spendBonus(conn, { userId, amount, comment, adminId = null }) {
  const wallet = await ensureUserWallet(conn, userId);
  const walletBefore = Number(wallet.balance);
  if (amount > walletBefore) {
    const err = new Error('INSUFFICIENT_BALANCE');
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }

  const walletAfter = Math.round((walletBefore - amount) * 100) / 100;
  await conn.query(
    `UPDATE user_bonus_wallets SET balance = ?, total_spent = total_spent + ? WHERE user_id = ?`,
    [walletAfter, amount, userId]
  );

  await conn.query(
    `INSERT INTO user_bonus_transactions
     (user_id, type, amount, balance_before, balance_after, comment)
     VALUES (?, 'spend', ?, ?, ?, ?)`,
    [userId, amount, walletBefore, walletAfter, comment || 'Скидка в магазине']
  );

  await conn.query(
    `INSERT INTO bonuses (user_id, type, amount, balance_after, comment)
     VALUES (?, 'spend', ?, ?, ?)`,
    [userId, amount, walletAfter, comment || 'Скидка в магазине']
  );

  return walletAfter;
}

export async function manualAdjustBonus(conn, { userId, amount, isRemove, comment }) {
  const wallet = await ensureUserWallet(conn, userId);
  const walletBefore = Number(wallet.balance);
  const delta = isRemove ? -Math.abs(amount) : Math.abs(amount);
  const walletAfter = Math.round((walletBefore + delta) * 100) / 100;

  if (walletAfter < 0) {
    const err = new Error('NEGATIVE_BALANCE');
    err.code = 'NEGATIVE_BALANCE';
    throw err;
  }

  await conn.query(
    `UPDATE user_bonus_wallets SET
      balance = ?,
      total_earned = total_earned + ?,
      total_spent = total_spent + ?
     WHERE user_id = ?`,
    [
      walletAfter,
      !isRemove ? Math.abs(amount) : 0,
      isRemove ? Math.abs(amount) : 0,
      userId,
    ]
  );

  const txType = isRemove ? 'manual' : 'manual';
  await conn.query(
    `INSERT INTO user_bonus_transactions
     (user_id, type, amount, balance_before, balance_after, comment)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, txType, Math.abs(amount), walletBefore, walletAfter, comment || 'Ручная корректировка']
  );

  const legacyType = isRemove ? 'manual_remove' : 'manual_add';
  await conn.query(
    `INSERT INTO bonuses (user_id, type, amount, balance_after, comment)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, legacyType, Math.abs(amount), walletAfter, comment || 'Ручная корректировка']
  );

  return walletAfter;
}
