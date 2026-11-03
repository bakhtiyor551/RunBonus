import { nanoid } from 'nanoid';
import { pool } from '../db.js';
import { sendTelegramMessage } from './telegramService.js';

export const REWARD_STATUSES = [
  'LOCKED',
  'AVAILABLE',
  'CHOOSING',
  'SELECTED',
  'PROCESSING',
  'READY',
  'DELIVERED',
  'CANCELLED',
];

function roundKm(n) {
  return Math.round(Number(n || 0) * 1000) / 1000;
}

/** Confirmed distance = sum of approved workouts (source of truth). */
export async function getConfirmedDistanceKm(userId, conn = pool) {
  const [[row]] = await conn.query(
    `SELECT COALESCE(SUM(distance_km), 0) AS total
     FROM workouts
     WHERE user_id = ? AND status = 'approved'`,
    [userId]
  );
  return roundKm(row?.total);
}

export async function syncUserTotalDistance(userId, conn = pool) {
  const total = await getConfirmedDistanceKm(userId, conn);
  await conn.query(`UPDATE users SET total_distance_km = ? WHERE id = ?`, [total, userId]);
  return total;
}

/**
 * After approved workout: unlock milestones that user reached.
 * Creates user_rewards rows with status AVAILABLE (unique user+milestone).
 */
export async function unlockMilestonesForUser(userId, conn = pool) {
  const total = await syncUserTotalDistance(userId, conn);
  const [milestones] = await conn.query(
    `SELECT id, name, distance_km
     FROM reward_milestones
     WHERE status = 'active' AND distance_km <= ?
     ORDER BY distance_km ASC`,
    [total]
  );

  const unlocked = [];
  for (const m of milestones) {
    const [result] = await conn.query(
      `INSERT IGNORE INTO user_rewards (user_id, milestone_id, status)
       VALUES (?, ?, 'AVAILABLE')`,
      [userId, m.id]
    );
    if (result.affectedRows > 0) {
      unlocked.push(m);
    }
  }
  return { totalDistance: total, unlocked };
}

export async function getUserProgress(userId) {
  const totalDistance = await syncUserTotalDistance(userId);
  const [milestones] = await pool.query(
    `SELECT id, name, distance_km, description, sort_order
     FROM reward_milestones
     WHERE status = 'active'
     ORDER BY distance_km ASC, sort_order ASC`
  );
  const [userRewards] = await pool.query(
    `SELECT ur.*, r.name AS reward_name, r.type AS reward_type, r.image AS reward_image,
            rd.size AS delivery_size, rd.color AS delivery_color, rd.delivery_status,
            rpc.code AS promo_code_value, rpc.status AS promo_status, rpc.expires_at AS promo_expires_at,
            rpc.discount_percent
     FROM user_rewards ur
     LEFT JOIN rewards r ON r.id = ur.reward_id
     LEFT JOIN reward_delivery rd ON rd.user_reward_id = ur.id
     LEFT JOIN reward_promo_codes rpc ON rpc.user_reward_id = ur.id
     WHERE ur.user_id = ?`,
    [userId]
  );
  const byMilestone = new Map(userRewards.map((ur) => [ur.milestone_id, ur]));

  let nextMilestone = null;
  let remainingDistance = null;
  const list = milestones.map((m) => {
    const dist = Number(m.distance_km);
    const ur = byMilestone.get(m.id);
    let status = 'LOCKED';
    let reward = null;
    if (ur) {
      status = ur.status;
      if (ur.reward_id) {
        reward = {
          id: ur.reward_id,
          name: ur.reward_name,
          type: ur.reward_type,
          image: ur.reward_image,
          size: ur.delivery_size || null,
          color: ur.delivery_color || null,
          promoCode: ur.promo_code_value || ur.promo_code || null,
          promoStatus: ur.promo_status || null,
          discountPercent: ur.discount_percent != null ? Number(ur.discount_percent) : null,
          expiresAt: ur.promo_expires_at || null,
        };
      }
    } else if (totalDistance >= dist) {
      status = 'AVAILABLE';
    }

    if (!nextMilestone && status === 'LOCKED') {
      nextMilestone = {
        id: m.id,
        distance: dist,
        name: m.name,
        description: m.description,
      };
      remainingDistance = roundKm(Math.max(0, dist - totalDistance));
    }

    return {
      id: m.id,
      name: m.name,
      distance: dist,
      description: m.description,
      status,
      reward,
      remainingKm:
        status === 'LOCKED' ? roundKm(Math.max(0, dist - totalDistance)) : 0,
      selectedAt: ur?.selected_at || null,
      deliveredAt: ur?.delivered_at || null,
    };
  });

  if (!nextMilestone && list.length) {
    const last = list[list.length - 1];
    if (last.status !== 'LOCKED') {
      nextMilestone = null;
      remainingDistance = 0;
    }
  }

  const earnedCount = list.filter((m) =>
    ['SELECTED', 'PROCESSING', 'READY', 'DELIVERED'].includes(m.status)
  ).length;

  return {
    totalDistance,
    nextMilestone,
    remainingDistance,
    earnedCount,
    milestones: list,
  };
}

