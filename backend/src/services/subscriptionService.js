import { pool } from '../db.js';

export async function hasSubscriptionTables() {
  try {
    await pool.query('SELECT 1 FROM user_subscriptions LIMIT 1');
    return true;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

export async function isPremiumActive(userId) {
  if (!(await hasSubscriptionTables())) return false;
  const [rows] = await pool.query(
    `SELECT id FROM user_subscriptions
     WHERE user_id = ? AND status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY expires_at DESC LIMIT 1`,
    [userId]
  );
  return rows.length > 0;
}

export async function getSubscriptionInfo(userId) {
  if (!(await hasSubscriptionTables())) {
    return { is_premium: false, plan: null, expires_at: null };
  }
  const [rows] = await pool.query(
    `SELECT plan, status, started_at, expires_at, source
     FROM user_subscriptions
     WHERE user_id = ? AND status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY expires_at DESC LIMIT 1`,
    [userId]
  );
  if (!rows.length) {
    return { is_premium: false, plan: null, expires_at: null };
  }
  const s = rows[0];
  return {
    is_premium: true,
    plan: s.plan,
    started_at: s.started_at,
    expires_at: s.expires_at,
    source: s.source,
  };
}

export async function grantPremium(userId, { days = 30, source = 'admin' } = {}) {
  if (!(await hasSubscriptionTables())) {
    const err = new Error('Таблица подписок не создана');
    err.status = 503;
    throw err;
  }
  await pool.query(
    `UPDATE user_subscriptions SET status = 'expired' WHERE user_id = ? AND status = 'active'`,
    [userId]
  );
  const expiresAt = days > 0
    ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    : null;
  await pool.query(
    `INSERT INTO user_subscriptions (user_id, plan, status, expires_at, source)
     VALUES (?, 'runbonus_plus', 'active', ?, ?)`,
    [userId, expiresAt, source]
  );
  return getSubscriptionInfo(userId);
}

export async function revokePremium(userId) {
  if (!(await hasSubscriptionTables())) return;
  await pool.query(
    `UPDATE user_subscriptions SET status = 'cancelled' WHERE user_id = ? AND status = 'active'`,
    [userId]
  );
}
