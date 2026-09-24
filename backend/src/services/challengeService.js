import { nanoid } from 'nanoid';
import { pool } from '../db.js';
import { sendTelegramMessage } from './telegramService.js';

function roundKm(n) {
  return Math.round(Number(n || 0) * 1000) / 1000;
}

function httpError(message, status = 400, code = 'BAD_REQUEST') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function formatRemaining(ms) {
  if (ms <= 0) {
    return { totalMs: 0, days: 0, hours: 0, minutes: 0, label: '0', expired: true };
  }
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`);
  if (hours > 0 || days > 0) parts.push(`${hours} ${hours === 1 ? 'час' : hours < 5 ? 'часа' : 'часов'}`);
  if (days === 0) parts.push(`${minutes} мин`);
  return {
    totalMs: ms,
    days,
    hours,
    minutes,
    label: parts.join(' '),
    expired: false,
  };
}

export async function listActiveLevels(conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, level_num, name, target_km, deadline_days, description, example_reward, sort_order, status
     FROM challenge_levels
     WHERE status = 'active'
     ORDER BY sort_order ASC, level_num ASC`
  );
  return rows;
}

async function getLevelRewards(levelId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT r.id, r.name, r.type, r.description, r.image, r.requires_size, r.size_options, r.color_options,
            r.discount_percent, r.stock, r.reserved, clr.sort_order
     FROM challenge_level_rewards clr
     JOIN rewards r ON r.id = clr.reward_id
     WHERE clr.level_id = ? AND clr.active = 1 AND r.active = 1
     ORDER BY clr.sort_order ASC, r.id ASC`,
    [levelId]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    description: r.description,
    image: r.image,
    requiresSize: !!r.requires_size,
    discountPercent: r.discount_percent != null ? Number(r.discount_percent) : null,
    example: null,
  }));
}

/** Km from approved workouts finished at/after startAt (backend source of truth). */
export async function getChallengeDistanceKm(userId, startAt, conn = pool) {
  const [[row]] = await conn.query(
    `SELECT COALESCE(SUM(distance_km), 0) AS total
     FROM workouts
     WHERE user_id = ?
       AND status = 'approved'
       AND finished_at IS NOT NULL
       AND finished_at >= ?`,
    [userId, startAt]
  );
  return roundKm(row?.total);
}

async function expireIfNeeded(challenge, conn = pool) {
  if (!challenge || challenge.status !== 'ACTIVE') return challenge;
  const now = Date.now();
  const expiresAt = new Date(challenge.expires_at).getTime();
  if (now < expiresAt) return challenge;

  const currentKm = await getChallengeDistanceKm(challenge.user_id, challenge.start_at, conn);
  if (currentKm >= Number(challenge.target_km)) {
    await conn.query(
      `UPDATE user_challenges
       SET status = 'COMPLETED', current_km = ?, completed_at = COALESCE(completed_at, NOW())
       WHERE id = ? AND status = 'ACTIVE'`,
      [currentKm, challenge.id]
    );
    return { ...challenge, status: 'COMPLETED', current_km: currentKm, completed_at: new Date() };
  }

  await conn.query(
    `UPDATE user_challenges
     SET status = 'EXPIRED', current_km = ?, expired_at = NOW()
     WHERE id = ? AND status = 'ACTIVE'`,
    [currentKm, challenge.id]
  );
  return { ...challenge, status: 'EXPIRED', current_km: currentKm, expired_at: new Date() };
}

async function refreshActiveProgress(challenge, conn = pool) {
  if (!challenge || challenge.status !== 'ACTIVE') return challenge;
  const currentKm = await getChallengeDistanceKm(challenge.user_id, challenge.start_at, conn);
  const target = Number(challenge.target_km);
  if (currentKm >= target) {
    await conn.query(
      `UPDATE user_challenges
       SET status = 'COMPLETED', current_km = ?, completed_at = NOW()
       WHERE id = ? AND status = 'ACTIVE'`,
      [Math.min(currentKm, target) === currentKm ? currentKm : currentKm, challenge.id]
    );
    return {
      ...challenge,
      status: 'COMPLETED',
      current_km: currentKm,
      completed_at: new Date(),
    };
  }
  if (Number(challenge.current_km) !== currentKm) {
    await conn.query(`UPDATE user_challenges SET current_km = ? WHERE id = ?`, [
      currentKm,
      challenge.id,
    ]);
  }
  return { ...challenge, current_km: currentKm };
}

function mapChallengeRow(row, serverNow, rewards = []) {
  if (!row) return null;
  const targetKm = Number(row.target_km);
  const currentKm = roundKm(row.current_km);
  const expiresAt = row.expires_at ? new Date(row.expires_at).toISOString() : null;
  const startAt = row.start_at ? new Date(row.start_at).toISOString() : null;
  const remainingMs =
    row.status === 'ACTIVE' && expiresAt ? Math.max(0, new Date(expiresAt).getTime() - serverNow) : 0;
  const progressPercent = targetKm > 0 ? Math.min(100, Math.round((currentKm / targetKm) * 100)) : 0;
  const claimed = Boolean(row.reward_claimed_at);

  return {
    id: row.id,
    challengeId: row.id,
    userId: row.user_id,
    levelId: row.level_id,
    levelNum: row.level_num,
    name: row.level_name || row.name,
    description: row.description,
    exampleReward: row.example_reward,
    status: row.status,
    targetKm,
    currentKm,
    startAt,
    expiresAt,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    expiredAt: row.expired_at ? new Date(row.expired_at).toISOString() : null,
    rewardId: row.reward_id,
    rewardClaimedAt: row.reward_claimed_at ? new Date(row.reward_claimed_at).toISOString() : null,
    rewardClaimed: claimed,
    attempt: row.attempt,
    deadlineDays: row.deadline_days,
    progressPercent,
    remainingKm: Math.max(0, roundKm(targetKm - currentKm)),
    remaining: formatRemaining(remainingMs),
    serverTime: new Date(serverNow).toISOString(),
    rewards,
    rewardName: row.reward_name || null,
  };
}

async function loadChallengeById(id, conn = pool) {
  const [rows] = await conn.query(
    `SELECT uc.*, cl.level_num, cl.name AS level_name, cl.description, cl.example_reward, cl.deadline_days,
            r.name AS reward_name
     FROM user_challenges uc
     JOIN challenge_levels cl ON cl.id = uc.level_id
     LEFT JOIN rewards r ON r.id = uc.reward_id
     WHERE uc.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function findOpenChallenge(userId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT uc.*, cl.level_num, cl.name AS level_name, cl.description, cl.example_reward, cl.deadline_days,
            r.name AS reward_name
     FROM user_challenges uc
     JOIN challenge_levels cl ON cl.id = uc.level_id
     LEFT JOIN rewards r ON r.id = uc.reward_id
     WHERE uc.user_id = ?
       AND (
         uc.status IN ('ACTIVE', 'EXPIRED')
         OR (uc.status = 'COMPLETED' AND uc.reward_claimed_at IS NULL)
       )
     ORDER BY
       CASE uc.status
         WHEN 'ACTIVE' THEN 0
         WHEN 'COMPLETED' THEN 1
         WHEN 'EXPIRED' THEN 2
         ELSE 3
       END,
       uc.id DESC
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function highestCompletedClaimedLevelNum(userId, conn = pool) {
  const [[row]] = await conn.query(
    `SELECT MAX(cl.level_num) AS max_level
     FROM user_challenges uc
     JOIN challenge_levels cl ON cl.id = uc.level_id
     WHERE uc.user_id = ?
       AND uc.status = 'COMPLETED'
       AND uc.reward_claimed_at IS NOT NULL`,
    [userId]
  );
  return Number(row?.max_level || 0);
}

async function nextStartableLevel(userId, conn = pool) {
  const levels = await listActiveLevels(conn);
  if (!levels.length) return null;

  const open = await findOpenChallenge(userId, conn);
  if (open) return null;

  const maxDone = await highestCompletedClaimedLevelNum(userId, conn);
  const next = levels.find((l) => Number(l.level_num) === maxDone + 1) || null;
  if (next) return next;

  // If level 1 never started
  if (maxDone === 0) return levels[0];
  return null;
}

export async function getChallengeState(userId) {
  const serverNow = Date.now();
  let row = await findOpenChallenge(userId);
  if (row) {
    row = await expireIfNeeded(row);
    if (row.status === 'ACTIVE') {
      row = await refreshActiveProgress(row);
      // reload after possible status change
      row = await loadChallengeById(row.id);
    } else {
      row = await loadChallengeById(row.id);
    }
  }

  const levels = await listActiveLevels();
  const maxDone = await highestCompletedClaimedLevelNum(userId);
  const rewards = row ? await getLevelRewards(row.level_id) : [];
  const challenge = row ? mapChallengeRow(row, serverNow, rewards) : null;

  let nextLevel = null;
  if (!challenge) {
    const startable = await nextStartableLevel(userId);
    if (startable) {
      const levelRewards = await getLevelRewards(startable.id);
      nextLevel = {
        levelId: startable.id,
        levelNum: startable.level_num,
        name: startable.name,
        targetKm: Number(startable.target_km),
        deadlineDays: startable.deadline_days,
        description: startable.description,
        exampleReward: startable.example_reward,
        rewards: levelRewards,
        status: 'LOCKED',
        canStart: true,
      };
    }
  } else if (challenge.status === 'EXPIRED') {
    nextLevel = null;
  }

  const levelCards = levels.map((l) => {
    const num = Number(l.level_num);
    let status = 'LOCKED';
    if (challenge && Number(challenge.levelNum) === num) {
      status = challenge.status;
    } else if (num <= maxDone) {
      status = 'COMPLETED';
    } else if (!challenge && nextLevel && Number(nextLevel.levelNum) === num) {
      status = 'LOCKED'; // can start
    }
    return {
      levelId: l.id,
      levelNum: num,
      name: l.name,
      targetKm: Number(l.target_km),
      deadlineDays: l.deadline_days,
      description: l.description,
      exampleReward: l.example_reward,
      status,
      canStart:
        Boolean(nextLevel && Number(nextLevel.levelNum) === num) ||
        (challenge?.status === 'EXPIRED' && Number(challenge.levelNum) === num),
    };
  });

  return {
    serverTime: new Date(serverNow).toISOString(),
    challenge,
    nextLevel,
    levels: levelCards,
    completedLevels: maxDone,
    allDone: !challenge && !nextLevel && maxDone > 0 && maxDone >= levels.length,
  };
}

export async function startChallenge(userId, { levelId } = {}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[user]] = await conn.query(`SELECT id, status FROM users WHERE id = ? FOR UPDATE`, [
      userId,
    ]);
    if (!user) throw httpError('Пользователь не найден', 404, 'NOT_FOUND');
    if (user.status === 'blocked') throw httpError('Аккаунт заблокирован', 403, 'BLOCKED');

    let open = await findOpenChallenge(userId, conn);
    if (open) {
      open = await expireIfNeeded(open, conn);
      if (open.status === 'ACTIVE') {
        throw httpError('У вас уже есть активное задание', 409, 'ALREADY_ACTIVE');
      }
      if (open.status === 'COMPLETED' && !open.reward_claimed_at) {
        throw httpError('Сначала заберите награду за выполненное задание', 409, 'CLAIM_FIRST');
      }
    }

    let level;
    if (open?.status === 'EXPIRED' && (!levelId || Number(levelId) === Number(open.level_id))) {
      // Restart same level — progress resets
      const [levels] = await conn.query(
        `SELECT * FROM challenge_levels WHERE id = ? AND status = 'active'`,
        [open.level_id]
      );
      level = levels[0];
      if (!level) throw httpError('Уровень недоступен', 404, 'LEVEL_NOT_FOUND');

      const [[att]] = await conn.query(
        `SELECT COALESCE(MAX(attempt), 0) + 1 AS next_attempt
         FROM user_challenges WHERE user_id = ? AND level_id = ?`,
        [userId, level.id]
      );
      const attempt = Number(att.next_attempt || 1);
      const startAt = new Date();
      const expiresAt = new Date(startAt.getTime() + Number(level.deadline_days) * 86400000);

      const [ins] = await conn.query(
        `INSERT INTO user_challenges
          (user_id, level_id, status, target_km, current_km, start_at, expires_at, attempt)
         VALUES (?, ?, 'ACTIVE', ?, 0, ?, ?, ?)`,
        [userId, level.id, level.target_km, startAt, expiresAt, attempt]
      );
      await conn.commit();
      const state = await getChallengeState(userId);
      return { challengeId: ins.insertId, ...state };
    }

    if (open?.status === 'EXPIRED' && levelId && Number(levelId) !== Number(open.level_id)) {
      throw httpError('Сначала перезапустите текущее задание', 409, 'RESTART_CURRENT');
    }

    const startable = await nextStartableLevel(userId, conn);
    if (!startable) throw httpError('Нет доступного задания для старта', 409, 'NOTHING_TO_START');

    if (levelId && Number(levelId) !== Number(startable.id)) {
      throw httpError('Это задание ещё недоступно', 403, 'LOCKED');
    }
    level = startable;

    const [[att]] = await conn.query(
      `SELECT COALESCE(MAX(attempt), 0) + 1 AS next_attempt
       FROM user_challenges WHERE user_id = ? AND level_id = ?`,
      [userId, level.id]
    );
    const attempt = Number(att.next_attempt || 1);
    const startAt = new Date();
    const expiresAt = new Date(startAt.getTime() + Number(level.deadline_days) * 86400000);

    const [ins] = await conn.query(
      `INSERT INTO user_challenges
        (user_id, level_id, status, target_km, current_km, start_at, expires_at, attempt)
       VALUES (?, ?, 'ACTIVE', ?, 0, ?, ?, ?)`,
      [userId, level.id, level.target_km, startAt, expiresAt, attempt]
    );

    await conn.commit();
    const state = await getChallengeState(userId);
    return { challengeId: ins.insertId, ...state };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * При старте тренировки: если нет ACTIVE задания — автоматически запускаем
 * следующее доступное (или перезапуск EXPIRED). Не трогаем COMPLETED без claim.
 */
export async function ensureChallengeActiveForWorkout(userId) {
  try {
    let open = await findOpenChallenge(userId);
    if (open) {
      open = await expireIfNeeded(open);
      if (open.status === 'ACTIVE') {
        return { started: false, challengeId: open.id, reason: 'already_active' };
      }
      if (open.status === 'COMPLETED' && !open.reward_claimed_at) {
        return { started: false, challengeId: open.id, reason: 'awaiting_claim' };
      }
      if (open.status === 'EXPIRED') {
        const result = await startChallenge(userId, { levelId: open.level_id });
        return { started: true, challengeId: result.challengeId, reason: 'restart_expired' };
      }
    }

    const startable = await nextStartableLevel(userId);
    if (!startable) {
      return { started: false, challengeId: null, reason: 'nothing_to_start' };
    }

    const result = await startChallenge(userId, { levelId: startable.id });
    return { started: true, challengeId: result.challengeId, reason: 'auto_started' };
  } catch (err) {
    // Не блокируем тренировку из‑за задания
    console.warn('[challenge/auto-start]', err.message || err);
    return { started: false, challengeId: null, reason: 'error', error: err.message };
  }
}

/**
 * Called after approved workout. Adds km only if finished_at >= start_at (via SUM recalc).
 */
export async function applyWorkoutToActiveChallenge(userId, { distanceKm, finishedAt } = {}) {
  void distanceKm;
  void finishedAt;
  let row = await findOpenChallenge(userId);
  if (!row || row.status !== 'ACTIVE') return null;

  row = await expireIfNeeded(row);
  if (row.status !== 'ACTIVE') {
    return mapChallengeRow(await loadChallengeById(row.id), Date.now());
  }

  row = await refreshActiveProgress(row);
  const fresh = await loadChallengeById(row.id);
  return mapChallengeRow(fresh, Date.now(), await getLevelRewards(fresh.level_id));
}

export async function getChallengeRewardOptions(userId, challengeId) {
  const state = await getChallengeState(userId);
  const challenge = state.challenge;
  if (!challenge || Number(challenge.id) !== Number(challengeId)) {
    throw httpError('Задание не найдено', 404, 'NOT_FOUND');
  }
  if (challenge.status !== 'COMPLETED' || challenge.rewardClaimed) {
    throw httpError('Награда недоступна для получения', 409, 'NOT_CLAIMABLE');
  }

  const [rows] = await pool.query(
    `SELECT r.*, clr.sort_order AS link_sort
     FROM challenge_level_rewards clr
     JOIN rewards r ON r.id = clr.reward_id
     WHERE clr.level_id = ? AND clr.active = 1 AND r.active = 1
     ORDER BY clr.sort_order ASC, r.id ASC`,
    [challenge.levelId]
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
      const sizeOpts = (() => {
        try {
          return Array.isArray(r.size_options) ? r.size_options : JSON.parse(r.size_options || '[]');
        } catch {
          return [];
        }
      })();
      sizes = sizeOpts.map((sz) => {
        const stock = stockRows.find((s) => s.size === sz);
        const left = stock ? Math.max(0, Number(stock.quantity) - Number(stock.reserved)) : 0;
        return { size: sz, available: left, inStock: left > 0 };
      });
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
      hasColors: false,
      unavailableReason: inStock ? null : 'Временно нет в наличии',
    });
    options[options.length - 1].hasColors = Boolean(options[options.length - 1].colors?.length);
  }

  // Fallback: if no linked rewards, allow claiming with placeholder name from example
  return {
    challenge,
    canSelect: true,
    options,
    exampleReward: challenge.exampleReward,
  };
}

