import { pool } from '../db.js';
import { getConfirmedDistanceKm, syncUserTotalDistance } from './rewardService.js';

function roundKm(n) {
  return Math.round(Number(n || 0) * 1000) / 1000;
}

function mapAchievement(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description || null,
    type: row.type,
    targetValue: Number(row.target_value) || 0,
    icon: row.icon || null,
    image: row.image || null,
    sortOrder: Number(row.sort_order) || 0,
    active: Boolean(row.active),
  };
}

export async function listAchievements({ activeOnly = true } = {}, conn = pool) {
  const where = activeOnly ? 'WHERE active = 1' : '';
  const [rows] = await conn.query(
    `SELECT * FROM achievements ${where} ORDER BY sort_order ASC, id ASC`
  );
  return rows.map(mapAchievement);
}

export async function getApprovedWorkoutCount(userId, conn = pool) {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS c FROM workouts WHERE user_id = ? AND status = 'approved'`,
    [userId]
  );
  return Number(row?.c) || 0;
}

/**
 * Max consecutive calendar days with ≥1 APPROVED workout.
 * Day is counted by DATE(COALESCE(finished_at, started_at)) in server local time.
 */
export async function getMaxWorkoutStreakDays(userId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT DISTINCT DATE(COALESCE(finished_at, started_at)) AS d
     FROM workouts
     WHERE user_id = ? AND status = 'approved'
     ORDER BY d ASC`,
    [userId]
  );
  if (!rows.length) return 0;

  let maxStreak = 1;
  let streak = 1;
  let prev = new Date(rows[0].d);

  for (let i = 1; i < rows.length; i++) {
    const cur = new Date(rows[i].d);
    const diffDays = Math.round((cur - prev) / 86400000);
    if (diffDays === 1) {
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
    } else if (diffDays > 1) {
      streak = 1;
    }
    prev = cur;
  }
  return maxStreak;
}

function progressFor(achievement, { distance, workouts, streak }) {
  const target = Number(achievement.targetValue) || 0;
  if (target <= 0) return { current: 0, progress: 0, remaining: 0 };

  let current = 0;
  if (achievement.type === 'DISTANCE') current = distance;
  else if (achievement.type === 'WORKOUT_COUNT') current = workouts;
  else if (achievement.type === 'STREAK') current = streak;
  else current = 0;

  const progress = Math.min(100, Math.round((current / target) * 10000) / 100);
  const remaining = Math.max(0, roundKm(target - current));
  return { current: roundKm(current), progress, remaining };
}

export async function getAchievementsCatalog() {
  return listAchievements({ activeOnly: true });
}

export async function getMyAchievements(userId) {
  // Backfill for users who already have distance/workouts before this feature
  await unlockAchievementsForUser(userId);

  const [distance, workouts, streak, achievements, unlockedRows] = await Promise.all([
    syncUserTotalDistance(userId),
    getApprovedWorkoutCount(userId),
    getMaxWorkoutStreakDays(userId),
    listAchievements({ activeOnly: true }),
    pool
      .query(
        `SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?`,
        [userId]
      )
      .then(([rows]) => rows),
  ]);

  const unlockedMap = new Map(
    unlockedRows.map((r) => [r.achievement_id, r.unlocked_at])
  );

  const stats = { distance, workouts, streak };
  const items = achievements.map((a) => {
    const unlockedAt = unlockedMap.get(a.id) || null;
    const unlocked = Boolean(unlockedAt) || meetsTarget(a, stats);
    const prog = progressFor(a, stats);
    return {
      ...a,
      unlocked,
      unlockedAt,
      currentValue: prog.current,
      remaining: unlocked ? 0 : prog.remaining,
      progress: unlocked ? 100 : prog.progress,
    };
  });

  return {
    totalDistance: distance,
    workoutCount: workouts,
    streakDays: streak,
    unlockedCount: items.filter((i) => i.unlocked).length,
    totalCount: items.length,
    achievements: items,
  };
}

function meetsTarget(achievement, { distance, workouts, streak }) {
  const target = Number(achievement.targetValue) || 0;
  if (achievement.type === 'DISTANCE') return distance >= target;
  if (achievement.type === 'WORKOUT_COUNT') return workouts >= target;
  if (achievement.type === 'STREAK') return streak >= target;
  return false;
}

/**
 * Unlock all achievements the user now qualifies for.
 * Returns newly unlocked achievement rows.
 */
export async function unlockAchievementsForUser(userId, conn = pool) {
  const distance = await syncUserTotalDistance(userId, conn);
  const workouts = await getApprovedWorkoutCount(userId, conn);
  const streak = await getMaxWorkoutStreakDays(userId, conn);
  const achievements = await listAchievements({ activeOnly: true }, conn);
  const stats = { distance, workouts, streak };

  const newly = [];
  for (const a of achievements) {
    if (!meetsTarget(a, stats)) continue;
    const [result] = await conn.query(
      `INSERT IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at)
       VALUES (?, ?, NOW())`,
      [userId, a.id]
    );
    if (result.affectedRows > 0) {
      newly.push(a);
    }
  }
  return { totalDistance: distance, unlocked: newly };
}

export async function notifyAchievementsUnlocked(userId, unlocked) {
  if (!unlocked?.length) return;
  const { sendPushToUser } = await import('./pushNotificationService.js');
  for (const a of unlocked) {
    sendPushToUser(userId, {
      title: '🏆 Новое достижение!',
      body: `Вы получили медаль ${a.name}`,
      data: {
        type: 'achievement_unlocked',
        achievement_id: String(a.id),
        code: a.code,
        path: '/achievements',
      },
    }).catch(() => {});
  }
}

export async function createAchievement(data) {
  const [result] = await pool.query(
    `INSERT INTO achievements
      (code, name, description, type, target_value, icon, image, sort_order, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.code,
      data.name,
      data.description || null,
      data.type,
      Number(data.target_value ?? data.targetValue) || 0,
      data.icon || null,
      data.image || null,
      Number(data.sort_order ?? data.sortOrder) || 0,
      data.active === false || data.active === 0 ? 0 : 1,
    ]
  );
  const [rows] = await pool.query('SELECT * FROM achievements WHERE id = ?', [result.insertId]);
  return mapAchievement(rows[0]);
}

export async function updateAchievement(id, data) {
  await pool.query(
    `UPDATE achievements SET
      code = ?, name = ?, description = ?, type = ?, target_value = ?,
      icon = ?, image = ?, sort_order = ?, active = ?
     WHERE id = ?`,
    [
      data.code,
      data.name,
      data.description || null,
      data.type,
      Number(data.target_value ?? data.targetValue) || 0,
      data.icon || null,
      data.image || null,
      Number(data.sort_order ?? data.sortOrder) || 0,
      data.active === false || data.active === 0 ? 0 : 1,
      id,
    ]
  );
  const [rows] = await pool.query('SELECT * FROM achievements WHERE id = ?', [id]);
  return rows[0] ? mapAchievement(rows[0]) : null;
}

export async function setAchievementActive(id, active) {
  await pool.query('UPDATE achievements SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
  const [rows] = await pool.query('SELECT * FROM achievements WHERE id = ?', [id]);
  return rows[0] ? mapAchievement(rows[0]) : null;
}

export { getConfirmedDistanceKm };
