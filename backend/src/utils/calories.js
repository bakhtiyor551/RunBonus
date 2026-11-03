/** Расчёт калорий по дистанции / времени / шагам */

export function estimateCalories(distanceKm, activeMinutes, steps = 0, weightKg = 70) {
  const w = Math.max(Number(weightKg) || 70, 40);
  const fromDist = distanceKm * w * 0.9;
  const fromTime = activeMinutes * w * 0.08;
  const fromSteps = steps * w * 0.0004;
  return Math.round(Math.max(fromDist, fromTime, fromSteps));
}