async function reserveRewardStock(conn, reward, size, color) {
  if (reward.type === 'DISCOUNT') return;
  if (reward.requires_size && size) {
    const [res] = await conn.query(
      `UPDATE reward_stock
       SET reserved = reserved + 1
       WHERE reward_id = ? AND size = ? AND (color = ? OR ? = '')
         AND quantity > reserved`,
      [reward.id, size, color || '', color || '']
    );
    if (res.affectedRows === 0) {
      throw httpError('Нет в наличии выбранного размера', 409, 'OUT_OF_STOCK');
    }
    return;
  }
  const [res] = await conn.query(
    `UPDATE rewards SET reserved = reserved + 1 WHERE id = ? AND stock > reserved`,
    [reward.id]
  );
  if (res.affectedRows === 0) {
    throw httpError('Нет в наличии', 409, 'OUT_OF_STOCK');
  }
}

export async function claimChallengeReward(
  userId,
  { challengeId, rewardId, size, color, phone, address, city }
) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT uc.*, cl.level_num, cl.name AS level_name, cl.example_reward
       FROM user_challenges uc
       JOIN challenge_levels cl ON cl.id = uc.level_id
       WHERE uc.id = ? AND uc.user_id = ?
       FOR UPDATE`,
      [challengeId, userId]
    );
    const challenge = rows[0];
    if (!challenge) throw httpError('Задание не найдено', 404, 'NOT_FOUND');
    if (challenge.status !== 'COMPLETED') {
      throw httpError('Задание ещё не выполнено', 409, 'NOT_COMPLETED');
    }
    if (challenge.reward_claimed_at) {
      throw httpError('Награда уже получена', 409, 'ALREADY_CLAIMED');
    }

    let reward = null;
    if (rewardId) {
      const [linked] = await conn.query(
        `SELECT r.*
         FROM challenge_level_rewards clr
         JOIN rewards r ON r.id = clr.reward_id
         WHERE clr.level_id = ? AND clr.reward_id = ? AND clr.active = 1 AND r.active = 1`,
        [challenge.level_id, rewardId]
      );
      reward = linked[0] || null;
      if (!reward) {
        // allow any active reward if level has no links yet (admin not configured)
        const [any] = await conn.query(
          `SELECT COUNT(*) AS cnt FROM challenge_level_rewards WHERE level_id = ? AND active = 1`,
          [challenge.level_id]
        );
        if (Number(any[0]?.cnt) > 0) {
          throw httpError('Эта награда недоступна для задания', 400, 'INVALID_REWARD');
        }
        const [fallback] = await conn.query(`SELECT * FROM rewards WHERE id = ? AND active = 1`, [
          rewardId,
        ]);
        reward = fallback[0] || null;
      }
    } else {
      const [defaults] = await conn.query(
        `SELECT r.*
         FROM challenge_level_rewards clr
         JOIN rewards r ON r.id = clr.reward_id
         WHERE clr.level_id = ? AND clr.active = 1 AND r.active = 1
         ORDER BY clr.sort_order ASC LIMIT 1`,
        [challenge.level_id]
      );
      reward = defaults[0] || null;
    }

    if (!reward) {
      // Claim without catalog item — still mark claimed so user can progress
      await conn.query(
        `UPDATE user_challenges
         SET reward_claimed_at = NOW()
         WHERE id = ?`,
        [challenge.id]
      );
      await conn.commit();
      const state = await getChallengeState(userId);
      return {
        claimed: true,
        reward: {
          id: null,
          name: challenge.example_reward || challenge.level_name,
          type: 'SPECIAL',
        },
        ...state,
      };
    }

    if (reward.requires_size && !String(size || '').trim()) {
      throw httpError('Выберите размер', 400, 'SIZE_REQUIRED');
    }

    let promoCode = null;
    if (reward.type === 'DISCOUNT') {
      promoCode = `RUN-${nanoid(6).toUpperCase()}`;
    }

    await reserveRewardStock(conn, reward, size, color);

    await conn.query(
      `UPDATE user_challenges
       SET reward_id = ?, reward_claimed_at = NOW()
       WHERE id = ?`,
      [reward.id, challenge.id]
    );

    await conn.query(
      `INSERT INTO user_challenge_rewards
        (user_challenge_id, user_id, level_id, reward_id, status, size, color, phone, address, city, promo_code, claimed_at)
       VALUES (?, ?, ?, ?, 'CLAIMED', ?, ?, ?, ?, ?, ?, NOW())`,
      [
        challenge.id,
        userId,
        challenge.level_id,
        reward.id,
        size || null,
        color || null,
        phone || null,
        address || null,
        city || null,
        promoCode,
      ]
    );

    await conn.commit();

    try {
      await sendTelegramMessage(
        `🎁 Challenge reward claimed\nUser #${userId}\nLevel ${challenge.level_num}: ${challenge.level_name}\nReward: ${reward.name}`
      );
    } catch {
      /* optional */
    }

    const state = await getChallengeState(userId);
    return {
      claimed: true,
      reward: {
        id: reward.id,
        name: reward.name,
        type: reward.type,
        promoCode,
      },
      ...state,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/* —— Admin —— */

export async function adminListLevels() {
  const [levels] = await pool.query(
    `SELECT * FROM challenge_levels ORDER BY sort_order ASC, level_num ASC`
  );
  const [links] = await pool.query(
    `SELECT clr.*, r.name AS reward_name, r.type AS reward_type
     FROM challenge_level_rewards clr
     JOIN rewards r ON r.id = clr.reward_id
     ORDER BY clr.level_id ASC, clr.sort_order ASC`
  );
  const byLevel = new Map();
  for (const l of links) {
    if (!byLevel.has(l.level_id)) byLevel.set(l.level_id, []);
    byLevel.get(l.level_id).push({
      id: l.reward_id,
      name: l.reward_name,
      type: l.reward_type,
      sort_order: l.sort_order,
      active: !!l.active,
    });
  }
  return levels.map((l) => ({
    ...l,
    target_km: Number(l.target_km),
    reward_ids: (byLevel.get(l.id) || []).map((r) => r.id),
    rewards: byLevel.get(l.id) || [],
  }));
}

export async function adminSaveLevel(payload) {
  const {
    id,
    level_num,
    name,
    target_km,
    deadline_days,
    description,
    example_reward,
    sort_order,
    status,
    reward_ids,
  } = payload;

  if (!name?.trim()) throw httpError('Укажите название');
  if (!level_num) throw httpError('Укажите номер уровня');
  if (!(Number(target_km) > 0)) throw httpError('Укажите цель в км');
  if (!(Number(deadline_days) > 0)) throw httpError('Укажите срок в днях');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let levelId = id ? Number(id) : null;
    if (levelId) {
      await conn.query(
        `UPDATE challenge_levels
         SET level_num = ?, name = ?, target_km = ?, deadline_days = ?, description = ?,
             example_reward = ?, sort_order = ?, status = ?
         WHERE id = ?`,
        [
          level_num,
          name.trim(),
          target_km,
          deadline_days,
          description || null,
          example_reward || null,
          sort_order ?? 0,
          status || 'active',
          levelId,
        ]
      );
    } else {
      const [ins] = await conn.query(
        `INSERT INTO challenge_levels
          (level_num, name, target_km, deadline_days, description, example_reward, sort_order, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          level_num,
          name.trim(),
          target_km,
          deadline_days,
          description || null,
          example_reward || null,
          sort_order ?? 0,
          status || 'active',
        ]
      );
      levelId = ins.insertId;
    }

    if (Array.isArray(reward_ids)) {
      await conn.query(`DELETE FROM challenge_level_rewards WHERE level_id = ?`, [levelId]);
      let order = 10;
      for (const rid of reward_ids) {
        await conn.query(
          `INSERT INTO challenge_level_rewards (level_id, reward_id, sort_order, active)
           VALUES (?, ?, ?, 1)`,
          [levelId, rid, order]
        );
        order += 10;
      }
    }

    await conn.commit();
    return adminListLevels();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function adminListClaims({ status } = {}) {
  const params = [];
  let where = '1=1';
  if (status) {
    where += ' AND ucr.status = ?';
    params.push(status);
  }
  const [rows] = await pool.query(
    `SELECT ucr.*, cl.level_num, cl.name AS level_name, r.name AS reward_name, r.type AS reward_type,
            u.phone AS user_phone, u.name AS user_name, u.first_name
     FROM user_challenge_rewards ucr
     JOIN challenge_levels cl ON cl.id = ucr.level_id
     JOIN rewards r ON r.id = ucr.reward_id
     JOIN users u ON u.id = ucr.user_id
     WHERE ${where}
     ORDER BY ucr.claimed_at DESC
     LIMIT 500`,
    params
  );
  return rows;
}

export async function adminUpdateClaimStatus(id, status, adminComment) {
  const allowed = ['CLAIMED', 'PROCESSING', 'READY', 'DELIVERED', 'CANCELLED'];
  if (!allowed.includes(status)) throw httpError('Неверный статус');
  await pool.query(
    `UPDATE user_challenge_rewards
     SET status = ?,
         admin_comment = COALESCE(?, admin_comment),
         processed_at = CASE WHEN ? IN ('PROCESSING','READY','DELIVERED') THEN COALESCE(processed_at, NOW()) ELSE processed_at END,
         delivered_at = CASE WHEN ? = 'DELIVERED' THEN NOW() ELSE delivered_at END
     WHERE id = ?`,
    [status, adminComment || null, status, status, id]
  );
  return adminListClaims();
}
