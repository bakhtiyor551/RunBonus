import { pool } from '../db.js';
import {
  estimateCalories,
  calculateTDEE,
  calculateMacroTargets,
  scaleNutrients,
  kmToBurnCalories,
} from '../utils/calories.js';
import { sendPushToUser } from './pushNotificationService.js';

const MEAL_LABELS = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
};

function round1(n) {
  return Math.round(Number(n || 0) * 10) / 10;
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

  return { ...p, age, ...targets };
}

export async function upsertNutritionProfile(userId, data) {
  const weight = data.weight_kg != null ? Number(data.weight_kg) : null;
  const height = data.height_cm != null ? Number(data.height_cm) : null;
  const birthYear = data.birth_year != null ? Number(data.birth_year) : null;
  const gender = data.gender || null;
  const activity = data.activity_level || 'moderate';
  const goal = data.goal || 'maintain';

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

  await pool.query(
    `INSERT INTO user_nutrition_profile
       (user_id, weight_kg, height_cm, birth_year, gender, activity_level, goal,
        daily_calories, daily_protein_g, daily_fat_g, daily_carbs_g)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       daily_carbs_g = VALUES(daily_carbs_g)`,
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
    ]
  );

  return getProfile(pool, userId);
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
  const conn = await pool.getConnection();
  try {
    const profile = await getProfile(conn, userId);
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const [consumed] = await conn.query(
        `SELECT COALESCE(SUM(calories), 0) AS c FROM nutrition_logs
         WHERE user_id = ? AND DATE(logged_at) = ?`,
        [userId, key]
      );
      const [workouts] = await conn.query(
        `SELECT COALESCE(SUM(distance_km), 0) AS d,
                COALESCE(SUM(steps_count), 0) AS s,
                COALESCE(SUM(COALESCE(moving_seconds, duration_seconds, 0)), 0) AS sec
         FROM workouts WHERE user_id = ? AND status != 'in_progress'
           AND DATE(COALESCE(finished_at, started_at)) = ?`,
        [userId, key]
      );
      const burned = estimateCalories(
        Number(workouts[0]?.d) || 0,
        Math.round((Number(workouts[0]?.sec) || 0) / 60),
        Number(workouts[0]?.s) || 0,
        profile.weight_kg
      );
      const eaten = Math.round(Number(consumed[0]?.c) || 0);
      days.push({
        date: key,
        day: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()],
        consumed: eaten,
        burned,
        balance: eaten - burned,
      });
    }
    return { days };
  } finally {
    conn.release();
  }
}

export async function getChartData(userId, period = 'week') {
  if (period === 'month') {
    const conn = await pool.getConnection();
    try {
      const profile = await getProfile(conn, userId);
      const [rows] = await conn.query(
        `SELECT DATE(logged_at) AS d, COALESCE(SUM(calories), 0) AS consumed
         FROM nutrition_logs
         WHERE user_id = ? AND logged_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
         GROUP BY DATE(logged_at) ORDER BY d`,
        [userId]
      );
      const consumedMap = new Map(rows.map((r) => [String(r.d).slice(0, 10), Math.round(Number(r.c))]));
      const days = [];
      for (let i = 29; i >= 0; i -= 1) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const [w] = await conn.query(
          `SELECT COALESCE(SUM(distance_km), 0) AS dist,
                  COALESCE(SUM(steps_count), 0) AS steps,
                  COALESCE(SUM(COALESCE(moving_seconds, duration_seconds, 0)), 0) AS sec
           FROM workouts WHERE user_id = ? AND status != 'in_progress'
             AND DATE(COALESCE(finished_at, started_at)) = ?`,
          [userId, key]
        );
        const burned = estimateCalories(
          Number(w[0]?.dist) || 0,
          Math.round((Number(w[0]?.sec) || 0) / 60),
          Number(w[0]?.steps) || 0,
          profile.weight_kg
        );
        const consumed = consumedMap.get(key) || 0;
        days.push({ date: key, consumed, burned, balance: consumed - burned });
      }
      return { period: 'month', days };
    } finally {
      conn.release();
    }
  }
  return getWeekStats(userId);
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

  const source = ['manual', 'search', 'photo_ai', 'favorite'].includes(data.source)
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
    if (streak.milestone) {
      sendPushToUser(userId, {
        title: 'RunBonus+',
        body: '7 дней подряд ведёте дневник питания! Бонус за streak скоро будет начислен.',
        data: { url: '/nutrition' },
      }).catch(() => {});
    }
  } finally {
    conn.release();
  }

  // Уведомления о норме
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

  return { id: result.insertId, ...nutrients, name, meal_type: mealType };
}

export async function deleteLogEntry(userId, logId) {
  const [r] = await pool.query('DELETE FROM nutrition_logs WHERE id = ? AND user_id = ?', [logId, userId]);
  return r.affectedRows > 0;
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
  return {
    active_users_30d: Number(users[0]?.active_users) || 0,
    total_logs: Number(logs[0]?.c) || 0,
    ai_analyses: Number(ai[0]?.c) || 0,
    premium_users: Number(premium[0]?.c) || 0,
    foods_count: Number(foods[0]?.c) || 0,
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
