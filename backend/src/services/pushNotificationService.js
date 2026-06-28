import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let messagingInstance = null;
let initAttempted = false;

async function getMessaging() {
  if (initAttempted) return messagingInstance;
  initAttempted = true;

  const { firebase } = config;
  if (!firebase.serviceAccount && !firebase.serviceAccountPath) {
    console.warn('[Push] Firebase service account not configured — push send disabled');
    return null;
  }

  try {
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getMessaging: getFbMessaging } = await import('firebase-admin/messaging');

    let app;
    if (!getApps().length) {
      let credentials = firebase.serviceAccount;
      if (!credentials && firebase.serviceAccountPath) {
        const abs = path.isAbsolute(firebase.serviceAccountPath)
          ? firebase.serviceAccountPath
          : path.resolve(__dirname, '../../', firebase.serviceAccountPath);
        credentials = JSON.parse(fs.readFileSync(abs, 'utf8'));
      }
      app = initializeApp({ credential: cert(credentials) });
    } else {
      app = getApps()[0];
    }
    messagingInstance = getFbMessaging(app);
    return messagingInstance;
  } catch (err) {
    console.error('[Push] Firebase init failed:', err.message);
    return null;
  }
}

async function hasPushTables() {
  try {
    await pool.query('SELECT 1 FROM user_push_tokens LIMIT 1');
    return true;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

export async function savePushToken(userId, token, platform = 'android', deviceId = null) {
  if (!token?.trim() || !(await hasPushTables())) return false;
  const clean = String(token).trim();
  await pool.query(
    `INSERT INTO user_push_tokens (user_id, token, platform, device_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE platform = VALUES(platform), device_id = VALUES(device_id), updated_at = NOW()`,
    [userId, clean, platform, deviceId || null]
  );
  return true;
}

export async function removePushToken(userId, token = null) {
  if (!(await hasPushTables())) return;
  if (token) {
    await pool.query('DELETE FROM user_push_tokens WHERE user_id = ? AND token = ?', [userId, token]);
    return;
  }
  await pool.query('DELETE FROM user_push_tokens WHERE user_id = ?', [userId]);
}

async function resolveTokensForAudience({ cities = [], levels = [] } = {}) {
  if (!(await hasPushTables())) return [];

  const cityList = Array.isArray(cities) ? cities.filter(Boolean) : [];
  const levelList = Array.isArray(levels)
    ? levels.map((l) => String(l).toLowerCase()).filter(Boolean)
    : [];

  let sql = `
    SELECT DISTINCT upt.token, upt.user_id, u.city,
           cl.code AS level_code
    FROM user_push_tokens upt
    JOIN users u ON u.id = upt.user_id AND u.status = 'active'
    LEFT JOIN user_active_shoes uas ON uas.user_id = u.id
    LEFT JOIN user_shoe_progress usp ON usp.user_id = u.id AND usp.shoe_id = uas.shoe_id
    LEFT JOIN customer_levels cl ON cl.id = usp.current_level_id
  `;
  const params = [];

  if (cityList.length) {
    sql += ` WHERE u.city IN (${cityList.map(() => '?').join(',')})`;
    params.push(...cityList);
  }

  const [rows] = await pool.query(sql, params);

  return rows
    .filter((row) => {
      if (!levelList.length) return true;
      if (!row.level_code) return false;
      return levelList.includes(String(row.level_code).toLowerCase());
    })
    .map((row) => row.token)
    .filter(Boolean);
}

async function getUserPushTokens(userId) {
  if (!userId || !(await hasPushTables())) return [];
  const [rows] = await pool.query(
    `SELECT token FROM user_push_tokens WHERE user_id = ?`,
    [userId]
  );
  return rows.map((r) => r.token).filter(Boolean);
}

async function pruneInvalidTokens(tokens) {
  if (!tokens.length || !(await hasPushTables())) return;
  const placeholders = tokens.map(() => '?').join(',');
  await pool.query(`DELETE FROM user_push_tokens WHERE token IN (${placeholders})`, tokens);
}

export async function sendPushToTokens(tokens, { title, body, data = {} }) {
  const unique = [...new Set(tokens.filter(Boolean))];
  if (!unique.length) {
    return { sent: 0, failed: 0, skipped: true, reason: 'no_tokens' };
  }

  const messaging = await getMessaging();
  if (!messaging) {
    return { sent: 0, failed: unique.length, skipped: true, reason: 'firebase_not_configured' };
  }

  let sent = 0;
  let failed = 0;
  const invalid = [];
  const batchSize = 500;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const response = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: {
        title: String(title || 'RunBonus').slice(0, 255),
        body: String(body || '').slice(0, 1024),
      },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [String(k), String(v ?? '')])
      ),
      android: {
        priority: 'high',
        notification: {
          channelId: 'runbonus_default',
          sound: 'default',
        },
      },
    });

    response.responses.forEach((res, idx) => {
      if (res.success) {
        sent += 1;
      } else {
        failed += 1;
        const code = res.error?.code || '';
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          invalid.push(batch[idx]);
        }
      }
    });
  }

  if (invalid.length) await pruneInvalidTokens(invalid);

  return { sent, failed, skipped: false };
}

