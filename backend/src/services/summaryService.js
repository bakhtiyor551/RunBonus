import { pool } from '../db.js';
import { ensureUserWallet } from './accountService.js';
import { getWalletSummary } from './withdrawalService.js';
import { normalizeAvatarUrl } from '../utils/userProfile.js';
import { estimateCalories } from '../utils/calories.js';

const DEFAULT_GOALS = {
  daily_distance_km: 8,
  daily_steps: 8000,
  daily_active_minutes: 60,
  daily_calories: 600,
  weekly_distance_km: 30,
  weekly_steps: 50000,
  monthly_distance_km: 120,
  monthly_bonus: 200,
};

const DAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function ringBlock(current, goal, unit) {
  const g = Math.max(Number(goal) || 0, 0.001);
  const c = round2(current);
  return {
    current: c,
    goal: g,
    unit,
    percent: Math.min(100, Math.round((c / g) * 100)),
  };
}

function inferWorkoutType(avgSpeed) {
  const s = Number(avgSpeed) || 0;
  if (s > 0 && s < 6.5) return 'Ходьба';
  return 'Бег';
}

function mapWorkoutStatus(status) {
  if (status === 'approved') return 'approved';
  if (status === 'suspicious') return 'pending';
  if (status === 'rejected' || status === 'rejected_no_fund') return 'rejected';
  return status;
}

function formatDurationHms(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function formatWorkoutRow(row) {
  if (!row) return null;
  const durationSec = Number(row.duration_seconds) || Number(row.moving_seconds) || 0;
  return {
    id: row.id,
    date: row.finished_at || row.started_at,
    type: inferWorkoutType(row.avg_speed),
    distance: round2(row.distance_km),
    duration: formatDurationHms(durationSec),
    duration_seconds: durationSec,
    avg_speed: round2(row.avg_speed),
    steps: Number(row.steps_count) || 0,
    bonus: round2(row.calculated_bonus),
    status: mapWorkoutStatus(row.status),
    reject_reason: row.reject_reason || null,
  };
}

async function getUserGoals(conn, userId) {
  try {
    const [rows] = await conn.query('SELECT * FROM user_activity_goals WHERE user_id = ?', [userId]);
    if (!rows.length) return { ...DEFAULT_GOALS };
    const g = rows[0];
    return {
      daily_distance_km: Number(g.daily_distance_km),
      daily_steps: Number(g.daily_steps),
      daily_active_minutes: Number(g.daily_active_minutes),
      daily_calories: Number(g.daily_calories),
      weekly_distance_km: Number(g.weekly_distance_km),
      weekly_steps: Number(g.weekly_steps),
      monthly_distance_km: Number(g.monthly_distance_km),
      monthly_bonus: Number(g.monthly_bonus),
    };
  } catch {
    return { ...DEFAULT_GOALS };
  }
}

async function getTodayActivity(conn, userId) {
  const [rows] = await conn.query(
    `SELECT
       COALESCE(SUM(distance_km), 0) AS distance,
       COALESCE(SUM(steps_count), 0) AS steps,
       COALESCE(SUM(COALESCE(moving_seconds, duration_seconds, 0)), 0) AS active_seconds,
       COALESCE(SUM(CASE WHEN status = 'approved' THEN calculated_bonus ELSE 0 END), 0) AS bonus
     FROM workouts
     WHERE user_id = ?
       AND status != 'in_progress'
       AND DATE(COALESCE(finished_at, started_at)) = CURDATE()`,
    [userId]
  );
  const [live] = await conn.query(
    `SELECT distance_km, steps_count, COALESCE(moving_seconds, duration_seconds, 0) AS active_seconds
     FROM workouts
     WHERE user_id = ? AND status = 'in_progress' AND DATE(started_at) = CURDATE()
     ORDER BY started_at DESC LIMIT 1`,
    [userId]
  );

  let distance = Number(rows[0]?.distance) || 0;
  let steps = Number(rows[0]?.steps) || 0;
  let activeSeconds = Number(rows[0]?.active_seconds) || 0;
  let bonus = Number(rows[0]?.bonus) || 0;

  if (live.length) {
    distance += Number(live[0].distance_km) || 0;
    steps += Number(live[0].steps_count) || 0;
    activeSeconds += Number(live[0].active_seconds) || 0;
  }

  const activeMinutes = Math.round(activeSeconds / 60);
  const calories = estimateCalories(distance, activeMinutes, steps);

  return {
    distance: round2(distance),
    steps: Math.round(steps),
    active_minutes: activeMinutes,
    calories,
    bonus: round2(bonus),
  };
}

async function getWeeklyStats(conn, userId) {
  const [rows] = await conn.query(
    `SELECT
       DATE(COALESCE(finished_at, started_at)) AS day_date,
       COALESCE(SUM(distance_km), 0) AS distance,
       COALESCE(SUM(steps_count), 0) AS steps,
       COALESCE(SUM(CASE WHEN status = 'approved' THEN calculated_bonus ELSE 0 END), 0) AS bonus
     FROM workouts
     WHERE user_id = ?
       AND status != 'in_progress'
       AND COALESCE(finished_at, started_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
     GROUP BY DATE(COALESCE(finished_at, started_at))
     ORDER BY day_date ASC`,
    [userId]
  );

  const byDate = new Map(rows.map((r) => [String(r.day_date).slice(0, 10), r]));
  const days = [];
  let totalDistance = 0;
  let totalSteps = 0;
  let totalBonus = 0;

  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = byDate.get(key);
    const distance = round2(row?.distance);
    const steps = Math.round(Number(row?.steps) || 0);
    const bonus = round2(row?.bonus);
    totalDistance += distance;
    totalSteps += steps;
    totalBonus += bonus;
    days.push({
      day: DAY_LABELS[d.getDay()],
      date: key,
      distance,
      steps,
      bonus,
    });
  }

  const activeDays = days.filter((d) => d.distance > 0 || d.steps > 0).length || 1;

  return {
    days,
    totals: {
      distance: round2(totalDistance),
      steps: totalSteps,
      bonus: round2(totalBonus),
      avg_distance_per_day: round2(totalDistance / 7),
      avg_active_days: activeDays,
    },
  };
}

