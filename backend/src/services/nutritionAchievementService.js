import { pool } from '../db.js';
import { sendPushToUser } from './pushNotificationService.js';

function buildAchievementDefinitions() {
  const defs = [];
  let order = 0;
  const push = (def) => {
    order += 1;
    defs.push({ ...def, sort_order: order, bonus_points: def.bonus_points ?? Math.min(def.threshold, 50) });
  };

  [3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 100, 180, 365].forEach((t) => {
    push({
      slug: `streak_${t}`,
      title: `${t} дней подряд`,
      description: `Ведите дневник питания ${t} дней подряд`,
      icon: 'local_fire_department',
      category: 'streak',
      metric: 'streak_current',
      threshold: t,
    });
  });

  [7, 30, 100, 365].forEach((t) => {
    push({
      slug: `streak_best_${t}`,
      title: `Рекорд ${t} дней`,
      description: `Достигните streak ${t} дней (лучший результат)`,
      icon: 'whatshot',
      category: 'streak',
      metric: 'streak_best',
      threshold: t,
    });
  });

  [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000].forEach((t) => {
    push({
      slug: `food_${t}`,
      title: t === 1 ? 'Первая запись' : `${t} записей`,
      description: t === 1 ? 'Добавьте первую запись в дневник' : `Добавьте ${t} записей в дневник питания`,
      icon: 'restaurant',
      category: 'food',
      metric: 'food_logs',
      threshold: t,
    });
  });

  [1, 5, 10, 25, 50, 100, 200].forEach((t) => {
    push({
      slug: `ai_${t}`,
      title: t === 1 ? 'Первое AI-фото' : `${t} AI-фото`,
      description: t === 1 ? 'Распознайте еду по фото' : `Сделайте ${t} AI-анализов еды`,
      icon: 'photo_camera',
      category: 'ai',
      metric: 'ai_scans',
      threshold: t,
    });
  });

  [1, 5, 10, 25, 50].forEach((t) => {
    push({
      slug: `barcode_${t}`,
      title: t === 1 ? 'Первый штрихкод' : `${t} штрихкодов`,
      description: `Добавьте продукты через штрихкод (${t})`,
      icon: 'barcode_scanner',
      category: 'food',
      metric: 'barcode_logs',
      threshold: t,
    });
  });

  [10, 50, 100, 250, 500, 1000].forEach((t) => {
    push({
      slug: `water_${t}`,
      title: `${t} записей воды`,
      description: `Запишите воду ${t} раз`,
      icon: 'water_drop',
      category: 'water',
      metric: 'water_logs',
      threshold: t,
    });
  });

  [3, 7, 14, 30].forEach((t) => {
    push({
      slug: `water_goal_${t}`,
      title: `Вода ${t} дн.`,
      description: `Выпивайте норму воды ${t} дней`,
      icon: 'water_drop',
      category: 'water',
      metric: 'water_goal_days',
      threshold: t,
    });
  });

  [3, 7, 14, 30].forEach((t) => {
    push({
      slug: `protein_${t}`,
      title: `Белок ${t} дн.`,
      description: `Достигайте цели по белку ${t} дней`,
      icon: 'egg',
      category: 'protein',
      metric: 'protein_goal_days',
      threshold: t,
    });
  });

  [1, 5, 10, 30, 100].forEach((t) => {
    push({
      slug: `weight_log_${t}`,
      title: t === 1 ? 'Первый вес' : `${t} записей веса`,
      description: `Запишите вес ${t} ${t === 1 ? 'раз' : 'раз'}`,
      icon: 'monitor_weight',
      category: 'weight',
      metric: 'weight_logs',
      threshold: t,
    });
  });

  [1, 3, 5, 10, 20].forEach((t) => {
    push({
      slug: `weight_loss_${t}`,
      title: `−${t} кг`,
      description: `Снизьте вес на ${t} кг от стартового`,
      icon: 'trending_down',
      category: 'weight',
      metric: 'weight_lost_kg',
      threshold: t,
    });
  });

  [5, 10, 25, 50, 100, 250, 500, 1000].forEach((t) => {
    push({
      slug: `run_${t}km`,
      title: `${t} км`,
      description: `Пробегите ${t} км в RunBonus`,
      icon: 'directions_run',
      category: 'workout',
      metric: 'workout_km',
      threshold: t,
    });
  });

  [10, 50, 100].forEach((t) => {
    push({
      slug: `workout_days_${t}`,
      title: `${t} тренировок`,
      description: `Завершите ${t} одобренных тренировок`,
      icon: 'fitness_center',
      category: 'workout',
      metric: 'workout_days',
      threshold: t,
    });
  });

  [1, 7, 30].forEach((t) => {
    push({
      slug: `coach_${t}`,
      title: t === 1 ? 'AI-отчёт' : `${t} отчётов AI`,
      description: `Получите ${t} отчёт(ов) AI-диетолога`,
      icon: 'psychology',
      category: 'ai',
      metric: 'coach_reports',
      threshold: t,
    });
  });

  [1, 5, 10].forEach((t) => {
    push({
      slug: `favorites_${t}`,
      title: t === 1 ? 'Избранное' : `${t} в избранном`,
      description: `Добавьте ${t} продукт(ов) в избранное`,
      icon: 'star',
      category: 'food',
      metric: 'favorites_count',
      threshold: t,
    });
  });

  [7, 30].forEach((t) => {
    push({
      slug: `calorie_goal_${t}`,
      title: `Цель ${t} дн.`,
      description: `Достигайте дневной нормы калорий ${t} дней`,
      icon: 'flag',
      category: 'food',
      metric: 'calorie_goal_days',
      threshold: t,
    });
  });

  return defs;
}

