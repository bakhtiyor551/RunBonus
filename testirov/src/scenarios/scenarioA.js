import { config } from '../config.js';
import {
  finishWorkout,
  getBonusBalance,
  getWorkoutFromHistory,
  getWorkoutPoints,
  sleep,
  startWorkout,
} from '../api.js';
import { calcTrackDistanceKm } from '../geo.js';
import { logFail, logInfo, logStep, logSuccess } from '../logger.js';
import { createTrackGenerator, waitCycle } from '../track.js';
import { createWsClient } from '../wsClient.js';

export async function runScenarioA() {
  const cycles = config.scenarioACycles;
  logInfo(`Сценарий A: «Идеальный бегун» (${cycles} циклов × ${config.cycleIntervalMs} мс)`);

  const balanceBefore = await getBonusBalance();
  logStep(`Баланс до: ${balanceBefore} сомони`);

  const { workoutId, id } = await startWorkout();
  const wid = workoutId ?? id;
  logStep(`workout_id=${wid}`);

  const ws = createWsClient(wid);
  await ws.connect();
  logStep('WebSocket подключён');

  const track = createTrackGenerator();

  for (let i = 0; i < cycles; i += 1) {
    const { point, steps } = track.next();
    await ws.sendPoints([point], steps);
    logStep(`Цикл ${i + 1}/${cycles}: lat=${point.latitude.toFixed(6)}, steps=${steps}`);
    if (i < cycles - 1) await waitCycle();
  }

  ws.disconnect();
  logStep('WebSocket закрыт');

  const distanceKm = calcTrackDistanceKm(track.allPoints);
  const finishBody = {
    points: track.allPoints,
    distance_km: distanceKm,
    duration_seconds: config.finishDurationSeconds,
    steps_count: track.totalSteps,
  };

  const finishResult = await finishWorkout(wid, finishBody);
  logStep(`POST /finish → status=${finishResult.status}`);

  await sleep(2000);

  const workout = await getWorkoutFromHistory(wid);
  const balanceAfter = await getBonusBalance();
  const dbDistance = Number(workout?.distance_km) || 0;
  const haversineDist = calcTrackDistanceKm(track.allPoints);

  const errors = [];

  if (finishResult.status !== 'approved' && workout?.status !== 'approved') {
    errors.push(`ожидался status=approved, получено finish=${finishResult.status}, history=${workout?.status}`);
  }
  if (dbDistance <= 0 && haversineDist <= 0) {
    errors.push('дистанция не рассчитана (Haversine и БД = 0)');
  }
  if (balanceAfter <= balanceBefore && !(finishResult.bonus_credited || finishResult.bonus_earned > 0)) {
    errors.push(
      `бонус не начислен (было ${balanceBefore}, стало ${balanceAfter})`
    );
  }

  if (errors.length) {
    logFail(`Ошибка в сценарии A: ${errors.join('; ')}`);
    process.exitCode = 1;
    return false;
  }

  logSuccess(
    `Сценарий A пройден. status=approved, дистанция=${dbDistance || haversineDist} км, ` +
      `бонус +${(balanceAfter - balanceBefore).toFixed(2)} сомони (баланс ${balanceAfter}).`
  );
  return true;
}