/** Push одному пользователю по user_id. */
export async function sendPushToUser(userId, { title, body, data = {} }) {
  const tokens = await getUserPushTokens(userId);
  return sendPushToTokens(tokens, { title, body, data });
}

/** Push пользователю при смене статуса заказа. */
export async function sendOrderStatusPush({ userId, orderId, title, body, status }) {
  if (!userId || !orderId) {
    return { sent: 0, failed: 0, skipped: true, reason: 'no_user' };
  }

  const tokens = await getUserPushTokens(userId);
  const pushTitle = title || 'Статус заказа';
  const pushBody = body || 'Статус вашего заказа обновлён';

  const result = await sendPushToTokens(tokens, {
    title: pushTitle,
    body: pushBody,
    data: {
      type: 'order_status',
      order_id: String(orderId),
      status: String(status || ''),
    },
  });

  try {
    await pool.query(
      `INSERT INTO push_notification_log (campaign_id, title, body, sent_count, failed_count)
       VALUES (NULL, ?, ?, ?, ?)`,
      [pushTitle, pushBody, result.sent, result.failed]
    );
  } catch {
    /* optional */
  }

  return { ...result, recipients: tokens.length };
}

export async function sendCampaignPush(campaign) {
  if (!campaign || campaign.ad_type !== 'push') {
    throw Object.assign(new Error('Кампания не является push-уведомлением'), { status: 400 });
  }

  const tokens = await resolveTokensForAudience({
    cities: campaign.audience_cities,
    levels: campaign.audience_levels,
  });

  const title = campaign.title?.trim() || 'RunBonus';
  const body = campaign.description?.trim() || '';
  const result = await sendPushToTokens(tokens, {
    title,
    body,
    data: {
      campaign_id: String(campaign.id),
      url: campaign.target_url || '',
      type: 'ad_campaign',
    },
  });

  try {
    await pool.query(
      `INSERT INTO push_notification_log (campaign_id, title, body, sent_count, failed_count)
       VALUES (?, ?, ?, ?, ?)`,
      [campaign.id, title, body, result.sent, result.failed]
    );
    if (campaign.id) {
      await pool.query(
        `INSERT INTO ad_statistics (campaign_id, user_id, event_type) VALUES (?, NULL, 'open')`,
        [campaign.id]
      ).catch(() => {});
    }
  } catch {
    /* log table optional */
  }

  return {
    ...result,
    recipients: tokens.length,
    title,
    body,
  };
}

export function isPushConfigured() {
  const { firebase } = config;
  return Boolean(firebase.serviceAccount || firebase.serviceAccountPath);
}