async function getAvailableQty(conn, reward, size = '', color = '') {
  if (reward.type === 'DISCOUNT') return Infinity;
  if (reward.requires_size) {
    const [[row]] = await conn.query(
      `SELECT quantity, reserved FROM reward_stock
       WHERE reward_id = ? AND size = ? AND color = ''
       FOR UPDATE`,
      [reward.id, size || '']
    );
    if (!row) return 0;
    return Math.max(0, Number(row.quantity) - Number(row.reserved));
  }
  if (color) {
    const [[row]] = await conn.query(
      `SELECT quantity, reserved FROM reward_stock
       WHERE reward_id = ? AND size = '' AND color = ?
       FOR UPDATE`,
      [reward.id, color]
    );
    if (row) return Math.max(0, Number(row.quantity) - Number(row.reserved));
  }
  const [[row]] = await conn.query(
    `SELECT stock, reserved FROM rewards WHERE id = ? FOR UPDATE`,
    [reward.id]
  );
  return Math.max(0, Number(row?.stock || 0) - Number(row?.reserved || 0));
}

async function reserveStock(conn, reward, size = '', color = '') {
  if (reward.type === 'DISCOUNT') return;
  if (reward.requires_size) {
    const [res] = await conn.query(
      `UPDATE reward_stock
       SET reserved = reserved + 1
       WHERE reward_id = ? AND size = ? AND color = ''
         AND quantity > reserved`,
      [reward.id, size || '']
    );
    if (res.affectedRows === 0) {
      const err = new Error('Нет в наличии');
      err.code = 'OUT_OF_STOCK';
      throw err;
    }
    return;
  }
  if (color) {
    const [res] = await conn.query(
      `UPDATE reward_stock
       SET reserved = reserved + 1
       WHERE reward_id = ? AND size = '' AND color = ?
         AND quantity > reserved`,
      [reward.id, color]
    );
    if (res.affectedRows > 0) return;
  }
  const [res] = await conn.query(
    `UPDATE rewards SET reserved = reserved + 1
     WHERE id = ? AND stock > reserved`,
    [reward.id]
  );
  if (res.affectedRows === 0) {
    const err = new Error('Нет в наличии');
    err.code = 'OUT_OF_STOCK';
    throw err;
  }
}

function makePromoCode(prefix = 'RUN') {
  return `${prefix}-${nanoid(6).toUpperCase()}`;
}

