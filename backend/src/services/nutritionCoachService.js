import { pool } from '../db.js';
import { config } from '../config.js';
import { kmToBurnCalories, estimateCalories } from '../utils/calories.js';
import {
  getDailyStats,
  getWaterToday,
  getWeightHistory,
} from './nutritionService.js';
import { sendPushToUser } from './pushNotificationService.js';
import { isPremiumActive } from './subscriptionService.js';
import { checkAndUnlockAchievements } from './nutritionAchievementService.js';

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(n) || 0)));
}

async function hasCoachTable() {
  try {
    await pool.query('SELECT 1 FROM nutrition_coach_reports LIMIT 1');
    return true;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

async function getTodayWorkoutSummary(userId) {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(distance_km), 0) AS distance_km,
            COALESCE(SUM(steps_count), 0) AS steps,
            COALESCE(SUM(COALESCE(moving_seconds, duration_seconds, 0)), 0) AS moving_sec,
            COUNT(*) AS count
     FROM workouts
     WHERE user_id = ? AND status != 'in_progress'
       AND DATE(COALESCE(finished_at, started_at)) = CURDATE()`,
    [userId]
  );
  const r = rows[0] || {};
  const weightRow = await pool.query(
    'SELECT weight_kg FROM user_nutrition_profile WHERE user_id = ?',
    [userId]
  ).then(([w]) => w[0]);
  const weightKg = Number(weightRow?.weight_kg) || 70;
  const burned = estimateCalories(
    Number(r.distance_km) || 0,
    Math.round((Number(r.moving_sec) || 0) / 60),
    Number(r.steps) || 0,
    weightKg
  );
  return {
    count: Number(r.count) || 0,
    distance_km: round1(Number(r.distance_km) || 0),
    steps: Number(r.steps) || 0,
    burned_kcal: burned,
  };
}

function round1(n) {
  return Math.round(Number(n || 0) * 10) / 10;
}

async function collectCoachContext(userId) {
  const stats = await getDailyStats(userId);
  let water = null;
  try {
    water = await getWaterToday(userId);
  } catch {
    water = null;
  }

  let weightTrend = null;
  try {
    const wh = await getWeightHistory(userId, { period: '30d', limit: 14 });
    const logs = wh?.items || [];
    if (logs.length >= 2) {
      const latest = logs[logs.length - 1];
      const weekAgo = logs.find((l) => {
        const d1 = new Date(l.logged_at);
        const d2 = new Date(latest.logged_at);
        return (d2 - d1) / (1000 * 60 * 60 * 24) >= 6;
      }) || logs[0];
      weightTrend = {
        latest_kg: Number(latest.weight_kg),
        delta_kg: round1(Number(latest.weight_kg) - Number(weekAgo.weight_kg)),
      };
    }
  } catch {
    weightTrend = null;
  }

  const workout = await getTodayWorkoutSummary(userId);

  return {
    date: todayDateStr(),
    stats,
    water,
    workout,
    weightTrend,
  };
}

function buildRuleBasedReport(ctx) {
  const { stats, water, workout, weightTrend } = ctx;
  let score = 70;
  const recommendations = [];

  const proteinGoal = stats.macros_goal?.protein_g || 80;
  const proteinEaten = stats.consumed_macros?.protein_g || 0;
  const proteinPct = proteinGoal > 0 ? proteinEaten / proteinGoal : 0;
  const goal = stats.profile?.goal || 'maintain';

  if (stats.consumed_today === 0) {
    score = 35;
    recommendations.push({
      type: 'diary',
      message: 'Сегодня нет записей в дневнике. Добавьте хотя бы основные приёмы пищи.',
    });
  } else if (stats.remaining >= 0 && stats.remaining <= 200) {
    score += 10;
  } else if (stats.remaining < -300) {
    score -= 20;
    const km = kmToBurnCalories(Math.abs(stats.remaining), stats.profile.weight_kg);
    recommendations.push({
      type: 'excess',
      message: `Превышена норма на ${Math.abs(stats.remaining)} kcal. Пробежка ~${km} км поможет компенсировать.`,
    });
  } else if (stats.remaining > 500 && goal === 'lose') {
    score -= 5;
    recommendations.push({
      type: 'calories',
      message: `Осталось ${stats.remaining} kcal — следите, чтобы не перебрать к вечеру.`,
    });
  }

  if (proteinPct >= 0.85) score += 8;
  else if (proteinPct < 0.5) {
    score -= 12;
    recommendations.push({
      type: 'protein',
      message: 'Белка недостаточно. На завтрак добавьте яйца, творог или курицу.',
    });
  } else if (proteinPct < 0.7) {
    score -= 5;
    recommendations.push({
      type: 'protein',
      message: 'Сегодня белка маловато. Рекомендуем рыбу или бобовые на ужин.',
    });
  }

  if (water) {
    const waterPct = water.goal_ml > 0 ? water.consumed_ml / water.goal_ml : 0;
    if (waterPct >= 0.9) score += 7;
    else if (waterPct < 0.5) {
      score -= 8;
      const need = Math.max(0, water.goal_ml - water.consumed_ml);
      recommendations.push({
        type: 'water',
        message: `Выпейте ещё ${need} мл воды до конца дня.`,
      });
    } else if (waterPct < 0.75) {
      score -= 3;
      recommendations.push({
        type: 'water',
        message: 'Воды немного не хватает — держите бутылку под рукой.',
      });
    }
  }

  if (workout.burned_kcal >= 150) score += 8;
  else if (workout.distance_km >= 1) score += 5;
  else if (workout.burned_kcal < 50 && stats.consumed_today > 0) {
    score -= 5;
    recommendations.push({
      type: 'activity',
      message: 'Короткая пробежка 2–3 км улучшит баланс калорий и самочувствие.',
    });
  }

  const streak = stats.streak?.current_streak || 0;
  if (streak >= 7) score += 5;
  else if (streak >= 3) score += 3;

  if (weightTrend && goal === 'lose' && weightTrend.delta_kg > 0.3) {
    score -= 5;
    recommendations.push({
      type: 'weight',
      message: `Вес вырос на ${weightTrend.delta_kg} кг за неделю. Проверьте размер порций.`,
    });
  } else if (weightTrend && goal === 'gain' && weightTrend.delta_kg < -0.3) {
    recommendations.push({
      type: 'weight',
      message: 'Вес снижается — добавьте калорийный перекус после тренировки.',
    });
  }

  const meals = stats.meals || {};
  if ((meals.breakfast ?? 0) === 0 && stats.consumed_today > 500) {
    recommendations.push({
      type: 'meal',
      message: 'Завтрак не записан — не пропускайте утренний приём пищи.',
    });
  }

  if (goal === 'lose' && stats.balance > 500) {
    recommendations.push({
      type: 'weight_loss',
      message: 'Для похудения сократите потребление на 200–300 kcal или увеличьте активность.',
    });
  }

  score = clamp(score, 0, 100);

  const summaryParts = [];
  if (score >= 85) summaryParts.push('Отличный день!');
  else if (score >= 70) summaryParts.push('Хороший день.');
  else if (score >= 50) summaryParts.push('Есть над чем поработать.');
  else summaryParts.push('Сегодня цели выполнены частично.');

  if (proteinPct >= 0.8) summaryParts.push('Белка достаточно.');
  else if (proteinPct < 0.6) summaryParts.push('Белка маловато.');

  if (water && water.consumed_ml >= water.goal_ml * 0.8) summaryParts.push('С водой всё хорошо.');
  else if (water) summaryParts.push('С водой стоит поднажать.');

  if (workout.distance_km >= 3) summaryParts.push(`Пробежка ${workout.distance_km} км — отлично!`);

  const tomorrowTip = buildTomorrowTip(ctx, recommendations);

  return {
    date: ctx.date,
    score,
    summary: summaryParts.join(' '),
    recommendations: dedupeRecommendations(recommendations),
    tomorrow_tip: tomorrowTip,
  };
}

function dedupeRecommendations(items) {
  const seen = new Set();
  return items.filter((r) => {
    const key = `${r.type}:${r.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildTomorrowTip(ctx, recs) {
  if (recs.some((r) => r.type === 'activity')) {
    return 'Запланируйте пробежку 3 км до обеда — это ускорит прогресс.';
  }
  if (recs.some((r) => r.type === 'protein')) {
    return 'На завтрак заложите 25–30 г белка: яйца и творог.';
  }
  if (recs.some((r) => r.type === 'water')) {
    return 'Поставьте напоминание пить воду каждые 2 часа.';
  }
  if (ctx.stats.profile?.goal === 'lose') {
    return 'Завтра держите лёгкий дефицит 200–300 kcal и запишите всё в дневник.';
  }
  if (ctx.stats.profile?.goal === 'gain') {
    return 'Завтра добавьте плотный перекус после тренировки (+300 kcal).';
  }
  return 'Продолжайте записывать еду и активность — регулярность главное.';
}

async function enhanceWithOpenAI(context, ruleReport) {
  const apiKey = config.openai?.apiKey;
  if (!apiKey) return { ...ruleReport, source: 'rules' };

  const slimContext = {
    date: context.date,
    goal: context.stats.profile?.goal,
    consumed_kcal: context.stats.consumed_today,
    burned_kcal: context.stats.burned_today,
    remaining_kcal: context.stats.remaining,
    balance: context.stats.balance,
    protein_g: context.stats.consumed_macros?.protein_g,
    protein_goal: context.stats.macros_goal?.protein_g,
    water_ml: context.water?.consumed_ml,
    water_goal_ml: context.water?.goal_ml,
    workout_km: context.workout?.distance_km,
    workout_burned: context.workout?.burned_kcal,
    steps: context.workout?.steps,
    streak: context.stats.streak?.current_streak,
    weight_delta: context.weightTrend?.delta_kg,
    meals: context.stats.meals,
  };

  const prompt = `Ты персональный AI-диетолог приложения RunBonus (бег + питание, Центральная Азия).
На основе данных за день составь краткий отчёт на русском.
Верни ТОЛЬКО валидный JSON без markdown:
{
  "title": "краткий заголовок",
  "score": число 0-100,
  "summary": "2-3 предложения",
  "recommendations": [{"type":"water|protein|activity|meal|weight|calories|diary","message":"..."}],
  "tomorrow_tip": "один практичный совет на завтра"
}
Данные: ${JSON.stringify(slimContext)}
Базовая оценка (rules): ${ruleReport.score}. Базовые советы: ${JSON.stringify(ruleReport.recommendations)}`;

  try {
    const res = await fetch(`${config.openai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.openai.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 600,
      }),
    });

    if (!res.ok) return { ...ruleReport, source: 'rules' };

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ...ruleReport, source: 'rules' };

    const parsed = JSON.parse(jsonMatch[0]);
    const recs = Array.isArray(parsed.recommendations) && parsed.recommendations.length
      ? parsed.recommendations.filter((r) => r?.message).map((r) => ({
          type: String(r.type || 'general'),
          message: String(r.message),
        }))
      : ruleReport.recommendations;

    return {
      date: ruleReport.date,
      score: clamp(parsed.score ?? ruleReport.score, 0, 100),
      summary: String(parsed.summary || ruleReport.summary),
      recommendations: recs,
      tomorrow_tip: String(parsed.tomorrow_tip || ruleReport.tomorrow_tip),
      source: 'hybrid',
    };
  } catch (err) {
    console.warn('[nutrition/coach] OpenAI:', err.message);
    return { ...ruleReport, source: 'rules' };
  }
}

function rowToReport(row) {
  let recommendations = [];
  try {
    recommendations = typeof row.recommendations_json === 'string'
      ? JSON.parse(row.recommendations_json)
      : row.recommendations_json || [];
  } catch {
    recommendations = [];
  }
  return {
    id: row.id,
    date: row.report_date instanceof Date
      ? row.report_date.toISOString().slice(0, 10)
      : String(row.report_date).slice(0, 10),
    score: row.score,
    summary: row.summary,
    recommendations,
    tomorrow_tip: row.tomorrow_tip,
    source: row.source,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function saveReport(userId, report, context) {
  const payload = {
    recommendations: report.recommendations,
    context: {
      consumed: context.stats.consumed_today,
      burned: context.stats.burned_today,
      water_ml: context.water?.consumed_ml,
      workout_km: context.workout?.distance_km,
    },
  };

  await pool.query(
    `INSERT INTO nutrition_coach_reports
       (user_id, report_date, score, summary, recommendations_json, tomorrow_tip, context_json, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       score = VALUES(score),
       summary = VALUES(summary),
       recommendations_json = VALUES(recommendations_json),
       tomorrow_tip = VALUES(tomorrow_tip),
       context_json = VALUES(context_json),
       source = VALUES(source),
       updated_at = CURRENT_TIMESTAMP`,
    [
      userId,
      report.date,
      report.score,
      report.summary,
      JSON.stringify(report.recommendations),
      report.tomorrow_tip,
      JSON.stringify(payload.context),
      report.source || 'rules',
    ]
  );

  const [rows] = await pool.query(
    'SELECT * FROM nutrition_coach_reports WHERE user_id = ? AND report_date = ?',
    [userId, report.date]
  );
  return rowToReport(rows[0]);
}

export async function generateCoachReport(userId, { force = false, notify = false } = {}) {
  if (!(await hasCoachTable())) {
    const err = new Error('Модуль AI-диетолога не установлен');
    err.status = 503;
    throw err;
  }

  const date = todayDateStr();

  if (!force) {
    const [existing] = await pool.query(
      'SELECT * FROM nutrition_coach_reports WHERE user_id = ? AND report_date = ?',
      [userId, date]
    );
    if (existing.length) return rowToReport(existing[0]);
  }

  const context = await collectCoachContext(userId);
  const ruleReport = buildRuleBasedReport(context);
  const report = await enhanceWithOpenAI(context, ruleReport);
  const saved = await saveReport(userId, report, context);

  if (notify) {
    await notifyCoachReportReady(userId, saved);
  }

  checkAndUnlockAchievements(userId).catch(() => {});

  return saved;
}

export async function getCoachToday(userId) {
  if (!(await hasCoachTable())) {
    const err = new Error('Модуль AI-диетолога не установлен');
    err.status = 503;
    throw err;
  }

  const date = todayDateStr();
  const [rows] = await pool.query(
    'SELECT * FROM nutrition_coach_reports WHERE user_id = ? AND report_date = ?',
    [userId, date]
  );

  if (rows.length) {
    return { report: rowToReport(rows[0]), generated: false };
  }

  const report = await generateCoachReport(userId, { force: false });
  return { report, generated: true };
}

export async function getCoachHistory(userId, { limit = 14 } = {}) {
  if (!(await hasCoachTable())) {
    return { items: [] };
  }

  const lim = Math.min(Math.max(Number(limit) || 14, 1), 90);
  const [rows] = await pool.query(
    `SELECT id, report_date, score, summary, tomorrow_tip, source, created_at
     FROM nutrition_coach_reports
     WHERE user_id = ?
     ORDER BY report_date DESC
     LIMIT ?`,
    [userId, lim]
  );

  return {
    items: rows.map((r) => ({
      id: r.id,
      date: r.report_date instanceof Date
        ? r.report_date.toISOString().slice(0, 10)
        : String(r.report_date).slice(0, 10),
      score: r.score,
      summary: r.summary,
      tomorrow_tip: r.tomorrow_tip,
      source: r.source,
      created_at: r.created_at,
    })),
  };
}

export async function notifyCoachReportReady(userId, report) {
  sendPushToUser(userId, {
    title: 'AI-отчёт готов',
    body: `Оценка дня: ${report.score}/100 — ${report.summary.slice(0, 80)}`,
    data: { url: '/nutrition/coach', type: 'nutrition_coach' },
  }).catch((err) => console.warn('[nutrition/coach/push]', err.message));
}

export async function runDailyCoachForPremiumUsers() {
  if (!(await hasCoachTable())) {
    console.warn('[nutrition/coach] table missing');
    return { processed: 0 };
  }

  const [users] = await pool.query(
    `SELECT DISTINCT u.id AS user_id
     FROM users u
     INNER JOIN user_nutrition_profile p ON p.user_id = u.id AND p.onboarding_completed = 1
     INNER JOIN user_subscriptions s ON s.user_id = u.id
       AND s.status = 'active'
       AND (s.expires_at IS NULL OR s.expires_at > NOW())`
  );

  let processed = 0;
  for (const { user_id: userId } of users) {
    try {
      const premium = config.nutritionDevFree || (await isPremiumActive(userId));
      if (!premium) continue;
      await generateCoachReport(userId, { force: true, notify: true });
      processed += 1;
    } catch (err) {
      console.warn(`[nutrition/coach] user ${userId}:`, err.message);
    }
  }

  return { processed };
}
