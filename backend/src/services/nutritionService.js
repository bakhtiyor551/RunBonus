import { pool } from '../db.js';
import {
  estimateCalories,
  calculateTDEE,
  calculateMacroTargets,
  scaleNutrients,
  kmToBurnCalories,
  calculateBMI,
  bmiCategory,
  calculateDailyWaterGoal,
} from '../utils/calories.js';
import { sendPushToUser } from './pushNotificationService.js';
import { checkAndUnlockAchievements } from './nutritionAchievementService.js';
import { config } from '../config.js';
import { isPremiumActive } from './subscriptionService.js';

const MEAL_LABELS = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
};

function round1(n) {
  return Math.round(Number(n || 0) * 10) / 10;
}

function triggerAchievements(userId) {
  checkAndUnlockAchievements(userId).catch(() => {});
}

async function hasNutritionTables() {
  try {
    await pool.query('SELECT 1 FROM nutrition_logs LIMIT 1');
    return true;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

async function getProfile(conn, userId) {
  const [rows] = await conn.query('SELECT * FROM user_nutrition_profile WHERE user_id = ?', [userId]);
  if (!rows.length) {
    return {
      weight_kg: 70,
      height_cm: 170,
      birth_year: 1990,
      gender: 'male',
      activity_level: 'moderate',
      goal: 'maintain',
      target_weight_kg: null,
      onboarding_completed: false,
    };
  }
  const p = rows[0];
  const age = p.birth_year ? new Date().getFullYear() - p.birth_year : 30;
  const targets = p.daily_calories
    ? {
        daily_calories: p.daily_calories,
        daily_protein_g: p.daily_protein_g,
        daily_fat_g: p.daily_fat_g,
        daily_carbs_g: p.daily_carbs_g,
      }
    : calculateMacroTargets(calculateTDEE({ ...p, age }));

  return {
    ...p,
    age,
    ...targets,
    onboarding_completed: !!p.onboarding_completed,
    target_weight_kg: p.target_weight_kg != null ? Number(p.target_weight_kg) : null,
  };
}

export async function upsertNutritionProfile(userId, data) {
  const weight = data.weight_kg != null ? Number(data.weight_kg) : null;
  const height = data.height_cm != null ? Number(data.height_cm) : null;
  const birthYear = data.birth_year != null ? Number(data.birth_year) : null;
  const gender = data.gender || null;
  const activity = data.activity_level || 'moderate';
  const goal = data.goal || 'maintain';
  const targetWeight = data.target_weight_kg != null ? Number(data.target_weight_kg) : null;
  const onboardingCompleted = data.onboarding_completed != null
    ? (data.onboarding_completed ? 1 : 0)
    : null;

  const profile = {
    weight_kg: weight || 70,
    height_cm: height || 170,
    birth_year: birthYear || 1990,
    gender: gender || 'male',
    activity_level: activity,
    goal,
    age: birthYear ? new Date().getFullYear() - birthYear : 30,
  };
  const macros = calculateMacroTargets(calculateTDEE(profile));

  const [existing] = await pool.query(
    'SELECT onboarding_completed FROM user_nutrition_profile WHERE user_id = ?',
    [userId]
  );
  const onboardingValue = onboardingCompleted != null
    ? onboardingCompleted
    : (existing.length ? existing[0].onboarding_completed : 0);

  await pool.query(
    `INSERT INTO user_nutrition_profile
       (user_id, weight_kg, height_cm, birth_year, gender, activity_level, goal,
        daily_calories, daily_protein_g, daily_fat_g, daily_carbs_g,
        target_weight_kg, onboarding_completed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       weight_kg = COALESCE(VALUES(weight_kg), weight_kg),
       height_cm = COALESCE(VALUES(height_cm), height_cm),
       birth_year = COALESCE(VALUES(birth_year), birth_year),
       gender = COALESCE(VALUES(gender), gender),
       activity_level = VALUES(activity_level),
       goal = VALUES(goal),
       daily_calories = VALUES(daily_calories),
       daily_protein_g = VALUES(daily_protein_g),
       daily_fat_g = VALUES(daily_fat_g),
       daily_carbs_g = VALUES(daily_carbs_g),
       target_weight_kg = COALESCE(VALUES(target_weight_kg), target_weight_kg),
       onboarding_completed = VALUES(onboarding_completed)`,
    [
      userId,
      weight,
      height,
      birthYear,
      gender,
      activity,
      goal,
      macros.daily_calories,
      macros.daily_protein_g,
      macros.daily_fat_g,
      macros.daily_carbs_g,
      targetWeight,
      onboardingValue,
    ]
  );

  return getProfile(pool, userId);
}

export async function getNutritionProfile(userId) {
  const profile = await getProfile(pool, userId);
  const macros = {
    daily_calories: profile.daily_calories,
    daily_protein_g: profile.daily_protein_g,
    daily_fat_g: profile.daily_fat_g,
    daily_carbs_g: profile.daily_carbs_g,
  };
  return { profile, goals: macros, daily_goal: profile.daily_calories };
}

async function getBurnedCalories(conn, userId, dateClause = 'DATE(COALESCE(finished_at, started_at)) = CURDATE()') {
  const profile = await getProfile(conn, userId);
  const [rows] = await conn.query(
    `SELECT
       COALESCE(SUM(distance_km), 0) AS distance,
       COALESCE(SUM(steps_count), 0) AS steps,
       COALESCE(SUM(COALESCE(moving_seconds, duration_seconds, 0)), 0) AS active_seconds
     FROM workouts
     WHERE user_id = ? AND status != 'in_progress' AND ${dateClause}`,
    [userId]
  );
  const r = rows[0] || {};
  const activeMinutes = Math.round((Number(r.active_seconds) || 0) / 60);
  return estimateCalories(
    Number(r.distance) || 0,
    activeMinutes,
    Number(r.steps) || 0,
    profile.weight_kg
  );
}

async function getConsumedTotals(conn, userId, dateClause = 'DATE(logged_at) = CURDATE()') {
  const [rows] = await conn.query(
    `SELECT
       COALESCE(SUM(calories), 0) AS calories,
       COALESCE(SUM(protein_g), 0) AS protein,
       COALESCE(SUM(fat_g), 0) AS fat,
       COALESCE(SUM(carbs_g), 0) AS carbs
     FROM nutrition_logs
     WHERE user_id = ? AND ${dateClause}`,
    [userId]
  );
  const r = rows[0] || {};
  return {
    calories: Math.round(Number(r.calories) || 0),
    protein_g: round1(r.protein),
    fat_g: round1(r.fat),
    carbs_g: round1(r.carbs),
  };
}

async function getMealBreakdown(conn, userId) {
  const [rows] = await conn.query(
    `SELECT meal_type, COALESCE(SUM(calories), 0) AS calories
     FROM nutrition_logs
     WHERE user_id = ? AND DATE(logged_at) = CURDATE()
     GROUP BY meal_type`,
    [userId]
  );
  const map = Object.fromEntries(rows.map((r) => [r.meal_type, Math.round(Number(r.calories))]));
  return {
    breakfast: map.breakfast || 0,
    lunch: map.lunch || 0,
    dinner: map.dinner || 0,
    snack: map.snack || 0,
  };
}

async function updateDiaryStreak(conn, userId) {
  const today = new Date().toISOString().slice(0, 10);
  const [rows] = await conn.query('SELECT * FROM nutrition_diary_streaks WHERE user_id = ?', [userId]);
  if (!rows.length) {
    await conn.query(
      'INSERT INTO nutrition_diary_streaks (user_id, current_streak, best_streak, last_log_date) VALUES (?, 1, 1, ?)',
      [userId, today]
    );
    return { current_streak: 1, best_streak: 1 };
  }
  const s = rows[0];
  const last = s.last_log_date ? String(s.last_log_date).slice(0, 10) : null;
  if (last === today) {
    return { current_streak: s.current_streak, best_streak: s.best_streak };
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = yesterday.toISOString().slice(0, 10);
  let streak = last === yKey ? s.current_streak + 1 : 1;
  const best = Math.max(streak, s.best_streak);
  await conn.query(
    'UPDATE nutrition_diary_streaks SET current_streak = ?, best_streak = ?, last_log_date = ? WHERE user_id = ?',
    [streak, best, today, userId]
  );
  return { current_streak: streak, best_streak: best, milestone: streak === 7 };
}

export async function getDailyStats(userId) {
  if (!(await hasNutritionTables())) {
    const err = new Error('Модуль питания не установлен');
    err.status = 503;
    throw err;
  }
  const conn = await pool.getConnection();
  try {
    const profile = await getProfile(conn, userId);
    const burned = await getBurnedCalories(conn, userId);
    const consumed = await getConsumedTotals(conn, userId);
    const meals = await getMealBreakdown(conn, userId);
    const goal = profile.daily_calories || 2200;
    const remaining = goal - consumed.calories;
    const balance = consumed.calories - burned;

    const [weekBurned] = await conn.query(
      `SELECT COALESCE(SUM(distance_km), 0) AS d,
              COALESCE(SUM(steps_count), 0) AS s,
              COALESCE(SUM(COALESCE(moving_seconds, duration_seconds, 0)), 0) AS sec
       FROM workouts WHERE user_id = ? AND status != 'in_progress'
         AND COALESCE(finished_at, started_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`,
      [userId]
    );
    const weekBurn = estimateCalories(
      Number(weekBurned[0]?.d) || 0,
      Math.round((Number(weekBurned[0]?.sec) || 0) / 60),
      Number(weekBurned[0]?.s) || 0,
      profile.weight_kg
    );

    const [monthConsumed] = await conn.query(
      `SELECT COALESCE(SUM(calories), 0) AS c FROM nutrition_logs
       WHERE user_id = ? AND logged_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
      [userId]
    );

    const [streakRow] = await conn.query(
      'SELECT current_streak, best_streak FROM nutrition_diary_streaks WHERE user_id = ?',
      [userId]
    );

    return {
      burned_today: burned,
      consumed_today: consumed.calories,
      consumed_macros: consumed,
      daily_goal: goal,
      remaining: remaining,
      balance,
      meals,
      macros_goal: {
        protein_g: profile.daily_protein_g,
        fat_g: profile.daily_fat_g,
        carbs_g: profile.daily_carbs_g,
      },
      burned_week: weekBurn,
      consumed_month: Math.round(Number(monthConsumed[0]?.c) || 0),
      streak: streakRow[0] || { current_streak: 0, best_streak: 0 },
      profile: {
        weight_kg: profile.weight_kg,
        height_cm: profile.height_cm,
        goal: profile.goal,
        activity_level: profile.activity_level,
      },
    };
  } finally {
    conn.release();
  }
}

export async function getWeekStats(userId) {
  const data = await getChartData(userId, 'week');
  return { days: data.days };
}

const DAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function parseChartPeriod(period) {
  const map = {
    week: { mode: 'day', count: 7 },
    month: { mode: 'day', count: 30 },
    '3m': { mode: 'day', count: 90 },
    '6m': { mode: 'week', count: 26 },
    '1y': { mode: 'week', count: 52 },
  };
  return map[period] || map.week;
}

function formatChartDayLabel(date, dayCount) {
  if (dayCount <= 7) return DAY_LABELS[date.getDay()];
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

async function buildDailyChartDays(conn, userId, profile, dayCount) {
  const [consumedRows] = await conn.query(
    `SELECT DATE(logged_at) AS d, COALESCE(SUM(calories), 0) AS consumed
     FROM nutrition_logs
     WHERE user_id = ? AND logged_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(logged_at) ORDER BY d`,
    [userId, dayCount - 1]
  );
  const consumedMap = new Map(
    consumedRows.map((r) => [String(r.d).slice(0, 10), Math.round(Number(r.consumed))])
  );

  const [workoutRows] = await conn.query(
    `SELECT DATE(COALESCE(finished_at, started_at)) AS d,
            COALESCE(SUM(distance_km), 0) AS dist,
            COALESCE(SUM(steps_count), 0) AS steps,
            COALESCE(SUM(COALESCE(moving_seconds, duration_seconds, 0)), 0) AS sec
     FROM workouts
     WHERE user_id = ? AND status != 'in_progress'
       AND DATE(COALESCE(finished_at, started_at)) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(COALESCE(finished_at, started_at))`,
    [userId, dayCount - 1]
  );
  const workoutMap = new Map(workoutRows.map((r) => [String(r.d).slice(0, 10), r]));

  const days = [];
  for (let i = dayCount - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const w = workoutMap.get(key);
    const burned = estimateCalories(
      Number(w?.dist) || 0,
      Math.round((Number(w?.sec) || 0) / 60),
      Number(w?.steps) || 0,
      profile.weight_kg
    );
    const consumed = consumedMap.get(key) || 0;
    days.push({
      date: key,
      day: formatChartDayLabel(d, dayCount),
      consumed,
      burned,
      balance: consumed - burned,
    });
  }
  return days;
}

function aggregateWeeklyDays(dailyDays, weekCount) {
  const weeks = [];
  for (let w = 0; w < weekCount; w += 1) {
    const chunk = dailyDays.slice(w * 7, (w + 1) * 7);
    if (!chunk.length) break;
    const consumed = chunk.reduce((sum, d) => sum + d.consumed, 0);
    const burned = chunk.reduce((sum, d) => sum + d.burned, 0);
    const first = chunk[0];
    weeks.push({
      date: first.date,
      day: first.day,
      consumed,
      burned,
      balance: consumed - burned,
    });
  }
  return weeks;
}

export async function getChartData(userId, period = 'week') {
  const cfg = parseChartPeriod(period);
  const conn = await pool.getConnection();
  try {
    const profile = await getProfile(conn, userId);

    if (cfg.mode === 'week') {
      const dayCount = cfg.count * 7;
      const daily = await buildDailyChartDays(conn, userId, profile, dayCount);
      return {
        period,
        granularity: 'week',
        days: aggregateWeeklyDays(daily, cfg.count),
      };
    }

    const days = await buildDailyChartDays(conn, userId, profile, cfg.count);
    return { period, granularity: 'day', days };
  } finally {
    conn.release();
  }
}

export async function getHistory(userId, { date, limit = 50 } = {}) {
  let clause = '';
  const params = [userId];
  if (date) {
    clause = 'AND DATE(logged_at) = ?';
    params.push(date);
  }
  params.push(Math.min(Number(limit) || 50, 200));

  const [rows] = await pool.query(
    `SELECT id, name, meal_type, grams, portions, calories, protein_g, fat_g, carbs_g,
            source, photo_url, ai_confidence, logged_at
     FROM nutrition_logs
     WHERE user_id = ? ${clause}
     ORDER BY logged_at DESC
     LIMIT ?`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    meal_type: r.meal_type,
    meal_label: MEAL_LABELS[r.meal_type] || r.meal_type,
    grams: round1(r.grams),
    portions: round1(r.portions),
    calories: Math.round(Number(r.calories)),
    protein_g: round1(r.protein_g),
    fat_g: round1(r.fat_g),
    carbs_g: round1(r.carbs_g),
    source: r.source,
    photo_url: r.photo_url,
    ai_confidence: r.ai_confidence,
    time: new Date(r.logged_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }),
    logged_at: r.logged_at,
  }));
}

export async function addLogEntry(userId, data) {
  const mealType = ['breakfast', 'lunch', 'dinner', 'snack'].includes(data.meal_type)
    ? data.meal_type
    : 'snack';
  let name = String(data.name || '').trim();
  let foodId = data.food_id || null;
  let grams = Math.max(Number(data.grams) || 100, 1);
  const portions = Math.max(Number(data.portions) || 1, 0.1);
  grams = Math.round(grams * portions);

  let nutrients = {
    calories: Number(data.calories) || 0,
    protein_g: Number(data.protein_g) || 0,
    fat_g: Number(data.fat_g) || 0,
    carbs_g: Number(data.carbs_g) || 0,
    fiber_g: Number(data.fiber_g) || 0,
  };

  if (foodId) {
    const [foods] = await pool.query('SELECT * FROM nutrition_foods WHERE id = ? AND is_active = 1', [foodId]);
    if (foods.length) {
      name = name || foods[0].name;
      nutrients = scaleNutrients(foods[0], grams);
    }
  }

  if (!name) {
    const err = new Error('Укажите название блюда');
    err.status = 400;
    throw err;
  }

  const source = ['manual', 'search', 'photo_ai', 'favorite', 'copy', 'barcode'].includes(data.source)
    ? data.source
    : 'manual';

  const [result] = await pool.query(
    `INSERT INTO nutrition_logs
       (user_id, food_id, name, meal_type, grams, portions, calories, protein_g, fat_g, carbs_g, fiber_g, source, photo_url, ai_confidence, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      foodId,
      name,
      mealType,
      grams,
      portions,
      nutrients.calories,
      nutrients.protein_g,
      nutrients.fat_g,
      nutrients.carbs_g,
      nutrients.fiber_g || 0,
      source,
      data.photo_url || null,
      data.ai_confidence ?? null,
      data.logged_at || new Date(),
    ]
  );

  const conn = await pool.getConnection();
  try {
    const streak = await updateDiaryStreak(conn, userId);
    if (!data.silent && streak.milestone) {
      sendPushToUser(userId, {
        title: 'RunBonus+',
        body: '7 дней подряд ведёте дневник питания! Бонус за streak скоро будет начислен.',
        data: { url: '/nutrition' },
      }).catch(() => {});
    }
  } finally {
    conn.release();
  }

  if (!data.silent) {
    const stats = await getDailyStats(userId);
    if (stats.remaining <= 0 && stats.remaining > -50) {
      sendPushToUser(userId, {
        title: 'Дневная цель',
        body: `Вы достигли дневной нормы ${stats.daily_goal} kcal`,
        data: { url: '/nutrition' },
      }).catch(() => {});
    } else if (stats.remaining < 0) {
      sendPushToUser(userId, {
        title: 'Питание',
        body: `Вы превысили дневную норму на ${Math.abs(stats.remaining)} kcal`,
        data: { url: '/nutrition' },
      }).catch(() => {});
    } else if (stats.remaining <= 200 && stats.remaining > 0) {
      sendPushToUser(userId, {
        title: 'Питание',
        body: `До цели осталось ${stats.remaining} kcal`,
        data: { url: '/nutrition' },
      }).catch(() => {});
    }
  }

  if (!data.silent) triggerAchievements(userId);

  return { id: result.insertId, ...nutrients, name, meal_type: mealType };
}

function shiftLoggedAtToToday(sourceLoggedAt) {
  const src = new Date(sourceLoggedAt);
  const now = new Date();
  const shifted = new Date(now);
  shifted.setHours(src.getHours(), src.getMinutes(), src.getSeconds(), 0);
  if (shifted > now) {
    shifted.setTime(now.getTime());
  }
  return shifted;
}

export async function copyDiaryEntries(userId, { from = 'yesterday', meal_type = null } = {}) {
  if (!(await hasNutritionTables())) {
    const err = new Error('Модуль питания не установлен');
    err.status = 503;
    throw err;
  }

  const mode = String(from).toLowerCase();
  if (mode !== 'yesterday' && mode !== 'week') {
    const err = new Error('Укажите from=yesterday или from=week');
    err.status = 400;
    throw err;
  }

  const offsetDays = mode === 'yesterday' ? 1 : 7;
  const sourceDate = new Date();
  sourceDate.setDate(sourceDate.getDate() - offsetDays);
  const sourceDateStr = sourceDate.toISOString().slice(0, 10);

  const params = [userId, sourceDateStr];
  let mealClause = '';
  if (meal_type && ['breakfast', 'lunch', 'dinner', 'snack'].includes(meal_type)) {
    mealClause = 'AND meal_type = ?';
    params.push(meal_type);
  }

  const [rows] = await pool.query(
    `SELECT food_id, name, meal_type, grams, portions, calories, protein_g, fat_g, carbs_g, fiber_g, logged_at
     FROM nutrition_logs
     WHERE user_id = ? AND DATE(logged_at) = ? ${mealClause}
     ORDER BY logged_at ASC`,
    params
  );

  if (!rows.length) {
    const err = new Error(
      mode === 'yesterday'
        ? 'Вчера нет записей для копирования'
        : 'Нет записей за этот день неделю назад'
    );
    err.status = 404;
    throw err;
  }

  const items = [];
  for (const row of rows) {
    const entry = await addLogEntry(userId, {
      food_id: row.food_id,
      name: row.name,
      meal_type: row.meal_type,
      grams: row.grams,
      portions: 1,
      calories: row.calories,
      protein_g: row.protein_g,
      fat_g: row.fat_g,
      carbs_g: row.carbs_g,
      fiber_g: row.fiber_g,
      source: 'copy',
      logged_at: shiftLoggedAtToToday(row.logged_at),
      silent: true,
    });
    items.push(entry);
  }

  const conn = await pool.getConnection();
  try {
    await updateDiaryStreak(conn, userId);
  } finally {
    conn.release();
  }

  triggerAchievements(userId);

  return {
    copied: items.length,
    source_date: sourceDateStr,
    from: mode,
    items,
  };
}

export async function deleteLogEntry(userId, logId) {
  const [r] = await pool.query('DELETE FROM nutrition_logs WHERE id = ? AND user_id = ?', [logId, userId]);
  return r.affectedRows > 0;
}

export async function updateLogEntry(userId, logId, data) {
  const [existing] = await pool.query(
    'SELECT * FROM nutrition_logs WHERE id = ? AND user_id = ?',
    [logId, userId]
  );
  if (!existing.length) {
    const err = new Error('Запись не найдена');
    err.status = 404;
    throw err;
  }

  const mealType = ['breakfast', 'lunch', 'dinner', 'snack'].includes(data.meal_type)
    ? data.meal_type
    : existing[0].meal_type;
  let name = data.name != null ? String(data.name).trim() : existing[0].name;
  let foodId = data.food_id !== undefined ? (data.food_id || null) : existing[0].food_id;
  let grams = data.grams != null ? Math.max(Number(data.grams) || 100, 1) : Number(existing[0].grams);
  const portions = data.portions != null ? Math.max(Number(data.portions) || 1, 0.1) : Number(existing[0].portions);
  if (data.grams != null || data.portions != null) {
    grams = Math.round(grams * portions);
  }

  let nutrients = {
    calories: data.calories != null ? Number(data.calories) : Number(existing[0].calories),
    protein_g: data.protein_g != null ? Number(data.protein_g) : Number(existing[0].protein_g),
    fat_g: data.fat_g != null ? Number(data.fat_g) : Number(existing[0].fat_g),
    carbs_g: data.carbs_g != null ? Number(data.carbs_g) : Number(existing[0].carbs_g),
    fiber_g: data.fiber_g != null ? Number(data.fiber_g) : Number(existing[0].fiber_g),
  };

  if (foodId) {
    const [foods] = await pool.query('SELECT * FROM nutrition_foods WHERE id = ? AND is_active = 1', [foodId]);
    if (foods.length && (data.grams != null || data.food_id != null)) {
      name = name || foods[0].name;
      nutrients = scaleNutrients(foods[0], grams);
    }
  }

  if (!name) {
    const err = new Error('Укажите название блюда');
    err.status = 400;
    throw err;
  }

  const loggedAt = data.logged_at || existing[0].logged_at;

  await pool.query(
    `UPDATE nutrition_logs SET
       food_id = ?, name = ?, meal_type = ?, grams = ?, portions = ?,
       calories = ?, protein_g = ?, fat_g = ?, carbs_g = ?, fiber_g = ?,
       logged_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      foodId,
      name,
      mealType,
      grams,
      portions,
      nutrients.calories,
      nutrients.protein_g,
      nutrients.fat_g,
      nutrients.carbs_g,
      nutrients.fiber_g || 0,
      loggedAt,
      logId,
      userId,
    ]
  );

  return {
    id: logId,
    name,
    meal_type: mealType,
    grams,
    portions,
    ...nutrients,
    logged_at: loggedAt,
  };
}

export async function getRecentFoods(userId, limit = 15) {
  const [rows] = await pool.query(
    `SELECT food_id, name, meal_type, grams, portions, calories, protein_g, fat_g, carbs_g, logged_at
     FROM nutrition_logs
     WHERE user_id = ?
     ORDER BY logged_at DESC
     LIMIT 50`,
    [userId]
  );

  const seen = new Set();
  const items = [];
  for (const r of rows) {
    const key = r.food_id ? `f:${r.food_id}` : `n:${r.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      food_id: r.food_id,
      name: r.name,
      meal_type: r.meal_type,
      grams: round1(r.grams),
      portions: round1(r.portions),
      calories: Math.round(Number(r.calories)),
      protein_g: round1(r.protein_g),
      fat_g: round1(r.fat_g),
      carbs_g: round1(r.carbs_g),
    });
    if (items.length >= Math.min(Number(limit) || 15, 30)) break;
  }
  return items;
}

export async function searchFoods(query, { country, limit = 20 } = {}) {
  const q = String(query || '').trim();
  let sql = 'SELECT * FROM nutrition_foods WHERE is_active = 1';
  const params = [];
  if (q) {
    sql += ' AND (name LIKE ? OR name_en LIKE ? OR search_keywords LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (country) {
    sql += ' AND country = ?';
    params.push(country);
  }
  sql += ' ORDER BY name LIMIT ?';
  params.push(Math.min(Number(limit) || 20, 50));
  const [rows] = await pool.query(sql, params);
  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    country: f.country,
    serving_grams: f.serving_grams,
    calories_per_100g: Number(f.calories_per_100g),
    protein_per_100g: Number(f.protein_per_100g),
    fat_per_100g: Number(f.fat_per_100g),
    carbs_per_100g: Number(f.carbs_per_100g),
    default_nutrients: scaleNutrients(f, f.serving_grams),
  }));
}