let seedPromise = null;

async function hasAchievementTables() {
  try {
    await pool.query('SELECT 1 FROM nutrition_achievements LIMIT 1');
    return true;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

export async function ensureAchievementsSeeded() {
  if (!(await hasAchievementTables())) return;
  if (!seedPromise) {
    seedPromise = (async () => {
      const [rows] = await pool.query('SELECT COUNT(*) AS c FROM nutrition_achievements');
      if (Number(rows[0]?.c) > 0) return;

      const defs = buildAchievementDefinitions();
      for (const def of defs) {
        await pool.query(
          `INSERT INTO nutrition_achievements
             (slug, title, description, icon, category, metric, threshold, bonus_points, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            def.slug,
            def.title,
            def.description,
            def.icon,
            def.category,
            def.metric,
            def.threshold,
            def.bonus_points,
            def.sort_order,
          ]
        );
      }
    })();
  }
  await seedPromise;
}

async function collectMetrics(userId) {
  const metrics = {
    streak_current: 0,
    streak_best: 0,
    food_logs: 0,
    ai_scans: 0,
    barcode_logs: 0,
    water_logs: 0,
    water_goal_days: 0,
    protein_goal_days: 0,
    weight_logs: 0,
    weight_lost_kg: 0,
    workout_km: 0,
    workout_days: 0,
    coach_reports: 0,
    favorites_count: 0,
    calorie_goal_days: 0,
  };

  const [[streak]] = await pool.query(
    'SELECT current_streak, best_streak FROM nutrition_diary_streaks WHERE user_id = ?',
    [userId]
  );
  metrics.streak_current = Number(streak?.current_streak) || 0;
  metrics.streak_best = Number(streak?.best_streak) || 0;

  const [[food]] = await pool.query('SELECT COUNT(*) AS c FROM nutrition_logs WHERE user_id = ?', [userId]);
  metrics.food_logs = Number(food?.c) || 0;

  const [[ai]] = await pool.query('SELECT COUNT(*) AS c FROM nutrition_ai_results WHERE user_id = ?', [userId]);
  metrics.ai_scans = Number(ai?.c) || 0;

  const [[barcode]] = await pool.query(
    "SELECT COUNT(*) AS c FROM nutrition_logs WHERE user_id = ? AND source = 'barcode'",
    [userId]
  );
  metrics.barcode_logs = Number(barcode?.c) || 0;

  try {
    const [[water]] = await pool.query(
      'SELECT COUNT(*) AS c FROM nutrition_water_logs WHERE user_id = ?',
      [userId]
    );
    metrics.water_logs = Number(water?.c) || 0;

    const [waterDays] = await pool.query(
      `SELECT COUNT(*) AS c FROM (
         SELECT DATE(w.logged_at) AS d, SUM(w.amount_ml) AS ml, p.daily_water_ml, p.weight_kg
         FROM nutrition_water_logs w
         JOIN user_nutrition_profile p ON p.user_id = w.user_id
         WHERE w.user_id = ?
         GROUP BY DATE(w.logged_at), p.daily_water_ml, p.weight_kg
         HAVING ml >= COALESCE(NULLIF(p.daily_water_ml, 0), p.weight_kg * 33)
       ) t`,
      [userId]
    );
    metrics.water_goal_days = Number(waterDays[0]?.c) || 0;
  } catch {
    /* water table optional */
  }

  try {
    const [proteinDays] = await pool.query(
      `SELECT COUNT(*) AS c FROM (
         SELECT DATE(l.logged_at) AS d, SUM(l.protein_g) AS protein, p.daily_protein_g
         FROM nutrition_logs l
         JOIN user_nutrition_profile p ON p.user_id = l.user_id
         WHERE l.user_id = ?
         GROUP BY DATE(l.logged_at), p.daily_protein_g
         HAVING protein >= COALESCE(p.daily_protein_g, 80) * 0.8
       ) t`,
      [userId]
    );
    metrics.protein_goal_days = Number(proteinDays[0]?.c) || 0;
  } catch {
    /* ignore */
  }

  try {
    const [[weightCount]] = await pool.query(
      'SELECT COUNT(*) AS c FROM nutrition_weight_logs WHERE user_id = ?',
      [userId]
    );
    metrics.weight_logs = Number(weightCount?.c) || 0;

    const [weightRange] = await pool.query(
      `SELECT MIN(weight_kg) AS start_w, MAX(weight_kg) AS latest_w
       FROM nutrition_weight_logs WHERE user_id = ?`,
      [userId]
    );
    const startW = Number(weightRange[0]?.start_w);
    const latestW = Number(weightRange[0]?.latest_w);
    if (startW && latestW && startW > latestW) {
      metrics.weight_lost_kg = Math.floor((startW - latestW) * 10) / 10;
    }
  } catch {
    /* weight optional */
  }

  const [[workout]] = await pool.query(
    "SELECT COALESCE(SUM(distance_km), 0) AS km, COUNT(*) AS days FROM workouts WHERE user_id = ? AND status = 'approved'",
    [userId]
  );
  metrics.workout_km = Math.floor(Number(workout?.km) || 0);
  metrics.workout_days = Number(workout?.days) || 0;

  try {
    const [[coach]] = await pool.query(
      'SELECT COUNT(*) AS c FROM nutrition_coach_reports WHERE user_id = ?',
      [userId]
    );
    metrics.coach_reports = Number(coach?.c) || 0;
  } catch {
    /* coach optional */
  }

  const [[fav]] = await pool.query(
    'SELECT COUNT(*) AS c FROM nutrition_favorites WHERE user_id = ?',
    [userId]
  );
  metrics.favorites_count = Number(fav?.c) || 0;

  const [calorieDays] = await pool.query(
    `SELECT COUNT(*) AS c FROM (
       SELECT DATE(l.logged_at) AS d, SUM(l.calories) AS eaten, p.daily_calories
       FROM nutrition_logs l
       JOIN user_nutrition_profile p ON p.user_id = l.user_id
       WHERE l.user_id = ?
       GROUP BY DATE(l.logged_at), p.daily_calories
       HAVING eaten <= COALESCE(p.daily_calories, 2200) AND eaten >= COALESCE(p.daily_calories, 2200) * 0.85
     ) t`,
    [userId]
  );
  metrics.calorie_goal_days = Number(calorieDays[0]?.c) || 0;

  return metrics;
}

export async function checkAndUnlockAchievements(userId) {
  if (!(await hasAchievementTables())) return [];
  await ensureAchievementsSeeded();

  const metrics = await collectMetrics(userId);
  const [achievements] = await pool.query(
    `SELECT a.* FROM nutrition_achievements a
     LEFT JOIN user_nutrition_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
     WHERE a.is_active = 1 AND ua.user_id IS NULL`,
    [userId]
  );

  const unlocked = [];
  for (const ach of achievements) {
    const value = Number(metrics[ach.metric]) || 0;
    if (value < ach.threshold) continue;

    await pool.query(
      'INSERT INTO user_nutrition_achievements (user_id, achievement_id) VALUES (?, ?)',
      [userId, ach.id]
    );

    unlocked.push({
      id: ach.id,
      slug: ach.slug,
      title: ach.title,
      description: ach.description,
      icon: ach.icon,
      category: ach.category,
      bonus_points: ach.bonus_points,
    });

    sendPushToUser(userId, {
      title: 'Новое достижение!',
      body: ach.title,
      data: { url: '/nutrition/achievements', type: 'nutrition_achievement', slug: ach.slug },
    }).catch(() => {});
  }

  return unlocked;
}

export async function getAchievementsCatalog(userId) {
  if (!(await hasAchievementTables())) return { items: [], unlocked_count: 0, total: 0 };
  await ensureAchievementsSeeded();

  const metrics = await collectMetrics(userId);
  const [rows] = await pool.query(
    `SELECT a.*, ua.unlocked_at
     FROM nutrition_achievements a
     LEFT JOIN user_nutrition_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
     WHERE a.is_active = 1
     ORDER BY a.sort_order ASC, a.id ASC`,
    [userId]
  );

  const items = rows.map((r) => {
    const progress = Number(metrics[r.metric]) || 0;
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      description: r.description,
      icon: r.icon,
      category: r.category,
      metric: r.metric,
      threshold: r.threshold,
      bonus_points: r.bonus_points,
      unlocked: !!r.unlocked_at,
      unlocked_at: r.unlocked_at,
      progress: Math.min(progress, r.threshold),
      progress_pct: r.threshold > 0 ? Math.min(100, Math.round((progress / r.threshold) * 100)) : 0,
    };
  });

  return {
    items,
    unlocked_count: items.filter((i) => i.unlocked).length,
    total: items.length,
    metrics,
  };
}

export async function getUserAchievements(userId) {
  if (!(await hasAchievementTables())) return { items: [] };
  await ensureAchievementsSeeded();

  const [rows] = await pool.query(
    `SELECT a.*, ua.unlocked_at
     FROM user_nutrition_achievements ua
     JOIN nutrition_achievements a ON a.id = ua.achievement_id
     WHERE ua.user_id = ?
     ORDER BY ua.unlocked_at DESC`,
    [userId]
  );

  return {
    items: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      description: r.description,
      icon: r.icon,
      category: r.category,
      bonus_points: r.bonus_points,
      unlocked_at: r.unlocked_at,
    })),
  };
}
