import { pool } from '../db.js';

/** Запасной лимит, если в БД нет уровней */
export const DEFAULT_MAX_SHOE_KM = 200;

const MAX_SHOE_BONUS = 221;

/** Максимальный км по активным уровням из админки */
export function getMaxShoeKmFromLevels(levels) {
  const active = (levels || []).filter((l) => l.status === 'active');
  if (!active.length) return DEFAULT_MAX_SHOE_KM;
  return Math.max(...active.map((l) => Number(l.to_km)));
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** @returns {Promise<Array>} */
export async function getActiveCustomerLevels(conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, name, code, from_km, to_km, price_per_km, color, icon, status, description
     FROM customer_levels
     WHERE status = 'active'
     ORDER BY from_km ASC`
  );
  return rows.map((r) => ({
    ...r,
    from_km: Number(r.from_km),
    to_km: Number(r.to_km),
    price_per_km: Number(r.price_per_km),
  }));
}

export async function getAllCustomerLevels(conn = pool) {
  const [rows] = await conn.query(
    `SELECT * FROM customer_levels ORDER BY from_km ASC`
  );
  return rows;
}

export function getLevelForKm(totalKm, levels) {
  const km = Number(totalKm) || 0;
  const active = levels.filter((l) => l.status === 'active');
  const maxKm = getMaxShoeKmFromLevels(levels);
  if (!active.length) {
    return { level: null, next: null, completed: km >= maxKm };
  }
  if (km >= maxKm) {
    return { level: active[active.length - 1], next: null, completed: true };
  }
  for (let i = 0; i < active.length; i++) {
    const l = active[i];
    if (km >= l.from_km && km < l.to_km) {
      return { level: l, next: active[i + 1] || null, completed: false };
    }
  }
  return { level: active[0], next: active[1] || null, completed: false };
}

/**
 * Бонус по диапазонам уровней для одной тренировки.
 * @param {number} kmBefore — км по паре до тренировки
 * @param {number} workoutKm — км тренировки
 */
export function calcTieredBonus(kmBefore, workoutKm, levels) {
  const before = Math.max(0, Number(kmBefore) || 0);
  const distance = Math.max(0, Number(workoutKm) || 0);
  const maxKm = getMaxShoeKmFromLevels(levels);
  if (before >= maxKm || distance <= 0) {
    return { bonus: 0, breakdown: [], kmAfter: before, effectiveKm: 0 };
  }

  const kmEnd = Math.min(before + distance, maxKm);
  const effectiveKm = kmEnd - before;
  const breakdown = [];
  let totalBonus = 0;

  for (const level of levels) {
    if (level.status !== 'active') continue;
    const bandStart = level.from_km;
    const bandEnd = Math.min(level.to_km, maxKm);
    if (before >= bandEnd) continue;

    const overlapStart = Math.max(before, bandStart);
    const overlapEnd = Math.min(kmEnd, bandEnd);
    const km = overlapEnd - overlapStart;
    if (km <= 0.0001) continue;

    const segmentBonus = round2(km * level.price_per_km);
    breakdown.push({
      level: level.name,
      level_code: level.code,
      level_id: level.id,
      km: round2(km),
      price_per_km: level.price_per_km,
      bonus: segmentBonus,
    });
    totalBonus += segmentBonus;
  }

  return {
    bonus: round2(totalBonus),
    breakdown,
    kmAfter: kmEnd,
    effectiveKm: round2(effectiveKm),
  };
}

export async function backfillShoeKm(conn, userId, shoeId) {
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(distance_km), 0) AS km
     FROM workouts
     WHERE user_id = ? AND shoe_id = ? AND status = 'approved'`,
    [userId, shoeId]
  );
  return Number(rows[0]?.km || 0);
}