export async function getFavorites(userId) {
  const [rows] = await pool.query(
    `SELECT f.* FROM nutrition_favorites nf
     JOIN nutrition_foods f ON f.id = nf.food_id
     WHERE nf.user_id = ? AND f.is_active = 1
     ORDER BY nf.created_at DESC`,
    [userId]
  );
  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    serving_grams: f.serving_grams,
    default_nutrients: scaleNutrients(f, f.serving_grams),
  }));
}

export async function toggleFavorite(userId, foodId) {
  const [exists] = await pool.query(
    'SELECT 1 FROM nutrition_favorites WHERE user_id = ? AND food_id = ?',
    [userId, foodId]
  );
  if (exists.length) {
    await pool.query('DELETE FROM nutrition_favorites WHERE user_id = ? AND food_id = ?', [userId, foodId]);
    return { favorited: false };
  }
  await pool.query('INSERT INTO nutrition_favorites (user_id, food_id) VALUES (?, ?)', [userId, foodId]);
  triggerAchievements(userId);
  return { favorited: true };
}

export async function getRecommendations(userId) {
  const stats = await getDailyStats(userId);
  const profile = stats.profile;
  const tips = [];

  if (stats.remaining < 0) {
    const km = kmToBurnCalories(Math.abs(stats.remaining), profile.weight_kg);
    tips.push({
      type: 'excess',
      message: `Сегодня превышена норма на ${Math.abs(stats.remaining)} kcal. Рекомендуется пробежать ещё ${km} км.`,
      km,
    });
  }

  const proteinGoal = stats.macros_goal?.protein_g || 80;
  const proteinEaten = stats.consumed_macros?.protein_g || 0;
  if (proteinEaten < proteinGoal * 0.7) {
    tips.push({
      type: 'protein',
      message: 'Сегодня белка недостаточно. Добавьте: курицу, рыбу или яйца.',
      suggestions: ['Куриная грудка', 'Рыба запечённая', 'Яичница'],
    });
  }

  if (stats.goal === 'lose' && stats.balance > 500) {
    tips.push({
      type: 'weight_loss',
      message: 'Для похудения рекомендуется сократить потребление на 300–400 kcal или увеличить активность.',
    });
  }

  return { tips, stats };
}

