import { pool } from '../db.js';
import { config } from '../config.js';
import { sendPushToUser } from './pushNotificationService.js';
import { isPremiumActive } from './subscriptionService.js';
import { calculateDailyWaterGoal } from '../utils/calories.js';

async function listNutritionPremiumUserIds() {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT u.id AS user_id
       FROM users u
       INNER JOIN user_nutrition_profile p ON p.user_id = u.id AND p.onboarding_completed = 1
       INNER JOIN user_subscriptions s ON s.user_id = u.id
         AND s.status = 'active'
         AND (s.expires_at IS NULL OR s.expires_at > NOW())`
    );
    return rows.map((r) => r.user_id);
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}

async function hasMealToday(userId, mealType) {
  const [rows] = await pool.query(
    `SELECT 1 FROM nutrition_logs
     WHERE user_id = ? AND meal_type = ? AND DATE(logged_at) = CURDATE()
     LIMIT 1`,
    [userId, mealType]
  );
  return rows.length > 0;
}

async function getTodayProteinPct(userId) {
  const [profileRows] = await pool.query(
    'SELECT daily_protein_g FROM user_nutrition_profile WHERE user_id = ?',
    [userId]
  );
  const goal = Number(profileRows[0]?.daily_protein_g) || 80;
  const [consumed] = await pool.query(
    `SELECT COALESCE(SUM(protein_g), 0) AS p FROM nutrition_logs
     WHERE user_id = ? AND DATE(logged_at) = CURDATE()`,
    [userId]
  );
  const eaten = Number(consumed[0]?.p) || 0;
  return goal > 0 ? eaten / goal : 1;
}

async function getTodayWaterPct(userId) {
  try {
    const [profileRows] = await pool.query(
      'SELECT weight_kg, daily_water_ml FROM user_nutrition_profile WHERE user_id = ?',
      [userId]
    );
    const profile = profileRows[0];
    if (!profile) return 1;

    let goal = Number(profile.daily_water_ml) || 0;
    if (!goal) {
      goal = calculateDailyWaterGoal(Number(profile.weight_kg) || 70, 0);
    }

    const [consumed] = await pool.query(
      `SELECT COALESCE(SUM(amount_ml), 0) AS ml FROM nutrition_water_logs
       WHERE user_id = ? AND DATE(logged_at) = CURDATE()`,
      [userId]
    );
    const ml = Number(consumed[0]?.ml) || 0;
    return goal > 0 ? ml / goal : 1;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return 1;
    throw e;
  }
}

async function sendIfPremium(userId, payload) {
  const premium = config.nutritionDevFree || (await isPremiumActive(userId));
  if (!premium) return false;
  await sendPushToUser(userId, payload).catch((err) => {
    console.warn(`[nutrition/reminders] user ${userId}:`, err.message);
  });
  return true;
}

export async function runBreakfastReminders() {
  const userIds = await listNutritionPremiumUserIds();
  let sent = 0;
  for (const userId of userIds) {
    const hasBreakfast = await hasMealToday(userId, 'breakfast');
    if (hasBreakfast) continue;
    const ok = await sendIfPremium(userId, {
      title: 'RunBonus+ Питание',
      body: 'Не забудьте записать завтрак',
      data: { url: '/nutrition', type: 'nutrition_breakfast' },
    });
    if (ok) sent += 1;
  }
  return { sent, slot: 'breakfast' };
}

export async function runLunchReminders() {
  const userIds = await listNutritionPremiumUserIds();
  let sent = 0;
  for (const userId of userIds) {
    const hasLunch = await hasMealToday(userId, 'lunch');
    if (hasLunch) continue;
    const ok = await sendIfPremium(userId, {
      title: 'RunBonus+ Питание',
      body: 'Пора записать обед в дневник',
      data: { url: '/nutrition', type: 'nutrition_lunch' },
    });
    if (ok) sent += 1;
  }
  return { sent, slot: 'lunch' };
}

export async function runWaterReminders() {
  const userIds = await listNutritionPremiumUserIds();
  let sent = 0;
  for (const userId of userIds) {
    const pct = await getTodayWaterPct(userId);
    if (pct >= 0.5) continue;
    const ok = await sendIfPremium(userId, {
      title: 'RunBonus+ Вода',
      body: 'Сегодня выпито меньше половины нормы — самое время попить',
      data: { url: '/nutrition/water', type: 'nutrition_water' },
    });
    if (ok) sent += 1;
  }
  return { sent, slot: 'water' };
}

export async function runProteinReminders() {
  const userIds = await listNutritionPremiumUserIds();
  let sent = 0;
  for (const userId of userIds) {
    const pct = await getTodayProteinPct(userId);
    if (pct >= 0.5) continue;
    const ok = await sendIfPremium(userId, {
      title: 'RunBonus+ Питание',
      body: 'Сегодня мало белка — добавьте курицу, рыбу или яйца',
      data: { url: '/nutrition', type: 'nutrition_protein' },
    });
    if (ok) sent += 1;
  }
  return { sent, slot: 'protein' };
}

export async function runMiddayReminders() {
  const lunch = await runLunchReminders();
  const water = await runWaterReminders();
  return { sent: lunch.sent + water.sent, lunch: lunch.sent, water: water.sent };
}

const SLOTS = {
  breakfast: runBreakfastReminders,
  lunch: runLunchReminders,
  water: runWaterReminders,
  protein: runProteinReminders,
  midday: runMiddayReminders,
};

export async function runNutritionReminders(slot) {
  const fn = SLOTS[slot];
  if (!fn) {
    const err = new Error(`Unknown slot: ${slot}. Use: ${Object.keys(SLOTS).join(', ')}`);
    err.status = 400;
    throw err;
  }
  return fn();
}

export function slotForHour(hour) {
  if (hour === 10) return 'breakfast';
  if (hour === 14) return 'midday';
  if (hour === 18) return 'protein';
  return null;
}