export async function ensureShoeProgress(conn, userId, shoeId) {
  const [existing] = await conn.query(
    `SELECT * FROM user_shoe_progress WHERE user_id = ? AND shoe_id = ?`,
    [userId, shoeId]
  );
  if (existing.length) {
    const row = existing[0];
    if (Number(row.total_km) === 0 && !row.is_completed) {
      const km = await backfillShoeKm(conn, userId, shoeId);
      if (km > 0) {
        const levels = await getActiveCustomerLevels(conn);
        const { level } = getLevelForKm(km, levels);
        await conn.query(
          `UPDATE user_shoe_progress SET total_km = ?, current_level_id = ?,
           is_completed = ?, completed_at = IF(?, NOW(), NULL)
           WHERE id = ?`,
          [
            round2(km),
            level?.id ?? null,
            km >= getMaxShoeKmFromLevels(levels),
            km >= getMaxShoeKmFromLevels(levels),
            row.id,
          ]
        );
        row.total_km = km;
      }
    }
    return row;
  }

  const km = await backfillShoeKm(conn, userId, shoeId);
  const levels = await getActiveCustomerLevels(conn);
  const { level } = getLevelForKm(km, levels);
  const completed = km >= getMaxShoeKmFromLevels(levels);

  const [result] = await conn.query(
    `INSERT INTO user_shoe_progress
       (user_id, shoe_id, total_km, total_bonus, current_level_id, is_completed, completed_at)
     VALUES (?, ?, ?, 0, ?, ?, IF(?, NOW(), NULL))`,
    [userId, shoeId, round2(km), level?.id ?? null, completed, completed]
  );

  if (km > 0 && levels.length) {
    await recordLevelMilestones(conn, userId, shoeId, 0, km, levels);
  }

  const [rows] = await conn.query('SELECT * FROM user_shoe_progress WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function recordLevelMilestones(conn, userId, shoeId, kmBefore, kmAfter, levels) {
  for (const level of levels) {
    if (level.status !== 'active') continue;
    const threshold = level.from_km;
    const crossed =
      threshold === 0 ? kmBefore <= 0 && kmAfter > 0 : kmBefore < threshold && kmAfter >= threshold;
    if (crossed) {
      const [dup] = await conn.query(
        `SELECT id FROM user_level_history
         WHERE user_id = ? AND shoe_id = ? AND level_id = ?`,
        [userId, shoeId, level.id]
      );
      if (!dup.length) {
        await conn.query(
          `INSERT INTO user_level_history (user_id, shoe_id, level_id, reached_km)
           VALUES (?, ?, ?, ?)`,
          [userId, shoeId, level.id, round2(Math.max(threshold, kmAfter >= threshold ? threshold : kmAfter))]
        );
      }
    }
  }
  const maxKm = getMaxShoeKmFromLevels(levels);
  if (kmBefore < maxKm && kmAfter >= maxKm) {
    const completionLevel = levels.find((l) => l.to_km >= maxKm) || levels[levels.length - 1];
    if (completionLevel) {
      const [dup] = await conn.query(
        `SELECT id FROM user_level_history
         WHERE user_id = ? AND shoe_id = ? AND level_id = ? AND reached_km >= ?`,
        [userId, shoeId, completionLevel.id, maxKm]
      );
      if (!dup.length) {
        await conn.query(
          `INSERT INTO user_level_history (user_id, shoe_id, level_id, reached_km)
           VALUES (?, ?, ?, ?)`,
          [userId, shoeId, completionLevel.id, maxKm]
        );
      }
    }
  }
}

/**
 * @returns {{ newLevels: Array<{name, code}> }}
 */
export async function applyWorkoutProgress(conn, userId, shoeId, distanceKm, bonusCredited) {
  const progress = await ensureShoeProgress(conn, userId, shoeId);
  const kmBefore = Number(progress.total_km) || 0;
  const levels = await getActiveCustomerLevels(conn);
  const maxKm = getMaxShoeKmFromLevels(levels);
  const kmAfter = round2(Math.min(kmBefore + distanceKm, maxKm));
  const { level } = getLevelForKm(kmAfter, levels);
  const completed = kmAfter >= maxKm;

  const [historyBefore] = await conn.query(
    `SELECT level_id FROM user_level_history WHERE user_id = ? AND shoe_id = ?`,
    [userId, shoeId]
  );
  const hadLevels = new Set(historyBefore.map((h) => h.level_id));

  await recordLevelMilestones(conn, userId, shoeId, kmBefore, kmAfter, levels);

  const [historyAfter] = await conn.query(
    `SELECT ulh.level_id, cl.name, cl.code
     FROM user_level_history ulh
     JOIN customer_levels cl ON cl.id = ulh.level_id
     WHERE ulh.user_id = ? AND ulh.shoe_id = ?`,
    [userId, shoeId]
  );
  const newLevels = historyAfter
    .filter((h) => !hadLevels.has(h.level_id))
    .map((h) => ({ name: h.name, code: h.code }));

  await conn.query(
    `UPDATE user_shoe_progress SET
       total_km = ?,
       total_bonus = total_bonus + ?,
       current_level_id = ?,
       is_completed = ?,
       completed_at = IF(?, NOW(), completed_at)
     WHERE user_id = ? AND shoe_id = ?`,
    [
      kmAfter,
      round2(bonusCredited),
      level?.id ?? null,
      completed,
      completed,
      userId,
      shoeId,
    ]
  );

  return { kmBefore, kmAfter, newLevels, completed };
}

export function capBonusByRemaining(bonus, progress, dailyEarned, dailyLimit) {
  let amount = round2(bonus);
  const shoeRemaining = round2(Math.max(0, MAX_SHOE_BONUS - Number(progress?.total_bonus || 0)));
  if (amount > shoeRemaining) amount = shoeRemaining;

  const dailyRemaining = round2(Math.max(0, dailyLimit - dailyEarned));
  if (amount > dailyRemaining) amount = dailyRemaining;

  return Math.max(0, amount);
}

export async function getUserLevelSummary(userId, conn = pool) {
  const [shoes] = await conn.query(
    `SELECT uas.shoe_id AS id, s.unique_id, s.model_name
     FROM user_active_shoes uas
     JOIN shoes s ON s.id = uas.shoe_id
     WHERE uas.user_id = ?`,
    [userId]
  );
  if (!shoes.length) {
    return {
      current_level: null,
      current_level_code: null,
      total_km: 0,
      next_level: null,
      bonus_rate: null,
      progress_to_next_km: null,
      is_completed: false,
      color: null,
      icon: null,
      achievements: [],
    };
  }

  const shoeId = shoes[0].id;
  const progress = await ensureShoeProgress(conn, userId, shoeId);
  const levels = await getActiveCustomerLevels(conn);
  const totalKm = Number(progress.total_km) || 0;
  const { level, next, completed } = getLevelForKm(totalKm, levels);

  let progressToNext = null;
  if (level && next && !completed) {
    progressToNext = round2(Math.max(0, next.from_km - totalKm));
  }

  if (totalKm > 0 && levels.length) {
    await recordLevelMilestones(conn, userId, shoeId, 0, totalKm, levels);
  }

  const [history] = await conn.query(
    `SELECT ulh.id, ulh.reached_km, ulh.reached_at, cl.name, cl.code, cl.color, cl.icon
     FROM user_level_history ulh
     JOIN customer_levels cl ON cl.id = ulh.level_id
     WHERE ulh.user_id = ? AND ulh.shoe_id = ?
     ORDER BY ulh.reached_at ASC`,
    [userId, shoeId]
  );

  const maxKm = getMaxShoeKmFromLevels(levels);
  const achievements = buildAchievements(history, completed, totalKm, levels, maxKm);

  return {
    current_level: level?.name ?? (completed ? 'Завершено' : null),
    current_level_code: level?.code ?? null,
    total_km: round2(totalKm),
    next_level: completed ? null : next?.name ?? null,
    bonus_rate: level?.price_per_km ?? null,
    progress_to_next_km: progressToNext,
    is_completed: Boolean(progress.is_completed) || completed,
    color: level?.color ?? null,
    icon: level?.icon ?? null,
    total_bonus: round2(progress.total_bonus),
    max_shoe_km: maxKm,
    active_shoe: shoes[0],
    achievements,
    all_levels: levels.map((l) => ({
      id: l.id,
      name: l.name,
      code: l.code,
      from_km: l.from_km,
      to_km: l.to_km,
      price_per_km: l.price_per_km,
      color: l.color,
      icon: l.icon,
      unlocked: totalKm >= l.from_km || codesFromHistory(history).has(l.code),
      is_current: level?.id === l.id,
    })),
    level_history: history.map((h) => ({
      id: h.id,
      level: h.name,
      code: h.code,
      reached_km: Number(h.reached_km),
      reached_at: h.reached_at,
      color: h.color,
      icon: h.icon,
    })),
  };
}

function codesFromHistory(history) {
  return new Set((history || []).map((h) => h.code));
}

function buildAchievements(history, completed, totalKm, levels, maxKm) {
  const codes = codesFromHistory(history);
  const active = (levels || []).filter((l) => l.status === 'active');
  const items = active.map((l) => ({
    id: l.code,
    title: l.name,
    unlocked: codes.has(l.code) || totalKm >= l.from_km,
    description: `${l.from_km}–${l.to_km} км`,
    color: l.color,
    icon: l.icon,
  }));
  items.push({
    id: 'complete',
    title: `${maxKm} км`,
    unlocked: completed || totalKm >= maxKm,
    description: 'Полный километраж по паре кроссовок',
  });
  return items;
}

export async function getAdminClientLevelInfo(userId, conn = pool) {
  const summary = await getUserLevelSummary(userId, conn);
  const [history] = await conn.query(
    `SELECT ulh.reached_at, ulh.reached_km, cl.name AS level_name, cl.code,
            s.unique_id AS shoe_code
     FROM user_level_history ulh
     JOIN customer_levels cl ON cl.id = ulh.level_id
     JOIN shoes s ON s.id = ulh.shoe_id
     WHERE ulh.user_id = ?
     ORDER BY ulh.reached_at DESC`,
    [userId]
  );
  return {
    ...summary,
    level_transitions: history,
  };
}