export async function getAnalytics(userId) {
  const conn = await pool.getConnection();
  try {
    const profile = await getProfile(conn, userId);
    const [consumed] = await conn.query(
      `SELECT COALESCE(AVG(daily_c), 0) AS avg_c FROM (
         SELECT DATE(logged_at) AS d, SUM(calories) AS daily_c
         FROM nutrition_logs WHERE user_id = ?
           AND logged_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         GROUP BY DATE(logged_at)
       ) t`,
      [userId]
    );
    const [workouts] = await conn.query(
      `SELECT COALESCE(SUM(distance_km), 0) AS d,
              COALESCE(SUM(steps_count), 0) AS s,
              COALESCE(SUM(COALESCE(moving_seconds, duration_seconds, 0)), 0) AS sec
       FROM workouts WHERE user_id = ? AND status != 'in_progress'
         AND COALESCE(finished_at, started_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      [userId]
    );
    const avgBurn = Math.round(
      estimateCalories(
        Number(workouts[0]?.d) || 0,
        Math.round((Number(workouts[0]?.sec) || 0) / 60),
        Number(workouts[0]?.s) || 0,
        profile.weight_kg
      ) / 30
    );
    const avgConsumed = Math.round(Number(consumed[0]?.avg_c) || 0);
    return {
      period_days: 30,
      avg_consumed: avgConsumed,
      avg_burned: avgBurn,
      avg_balance: avgConsumed - avgBurn,
    };
  } finally {
    conn.release();
  }
}

/** Admin stats */
export async function getAdminStats() {
  if (!(await hasNutritionTables())) {
    return {
      active_users_30d: 0,
      total_logs: 0,
      ai_analyses: 0,
      premium_users: 0,
      foods_count: 0,
    };
  }
  const [users] = await pool.query(
    `SELECT COUNT(DISTINCT user_id) AS active_users FROM nutrition_logs
     WHERE logged_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`
  );
  const [logs] = await pool.query('SELECT COUNT(*) AS c FROM nutrition_logs');
  const [ai] = await pool.query('SELECT COUNT(*) AS c FROM nutrition_ai_results');
  const [premium] = await pool.query(
    `SELECT COUNT(*) AS c FROM user_subscriptions WHERE status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())`
  );
  const [foods] = await pool.query('SELECT COUNT(*) AS c FROM nutrition_foods WHERE is_active = 1');
  let off_foods_count = 0;
  try {
    const [off] = await pool.query("SELECT COUNT(*) AS c FROM nutrition_foods WHERE is_active = 1 AND food_source = 'off'");
    off_foods_count = Number(off[0]?.c) || 0;
  } catch {
    off_foods_count = 0;
  }
  return {
    active_users_30d: Number(users[0]?.active_users) || 0,
    total_logs: Number(logs[0]?.c) || 0,
    ai_analyses: Number(ai[0]?.c) || 0,
    premium_users: Number(premium[0]?.c) || 0,
    foods_count: Number(foods[0]?.c) || 0,
    off_foods_count,
  };
}

export async function adminUpsertFood(data) {
  const id = data.id;
  const fields = {
    category_id: data.category_id || null,
    name: data.name,
    name_en: data.name_en || null,
    country: data.country || null,
    serving_grams: Number(data.serving_grams) || 100,
    calories_per_100g: Number(data.calories_per_100g) || 0,
    protein_per_100g: Number(data.protein_per_100g) || 0,
    fat_per_100g: Number(data.fat_per_100g) || 0,
    carbs_per_100g: Number(data.carbs_per_100g) || 0,
    fiber_per_100g: Number(data.fiber_per_100g) || 0,
    search_keywords: data.search_keywords || null,
    is_active: data.is_active !== false ? 1 : 0,
  };

  if (id) {
    await pool.query(
      `UPDATE nutrition_foods SET category_id=?, name=?, name_en=?, country=?, serving_grams=?,
       calories_per_100g=?, protein_per_100g=?, fat_per_100g=?, carbs_per_100g=?, fiber_per_100g=?,
       search_keywords=?, is_active=? WHERE id=?`,
      [...Object.values(fields), id]
    );
    return { id };
  }

  const [r] = await pool.query(
    `INSERT INTO nutrition_foods
       (category_id, name, name_en, country, serving_grams, calories_per_100g,
        protein_per_100g, fat_per_100g, carbs_per_100g, fiber_per_100g, search_keywords, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    Object.values(fields)
  );
  return { id: r.insertId };
}

export async function adminListFoods({ q, limit = 100 } = {}) {
  let sql = 'SELECT f.*, c.name AS category_name FROM nutrition_foods f LEFT JOIN food_categories c ON c.id = f.category_id WHERE 1=1';
  const params = [];
  if (q) {
    sql += ' AND (f.name LIKE ? OR f.search_keywords LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY f.name LIMIT ?';
  params.push(Math.min(Number(limit) || 100, 500));
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function hasWeightLogsTable() {
  try {
    await pool.query('SELECT 1 FROM nutrition_weight_logs LIMIT 1');
    return true;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

function parseWeightPeriod(period) {
  const map = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
  return map[period] || 30;
}

async function buildWeightSummary(userId, items) {
  const { profile } = await getNutritionProfile(userId);
  const height = profile.height_cm || 170;
  const target = profile.target_weight_kg;
  const profileWeight = profile.weight_kg;

  const current = items.length ? Number(items[items.length - 1].weight_kg) : profileWeight;
  const first = items.length ? Number(items[0].weight_kg) : current;
  const change = current != null && first != null ? round1(current - first) : 0;
  const bmi = current ? calculateBMI(current, height) : null;

  let forecast = null;
  if (target != null && current != null && items.length >= 2) {
    const diff = Number(target) - current;
    const t0 = new Date(items[0].logged_at).getTime();
    const t1 = new Date(items[items.length - 1].logged_at).getTime();
    const daysSpan = Math.max(1, (t1 - t0) / 86400000);
    const weeklyChange = ((current - first) / daysSpan) * 7;

    const movingTowardGoal =
      (diff < 0 && weeklyChange < 0) || (diff > 0 && weeklyChange > 0) || diff === 0;

    if (movingTowardGoal && Math.abs(weeklyChange) > 0.05) {
      forecast = {
        target_weight_kg: Number(target),
        remaining_kg: round1(Math.abs(diff)),
        weekly_change_kg: round1(weeklyChange),
        weeks_to_goal: Math.max(1, Math.round(Math.abs(diff / weeklyChange))),
      };
    }
  }

  return {
    current_kg: current != null ? round1(current) : null,
    change_kg: change,
    bmi,
    bmi_category: bmiCategory(bmi),
    target_weight_kg: target != null ? Number(target) : null,
    height_cm: height,
    forecast,
  };
}

export async function addWeightLog(userId, data) {
  if (!(await hasWeightLogsTable())) {
    const err = new Error('Модуль веса не установлен');
    err.status = 503;
    throw err;
  }

  const weight = Number(data.weight_kg);
  if (!weight || weight < 30 || weight > 300) {
    const err = new Error('Вес должен быть от 30 до 300 кг');
    err.status = 400;
    throw err;
  }

  const bodyFat = data.body_fat_pct != null && data.body_fat_pct !== ''
    ? Number(data.body_fat_pct)
    : null;
  if (bodyFat != null && (bodyFat < 3 || bodyFat > 60)) {
    const err = new Error('Процент жира должен быть от 3 до 60');
    err.status = 400;
    throw err;
  }

  const loggedAt = data.logged_at || new Date();

  const [result] = await pool.query(
    `INSERT INTO nutrition_weight_logs (user_id, weight_kg, body_fat_pct, logged_at, source)
     VALUES (?, ?, ?, ?, 'manual')`,
    [userId, weight, bodyFat, loggedAt]
  );

  await pool.query(
    'UPDATE user_nutrition_profile SET weight_kg = ? WHERE user_id = ?',
    [weight, userId]
  ).catch(() => {});

  triggerAchievements(userId);
  return {
    id: result.insertId,
    weight_kg: round1(weight),
    body_fat_pct: bodyFat != null ? round1(bodyFat) : null,
    logged_at: loggedAt,
  };
}

export async function getWeightHistory(userId, { period = '30d', limit = 200 } = {}) {
  if (!(await hasWeightLogsTable())) {
    return { items: [], summary: null, period };
  }

  const days = parseWeightPeriod(period);
  const [rows] = await pool.query(
    `SELECT id, weight_kg, body_fat_pct, logged_at
     FROM nutrition_weight_logs
     WHERE user_id = ? AND logged_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY logged_at ASC
     LIMIT ?`,
    [userId, days, Math.min(Number(limit) || 200, 500)]
  );

  const items = rows.map((r) => ({
    id: r.id,
    weight_kg: round1(r.weight_kg),
    body_fat_pct: r.body_fat_pct != null ? round1(r.body_fat_pct) : null,
    date: new Date(r.logged_at).toISOString().slice(0, 10),
    logged_at: r.logged_at,
  }));

  const summary = await buildWeightSummary(userId, items);
  return { items, summary, period };
}

export async function deleteWeightLog(userId, logId) {
  if (!(await hasWeightLogsTable())) return false;
  const [r] = await pool.query(
    'DELETE FROM nutrition_weight_logs WHERE id = ? AND user_id = ?',
    [logId, userId]
  );
  return r.affectedRows > 0;
}

async function hasWaterLogsTable() {
  try {
    await pool.query('SELECT 1 FROM nutrition_water_logs LIMIT 1');
    return true;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

async function getTodayWorkoutMinutes(conn, userId) {
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(COALESCE(moving_seconds, duration_seconds, 0)), 0) AS sec
     FROM workouts
     WHERE user_id = ? AND status != 'in_progress'
       AND DATE(COALESCE(finished_at, started_at)) = CURDATE()`,
    [userId]
  );
  return Math.round((Number(rows[0]?.sec) || 0) / 60);
}

async function resolveWaterGoal(userId) {
  const { profile } = await getNutritionProfile(userId);
  const conn = await pool.getConnection();
  try {
    const workoutMinutes = await getTodayWorkoutMinutes(conn, userId);
    const customGoal = profile.daily_water_ml;
    const goal = calculateDailyWaterGoal(profile.weight_kg || 70, {
      workoutMinutes,
      hotWeather: false,
      customGoal,
    });
    const workoutBonus = workoutMinutes > 30 ? 500 : 0;
    return { goal_ml: goal, workout_bonus_ml: workoutBonus, base_ml: goal - workoutBonus };
  } finally {
    conn.release();
  }
}

export async function getWaterToday(userId) {
  if (!(await hasWaterLogsTable())) {
    return {
      consumed_ml: 0,
      goal_ml: 2310,
      remaining_ml: 2310,
      percent: 0,
      workout_bonus_ml: 0,
      logs: [],
    };
  }

  const { goal_ml, workout_bonus_ml, base_ml } = await resolveWaterGoal(userId);

  const [rows] = await pool.query(
    `SELECT id, amount_ml, logged_at
     FROM nutrition_water_logs
     WHERE user_id = ? AND DATE(logged_at) = CURDATE()
     ORDER BY logged_at DESC`,
    [userId]
  );

  const consumed = rows.reduce((s, r) => s + Number(r.amount_ml), 0);
  const remaining = Math.max(0, goal_ml - consumed);
  const percent = goal_ml > 0 ? Math.min(100, Math.round((consumed / goal_ml) * 100)) : 0;

  const logs = rows.map((r) => ({
    id: r.id,
    amount_ml: Number(r.amount_ml),
    time: new Date(r.logged_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }),
    logged_at: r.logged_at,
  }));

  return {
    consumed_ml: consumed,
    goal_ml,
    remaining_ml: remaining,
    percent,
    workout_bonus_ml,
    base_ml,
    logs,
  };
}

export async function addWaterLog(userId, data) {
  if (!(await hasWaterLogsTable())) {
    const err = new Error('Модуль воды не установлен');
    err.status = 503;
    throw err;
  }

  const amount = Math.round(Number(data.amount_ml));
  if (!amount || amount < 50 || amount > 2000) {
    const err = new Error('Укажите объём от 50 до 2000 мл');
    err.status = 400;
    throw err;
  }

  const loggedAt = data.logged_at || new Date();
  const [result] = await pool.query(
    'INSERT INTO nutrition_water_logs (user_id, amount_ml, logged_at) VALUES (?, ?, ?)',
    [userId, amount, loggedAt]
  );

  const today = await getWaterToday(userId);
  triggerAchievements(userId);
  return {
    id: result.insertId,
    amount_ml: amount,
    logged_at: loggedAt,
    today,
  };
}

export async function deleteWaterLog(userId, logId) {
  if (!(await hasWaterLogsTable())) return false;
  const [r] = await pool.query(
    'DELETE FROM nutrition_water_logs WHERE id = ? AND user_id = ?',
    [logId, userId]
  );
  return r.affectedRows > 0;
}

export async function getWaterStats(userId, { period = '7d' } = {}) {
  if (!(await hasWaterLogsTable())) {
    return { days: [], avg_ml: 0, period };
  }

  const daysCount = period === '30d' ? 30 : 7;
  const { goal_ml } = await resolveWaterGoal(userId);

  const [rows] = await pool.query(
    `SELECT DATE(logged_at) AS d,
            COALESCE(SUM(amount_ml), 0) AS total,
            DAYOFWEEK(logged_at) AS dow
     FROM nutrition_water_logs
     WHERE user_id = ? AND logged_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(logged_at)
     ORDER BY d ASC`,
    [userId, daysCount - 1]
  );

  const map = Object.fromEntries(rows.map((r) => [String(r.d).slice(0, 10), Number(r.total)]));
  const dayLabels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const days = [];

  for (let i = daysCount - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      date: key,
      day: dayLabels[d.getDay()],
      consumed_ml: map[key] || 0,
      goal_ml,
    });
  }

  const totals = days.map((x) => x.consumed_ml).filter((v) => v > 0);
  const avg = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;

  return { days, avg_ml: avg, goal_ml, period };
}

/**
 * После пробежки: расчёт сожжённых kcal и push для RunBonus+.
 */
export async function buildPostWorkoutNutrition(userId, { distanceKm, movingSeconds, durationSeconds, stepsCount }) {
  const isPremium = config.nutritionDevFree || (await isPremiumActive(userId));
  if (!isPremium) return null;
  if (!(await hasNutritionTables())) return null;

  const distance = Number(distanceKm) || 0;
  const activeSec = movingSeconds ?? durationSeconds ?? 0;
  if (distance < 0.1 && activeSec < 120) return null;

  const { profile } = await getNutritionProfile(userId);
  const activeMinutes = Math.round(Number(activeSec) / 60);
  const burned = estimateCalories(
    distance,
    activeMinutes,
    Number(stepsCount) || 0,
    profile.weight_kg ?? 70
  );

  if (burned < 30) return null;

  return {
    burned_kcal: burned,
    extra_kcal: burned,
    message: `Сожжено ${burned} kcal. Сегодня можно съесть +${burned} kcal`,
  };
}

export async function notifyPostWorkoutNutrition(userId, meta) {
  const info = await buildPostWorkoutNutrition(userId, meta);
  if (!info) return null;

  sendPushToUser(userId, {
    title: 'Отличная пробежка!',
    body: `+${info.burned_kcal} kcal — сегодня можно съесть больше`,
    data: { url: '/nutrition', type: 'post_workout_nutrition' },
  }).catch((err) => console.warn('[nutrition/post-workout]', err.message));

  return info;
}