export async function getMilestoneRewardOptions(userId, milestoneIdOrDistance) {
  const progress = await getUserProgress(userId);
  const milestone = progress.milestones.find(
    (m) =>
      m.id === Number(milestoneIdOrDistance) ||
      m.distance === Number(milestoneIdOrDistance)
  );
  if (!milestone) {
    const err = new Error('Контрольная точка не найдена');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const [rows] = await pool.query(
    `SELECT r.*, mr.sort_order AS link_sort
     FROM milestone_rewards mr
     JOIN rewards r ON r.id = mr.reward_id
     WHERE mr.milestone_id = ? AND mr.active = 1 AND r.active = 1
     ORDER BY mr.sort_order ASC, r.id ASC`,
    [milestone.id]
  );

  const options = [];
  for (const r of rows) {
    let inStock = true;
    let stockLeft = null;
    let sizes = null;
    if (r.type === 'DISCOUNT') {
      inStock = true;
    } else if (r.requires_size) {
      const [stockRows] = await pool.query(
        `SELECT size, quantity, reserved FROM reward_stock WHERE reward_id = ?`,
        [r.id]
      );
      sizes = (Array.isArray(r.size_options) ? r.size_options : JSON.parse(r.size_options || '[]')).map(
        (sz) => {
          const row = stockRows.find((s) => s.size === sz);
          const left = row ? Math.max(0, Number(row.quantity) - Number(row.reserved)) : 0;
          return { size: sz, available: left, inStock: left > 0 };
        }
      );
      inStock = sizes.some((s) => s.inStock);
      stockLeft = sizes.reduce((a, s) => a + s.available, 0);
    } else {
      stockLeft = Math.max(0, Number(r.stock) - Number(r.reserved));
      inStock = stockLeft > 0;
    }

    options.push({
      id: r.id,
      name: r.name,
      type: r.type,
      description: r.description,
      image: r.image,
      requiresSize: !!r.requires_size,
      discountPercent: r.discount_percent != null ? Number(r.discount_percent) : null,
      inStock,
      stockLeft: r.type === 'DISCOUNT' ? null : stockLeft,
      sizes,
      colors: (() => {
        try {
          const raw = r.color_options;
          if (!raw) return null;
          const arr = Array.isArray(raw) ? raw : JSON.parse(raw);
          return Array.isArray(arr) && arr.length ? arr : null;
        } catch {
          return null;
        }
      })(),
      hasColors: (() => {
        try {
          const raw = r.color_options;
          if (!raw) return false;
          const arr = Array.isArray(raw) ? raw : JSON.parse(raw);
          return Array.isArray(arr) && arr.length > 0;
        } catch {
          return false;
        }
      })(),
      unavailableReason: inStock ? null : 'Временно нет в наличии',
    });
  }

  return {
    milestone: {
      id: milestone.id,
      distance: milestone.distance,
      name: milestone.name,
      status: milestone.status,
    },
    canSelect: milestone.status === 'AVAILABLE' || milestone.status === 'CHOOSING',
    selected: milestone.reward,
    options,
  };
}

export async function selectReward(userId, { milestoneId, rewardId, size, color, phone, address, city }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[user]] = await conn.query(
      `SELECT id, name, phone, status FROM users WHERE id = ? FOR UPDATE`,
      [userId]
    );
    if (!user) {
      const err = new Error('Пользователь не найден');
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (user.status === 'blocked') {
      const err = new Error('Аккаунт заблокирован');
      err.code = 'BLOCKED';
      throw err;
    }

    const [[activeShoe]] = await conn.query(
      `SELECT shoe_id AS id FROM user_active_shoes WHERE user_id = ? LIMIT 1`,
      [userId]
    );
    if (!activeShoe) {
      const err = new Error('Сначала активируйте кроссовки RunBonus');
      err.code = 'NO_SHOE';
      throw err;
    }

    const total = await getConfirmedDistanceKm(userId, conn);
    const [[milestone]] = await conn.query(
      `SELECT * FROM reward_milestones WHERE id = ? AND status = 'active' FOR UPDATE`,
      [milestoneId]
    );
    if (!milestone) {
      const err = new Error('Контрольная точка не найдена');
      err.code = 'NOT_FOUND';
      throw err;
    }

    // Existing unlock (e.g. admin gift) bypasses distance check
    let [[ur]] = await conn.query(
      `SELECT * FROM user_rewards WHERE user_id = ? AND milestone_id = ? FOR UPDATE`,
      [userId, milestoneId]
    );

    if (!ur) {
      if (total < Number(milestone.distance_km)) {
        const err = new Error('Километраж ещё не достигнут');
        err.code = 'LOCKED';
        throw err;
      }
      await conn.query(
        `INSERT INTO user_rewards (user_id, milestone_id, status)
         VALUES (?, ?, 'AVAILABLE')`,
        [userId, milestoneId]
      );
      [[ur]] = await conn.query(
        `SELECT * FROM user_rewards WHERE user_id = ? AND milestone_id = ? FOR UPDATE`,
        [userId, milestoneId]
      );
    }

    if (!ur) {
      const err = new Error('Достижение не найдено');
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (!['AVAILABLE', 'CHOOSING'].includes(ur.status)) {
      const err = new Error('Награда уже выбрана. Изменение только через администратора.');
      err.code = 'ALREADY_SELECTED';
      throw err;
    }

    const [[link]] = await conn.query(
      `SELECT id FROM milestone_rewards
       WHERE milestone_id = ? AND reward_id = ? AND active = 1`,
      [milestoneId, rewardId]
    );
    if (!link) {
      const err = new Error('Эта награда недоступна для данной контрольной точки');
      err.code = 'INVALID_REWARD';
      throw err;
    }

    const [[reward]] = await conn.query(
      `SELECT * FROM rewards WHERE id = ? AND active = 1 FOR UPDATE`,
      [rewardId]
    );
    if (!reward) {
      const err = new Error('Награда не найдена');
      err.code = 'NOT_FOUND';
      throw err;
    }

    const needSize = !!reward.requires_size;
    const chosenSize = needSize ? String(size || '').toUpperCase() : size || null;
    if (needSize) {
      const allowed = Array.isArray(reward.size_options)
        ? reward.size_options
        : JSON.parse(reward.size_options || '[]');
      if (!chosenSize || !allowed.map((s) => String(s).toUpperCase()).includes(chosenSize)) {
        const err = new Error('Выберите размер');
        err.code = 'SIZE_REQUIRED';
        throw err;
      }
    }

    const qty = await getAvailableQty(conn, reward, chosenSize || '', color || '');
    if (qty <= 0) {
      const err = new Error('Нет в наличии');
      err.code = 'OUT_OF_STOCK';
      throw err;
    }

    await reserveStock(conn, reward, chosenSize || '', color || '');

    let status = 'SELECTED';
    let promoCode = null;
    let promoExpires = null;

    if (reward.type === 'DISCOUNT') {
      status = 'DELIVERED';
      const days = Number(reward.discount_valid_days) || 30;
      promoExpires = new Date(Date.now() + days * 86400000);
      promoCode = makePromoCode(`RUN${Number(milestone.distance_km)}`);
      await conn.query(
        `UPDATE user_rewards
         SET reward_id = ?, status = ?, selected_at = NOW(), delivered_at = NOW(), promo_code = ?
         WHERE id = ?`,
        [rewardId, status, promoCode, ur.id]
      );
      await conn.query(
        `INSERT INTO reward_promo_codes
          (user_reward_id, user_id, reward_id, milestone_id, code, discount_percent,
           min_amount, max_amount, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
        [
          ur.id,
          userId,
          rewardId,
          milestoneId,
          promoCode,
          reward.discount_percent,
          reward.discount_min_amount || 0,
          reward.discount_max_amount,
          promoExpires,
        ]
      );
    } else {
      status = 'PROCESSING';
      await conn.query(
        `UPDATE user_rewards
         SET reward_id = ?, status = ?, selected_at = NOW(), processed_at = NOW()
         WHERE id = ?`,
        [rewardId, status, ur.id]
      );
      await conn.query(
        `INSERT INTO reward_delivery
          (user_reward_id, user_id, reward_id, size, color, phone, address, city, delivery_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')
         ON DUPLICATE KEY UPDATE
           size = VALUES(size), color = VALUES(color), phone = VALUES(phone),
           address = VALUES(address), city = VALUES(city), delivery_status = 'new'`,
        [
          ur.id,
          userId,
          rewardId,
          chosenSize,
          color || null,
          phone || user.phone,
          address || null,
          city || null,
        ]
      );
    }

    await conn.commit();

    // Telegram (outside tx)
    if (reward.type !== 'DISCOUNT') {
      const sizeLine = chosenSize ? `\n👕 Размер: <b>${chosenSize}</b>` : '';
      const colorLine = color ? `\n🎨 Цвет: <b>${color}</b>` : '';
      const text =
        `🎁 <b>НОВАЯ НАГРАДА</b>\n\n` +
        `Пользователь:\n${user.name || '—'}\n\n` +
        `Телефон:\n${user.phone || '—'}\n\n` +
        `Достижение:\n${milestone.name} (${milestone.distance_km} км)\n\n` +
        `Награда:\n${reward.name}${sizeLine}${colorLine}\n\n` +
        `Статус:\nНовая заявка\n` +
        `ID: #${ur.id}`;
      sendTelegramMessage(text).catch(() => {});
    }

    try {
      const { sendPushToUser } = await import('./pushNotificationService.js');
      sendPushToUser(userId, {
        title: '🎁 Награда выбрана',
        body: 'Ваша награда принята и отправлена на обработку.',
        data: {
          type: 'reward_selected',
          milestone_id: String(milestoneId),
          path: '/my-rewards',
        },
      }).catch(() => {});
    } catch {
      /* optional */
    }

    return getMilestoneRewardOptions(userId, milestoneId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function notifyUserRewardUnlocked(userId, unlocked) {
  if (!unlocked?.length) return;
  const { sendPushToUser } = await import('./pushNotificationService.js');
  for (const m of unlocked) {
    const km = Number(m.distance_km);
    const title = '🎉 Новая награда!';
    const body = `Вы достигли ${km} км. Вам доступна новая награда!`;
    sendPushToUser(userId, {
      title,
      body,
      data: {
        type: 'reward_unlocked',
        milestone_id: String(m.id),
        distance: String(km),
        path: `/rewards?milestone=${m.id}`,
      },
    }).catch(() => {});
  }
  console.log(
    `[rewards] user=${userId} unlocked:`,
    unlocked.map((m) => `${m.distance_km}km`).join(', ')
  );
}

/**
 * Admin: gift a milestone unlock and optionally a concrete reward (no km check).
 * @param {{ userId: number, milestoneId: number, rewardId?: number|null, size?: string, color?: string, comment?: string }}
 */
export async function adminGiftReward({
  userId,
  milestoneId,
  rewardId = null,
  size = null,
  color = null,
  comment = null,
}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[user]] = await conn.query(
      `SELECT id, name, phone, status FROM users WHERE id = ? FOR UPDATE`,
      [userId]
    );
    if (!user) {
      const err = new Error('Пользователь не найден');
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (user.status === 'blocked') {
      const err = new Error('Аккаунт заблокирован');
      err.code = 'BLOCKED';
      throw err;
    }

    const [[milestone]] = await conn.query(
      `SELECT * FROM reward_milestones WHERE id = ? FOR UPDATE`,
      [milestoneId]
    );
    if (!milestone) {
      const err = new Error('Контрольная точка не найдена');
      err.code = 'NOT_FOUND';
      throw err;
    }

    await conn.query(
      `INSERT INTO user_rewards (user_id, milestone_id, status, admin_comment)
       VALUES (?, ?, 'AVAILABLE', ?)
       ON DUPLICATE KEY UPDATE
         admin_comment = COALESCE(VALUES(admin_comment), admin_comment)`,
      [userId, milestoneId, comment || 'Подарок от администратора']
    );

    const [[ur]] = await conn.query(
      `SELECT * FROM user_rewards WHERE user_id = ? AND milestone_id = ? FOR UPDATE`,
      [userId, milestoneId]
    );
    if (!ur) {
      const err = new Error('Не удалось создать награду');
      err.code = 'CREATE_FAILED';
      throw err;
    }

    if (['SELECTED', 'PROCESSING', 'READY', 'DELIVERED'].includes(ur.status) && ur.reward_id) {
      const err = new Error(
        'У пользователя уже есть выбранная/выданная награда по этой точке. Сначала отмените её.'
      );
      err.code = 'ALREADY_SELECTED';
      throw err;
    }

    let resultStatus = 'AVAILABLE';
    let promoCode = null;
    let reward = null;

    if (!rewardId) {
      await conn.query(
        `UPDATE user_rewards
         SET status = 'AVAILABLE', reward_id = NULL, admin_comment = COALESCE(?, admin_comment)
         WHERE id = ?`,
        [comment || 'Подарок от администратора', ur.id]
      );
    } else {
      const [[rewardRow]] = await conn.query(
        `SELECT * FROM rewards WHERE id = ? AND active = 1 FOR UPDATE`,
        [rewardId]
      );
      if (!rewardRow) {
        const err = new Error('Награда не найдена или неактивна');
        err.code = 'NOT_FOUND';
        throw err;
      }
      reward = rewardRow;

      const needSize = !!reward.requires_size;
      const chosenSize = needSize ? String(size || '').toUpperCase() : size || null;
      if (needSize && !chosenSize) {
        const err = new Error('Укажите размер');
        err.code = 'SIZE_REQUIRED';
        throw err;
      }

      await reserveStock(conn, reward, chosenSize || '', color || '');

      if (reward.type === 'DISCOUNT') {
        resultStatus = 'DELIVERED';
        const days = Number(reward.discount_valid_days) || 30;
        const promoExpires = new Date(Date.now() + days * 86400000);
        promoCode = makePromoCode(`GIFT${Number(milestone.distance_km)}`);
        await conn.query(
          `UPDATE user_rewards
           SET reward_id = ?, status = ?, selected_at = NOW(), delivered_at = NOW(),
               promo_code = ?, admin_comment = ?, processed_at = NOW()
           WHERE id = ?`,
          [rewardId, resultStatus, promoCode, comment || 'Подарок от администратора', ur.id]
        );
        await conn.query(
          `INSERT INTO reward_promo_codes
            (user_reward_id, user_id, reward_id, milestone_id, code, discount_percent,
             min_amount, max_amount, status, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
          [
            ur.id,
            userId,
            rewardId,
            milestoneId,
            promoCode,
            reward.discount_percent,
            reward.discount_min_amount || 0,
            reward.discount_max_amount,
            promoExpires,
          ]
        );
      } else {
        resultStatus = 'PROCESSING';
        await conn.query(
          `UPDATE user_rewards
           SET reward_id = ?, status = ?, selected_at = NOW(), processed_at = NOW(),
               admin_comment = ?
           WHERE id = ?`,
          [rewardId, resultStatus, comment || 'Подарок от администратора', ur.id]
        );
        await conn.query(
          `INSERT INTO reward_delivery
            (user_reward_id, user_id, reward_id, size, color, phone, delivery_status, admin_comment)
           VALUES (?, ?, ?, ?, ?, ?, 'processing', ?)
           ON DUPLICATE KEY UPDATE
             reward_id = VALUES(reward_id), size = VALUES(size), color = VALUES(color),
             delivery_status = 'processing', admin_comment = VALUES(admin_comment)`,
          [
            ur.id,
            userId,
            rewardId,
            chosenSize,
            color || null,
            user.phone,
            comment || 'Подарок от администратора',
          ]
        );
      }
    }

    await conn.commit();

    try {
      const { sendPushToUser } = await import('./pushNotificationService.js');
      if (!rewardId) {
        sendPushToUser(userId, {
          title: '🎁 Новая награда!',
          body: `Вам открыта награда «${milestone.name}». Выберите подарок.`,
          data: {
            type: 'reward_gifted',
            milestone_id: String(milestoneId),
            path: `/rewards?milestone=${milestoneId}`,
          },
        }).catch(() => {});
      } else if (reward?.type === 'DISCOUNT') {
        sendPushToUser(userId, {
          title: '🎁 Подарок от RunBonus!',
          body: `Вам подарили «${reward.name}». Промокод в разделе «Мои награды».`,
          data: {
            type: 'reward_gifted',
            milestone_id: String(milestoneId),
            path: '/my-rewards',
          },
        }).catch(() => {});
      } else {
        sendPushToUser(userId, {
          title: '🎁 Подарок от RunBonus!',
          body: `Вам подарили «${reward.name}».`,
          data: {
            type: 'reward_gifted',
            milestone_id: String(milestoneId),
            path: '/my-rewards',
          },
        }).catch(() => {});
      }
    } catch {
      /* optional */
    }

    if (reward && reward.type !== 'DISCOUNT') {
      const text =
        `🎁 <b>ПОДАРОК ОТ АДМИНА</b>\n\n` +
        `Пользователь:\n${user.name || '—'}\n\n` +
        `Телефон:\n${user.phone || '—'}\n\n` +
        `Точка:\n${milestone.name} (${milestone.distance_km} км)\n\n` +
        `Награда:\n${reward.name}\n\n` +
        `Статус:\n${resultStatus}\n` +
        `ID: #${ur.id}`;
      sendTelegramMessage(text).catch(() => {});
    }

    return {
      userRewardId: ur.id,
      userId,
      userName: user.name,
      phone: user.phone,
      milestoneId,
      milestoneName: milestone.name,
      status: resultStatus,
      rewardId: rewardId || null,
      rewardName: reward?.name || null,
      promoCode,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function getMyRewards(userId) {
  const progress = await getUserProgress(userId);
  return progress.milestones
    .filter((m) => m.status && m.status !== 'LOCKED')
    .map((m) => ({
      id: m.id,
      milestone_id: m.id,
      name: m.name,
      distance: m.distance,
      status: m.status,
      reward: m.reward,
      promoCode: m.reward?.promoCode || null,
      selectedAt: m.selectedAt,
      deliveredAt: m.deliveredAt,
    }));
}

export async function listActiveMilestones() {
  const [rows] = await pool.query(
    `SELECT id, name, distance_km, description, sort_order
     FROM reward_milestones
     WHERE status = 'active'
     ORDER BY distance_km ASC, sort_order ASC`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    distance: Number(r.distance_km),
    description: r.description,
  }));
}