async function getPeriodTotals(conn, userId, period) {
  let clause = '';
  if (period === 'week') {
    clause = `AND COALESCE(finished_at, started_at) >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)`;
  } else if (period === 'month') {
    clause = `AND COALESCE(finished_at, started_at) >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`;
  }
  const [rows] = await conn.query(
    `SELECT
       COALESCE(SUM(distance_km), 0) AS distance,
       COALESCE(SUM(steps_count), 0) AS steps,
       COALESCE(SUM(CASE WHEN status = 'approved' THEN calculated_bonus ELSE 0 END), 0) AS bonus,
       COALESCE(SUM(COALESCE(moving_seconds, duration_seconds, 0)), 0) AS active_seconds
     FROM workouts
     WHERE user_id = ? AND status != 'in_progress' ${clause}`,
    [userId]
  );
  const r = rows[0] || {};
  return {
    distance: round2(r.distance),
    steps: Math.round(Number(r.steps) || 0),
    bonus: round2(r.bonus),
    active_minutes: Math.round((Number(r.active_seconds) || 0) / 60),
  };
}

async function getPersonalRecords(conn, userId) {
  const [longest] = await conn.query(
    `SELECT MAX(distance_km) AS v FROM workouts WHERE user_id = ? AND status != 'in_progress'`,
    [userId]
  );
  const [maxDuration] = await conn.query(
    `SELECT MAX(COALESCE(duration_seconds, moving_seconds, 0)) AS v FROM workouts WHERE user_id = ? AND status != 'in_progress'`,
    [userId]
  );
  const [maxSpeed] = await conn.query(
    `SELECT MAX(avg_speed) AS v FROM workouts WHERE user_id = ? AND avg_speed > 0`,
    [userId]
  );
  const [maxStepsDay] = await conn.query(
    `SELECT COALESCE(SUM(steps_count), 0) AS steps
     FROM workouts WHERE user_id = ? AND status != 'in_progress'
     GROUP BY DATE(COALESCE(finished_at, started_at))
     ORDER BY steps DESC LIMIT 1`,
    [userId]
  );
  const [maxBonusDay] = await conn.query(
    `SELECT COALESCE(SUM(CASE WHEN status = 'approved' THEN calculated_bonus ELSE 0 END), 0) AS bonus
     FROM workouts WHERE user_id = ? AND status != 'in_progress'
     GROUP BY DATE(COALESCE(finished_at, started_at))
     ORDER BY bonus DESC LIMIT 1`,
    [userId]
  );

  const bestMinutes = Math.round((Number(maxDuration[0]?.v) || 0) / 60);

  return {
    longest_workout_km: round2(longest[0]?.v),
    max_steps_per_day: Math.round(Number(maxStepsDay[0]?.steps) || 0),
    max_bonus_per_day: round2(maxBonusDay[0]?.bonus),
    best_active_minutes: bestMinutes,
    max_avg_speed_kmh: round2(maxSpeed[0]?.v),
  };
}

