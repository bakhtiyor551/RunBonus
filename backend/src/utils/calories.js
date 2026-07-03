/** Расчёт калорий и норм питания */

export function estimateCalories(distanceKm, activeMinutes, steps = 0, weightKg = 70) {
  const w = Math.max(Number(weightKg) || 70, 40);
  const fromDist = distanceKm * w * 0.9;
  const fromTime = activeMinutes * w * 0.08;
  const fromSteps = steps * w * 0.0004;
  return Math.round(Math.max(fromDist, fromTime, fromSteps));
}

export function calculateBMR({ weightKg, heightCm, age, gender }) {
  const w = Number(weightKg) || 70;
  const h = Number(heightCm) || 170;
  const a = Number(age) || 30;
  if (gender === 'female') {
    return Math.round(10 * w + 6.25 * h - 5 * a - 161);
  }
  return Math.round(10 * w + 6.25 * h - 5 * a + 5);
}

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function calculateTDEE(profile) {
  const bmr = calculateBMR(profile);
  const mult = ACTIVITY_MULTIPLIERS[profile.activity_level] || ACTIVITY_MULTIPLIERS.moderate;
  let tdee = Math.round(bmr * mult);
  if (profile.goal === 'lose') tdee -= 400;
  if (profile.goal === 'gain') tdee += 300;
  return Math.max(1200, tdee);
}

export function calculateMacroTargets(dailyCalories) {
  const cals = Math.max(Number(dailyCalories) || 2000, 1200);
  return {
    daily_calories: cals,
    daily_protein_g: Math.round((cals * 0.25) / 4),
    daily_fat_g: Math.round((cals * 0.3) / 9),
    daily_carbs_g: Math.round((cals * 0.45) / 4),
  };
}

export function scaleNutrients(food, grams) {
  const g = Math.max(Number(grams) || 0, 0);
  const factor = g / 100;
  return {
    calories: Math.round(Number(food.calories_per_100g) * factor),
    protein_g: Math.round(Number(food.protein_per_100g) * factor * 10) / 10,
    fat_g: Math.round(Number(food.fat_per_100g) * factor * 10) / 10,
    carbs_g: Math.round(Number(food.carbs_per_100g) * factor * 10) / 10,
    fiber_g: Math.round(Number(food.fiber_per_100g || 0) * factor * 10) / 10,
  };
}

/** Сколько км нужно пробежать, чтобы сжечь избыток калорий */
export function kmToBurnCalories(excessKcal, weightKg = 70) {
  const w = Math.max(Number(weightKg) || 70, 40);
  const kcalPerKm = w * 0.9;
  if (kcalPerKm <= 0) return 0;
  return Math.round((excessKcal / kcalPerKm) * 10) / 10;
}

export function calculateBMI(weightKg, heightCm) {
  const w = Number(weightKg) || 0;
  const h = (Number(heightCm) || 0) / 100;
  if (!w || h <= 0) return null;
  return Math.round((w / (h * h)) * 10) / 10;
}

export function bmiCategory(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return 'Недостаточный';
  if (bmi < 25) return 'Норма';
  if (bmi < 30) return 'Избыточный';
  return 'Ожирение';
}

/** Дневная норма воды (мл) */
export function calculateDailyWaterGoal(weightKg, { workoutMinutes = 0, hotWeather = false, customGoal = null } = {}) {
  if (customGoal != null && customGoal > 0) {
    return Math.min(4000, Math.max(1000, Math.round(Number(customGoal))));
  }
  const base = Math.round(Math.max(Number(weightKg) || 70, 40) * 33);
  let goal = base;
  if (workoutMinutes > 30) goal += 500;
  if (hotWeather) goal += 300;
  return Math.min(4000, Math.max(1500, goal));
}