function buildGoalsProgress(goals, today, week, month) {
  const goalRow = (key, label, current, target, unit) => ({
    key,
    label,
    current: round2(current),
    target: round2(target),
    unit,
    percent: Math.min(100, Math.round((Number(current) / Math.max(target, 0.001)) * 100)),
    done: Number(current) >= Number(target),
  });

  return {
    daily: [
      goalRow('distance', `пройти ${goals.daily_distance_km} км`, today.distance, goals.daily_distance_km, 'km'),
      goalRow('steps', `сделать ${goals.daily_steps.toLocaleString('ru')} шагов`, today.steps, goals.daily_steps, 'steps'),
      goalRow('active', `быть активным ${goals.daily_active_minutes} мин`, today.active_minutes, goals.daily_active_minutes, 'min'),
    ],
    weekly: [
      goalRow('distance', `пройти ${goals.weekly_distance_km} км`, week.distance, goals.weekly_distance_km, 'km'),
      goalRow('steps', `сделать ${goals.weekly_steps.toLocaleString('ru')} шагов`, week.steps, goals.weekly_steps, 'steps'),
    ],
    monthly: [
      goalRow('distance', `пройти ${goals.monthly_distance_km} км`, month.distance, goals.monthly_distance_km, 'km'),
      goalRow('bonus', `заработать ${goals.monthly_bonus} сомони`, month.bonus, goals.monthly_bonus, 'bonus'),
    ],
  };
}

export async function getUserSummary(userId) {
  const conn = await pool.getConnection();
  try {
    const [users] = await conn.query(
      'SELECT id, name, first_name, last_name, avatar_url FROM users WHERE id = ?',
      [userId]
    );
    const user = users[0] || {};

    await ensureUserWallet(conn, userId);
    const wallet = await getWalletSummary(conn, userId);
    const [walletRows] = await conn.query(
      'SELECT total_earned FROM user_bonus_wallets WHERE user_id = ?',
      [userId]
    );
    const totalEarned = Number(walletRows[0]?.total_earned) || 0;

    const goals = await getUserGoals(conn, userId);
    const today = await getTodayActivity(conn, userId);
    const weekly = await getWeeklyStats(conn, userId);
    const weekTotals = await getPeriodTotals(conn, userId, 'week');
    const monthTotals = await getPeriodTotals(conn, userId, 'month');

    const rings = {
      move: ringBlock(today.calories, goals.daily_calories, 'kcal'),
      exercise: ringBlock(today.active_minutes, goals.daily_active_minutes, 'min'),
      distance: ringBlock(today.distance, goals.daily_distance_km, 'km'),
    };

    const [lastRows] = await conn.query(
      `SELECT * FROM workouts
       WHERE user_id = ? AND status != 'in_progress'
       ORDER BY COALESCE(finished_at, started_at) DESC LIMIT 1`,
      [userId]
    );

    const [recentRows] = await conn.query(
      `SELECT id, started_at, finished_at, distance_km, duration_seconds, moving_seconds,
              calculated_bonus, status, reject_reason, avg_speed, steps_count
       FROM workouts
       WHERE user_id = ? AND status != 'in_progress'
       ORDER BY COALESCE(finished_at, started_at) DESC LIMIT 8`,
      [userId]
    );

    const personal_records = await getPersonalRecords(conn, userId);

    return {
      profile: {
        name: user.name || [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Пользователь',
        avatar_url: normalizeAvatarUrl(user.avatar_url),
      },
      balance: round2(wallet.balance),
      total_earned: round2(totalEarned),
      available_withdraw: round2(wallet.available_balance),
      today,
      rings,
      weekly: weekly.days,
      weekly_totals: weekly.totals,
      last_workout: formatWorkoutRow(lastRows[0]),
      goals: buildGoalsProgress(goals, today, weekTotals, monthTotals),
      personal_records,
      recent_workouts: recentRows.map(formatWorkoutRow).filter(Boolean),
    };
  } finally {
    conn.release();
  }
}
