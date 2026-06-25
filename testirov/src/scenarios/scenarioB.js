import { config } from '../config.js';
import {
  finishWorkout,
  getWorkoutFromHistory,
  getWorkoutPoints,
  sleep,
  startWorkout,
} from '../api.js';
import { calcTrackDistanceKm, haversineKm } from '../geo.js';
import { logFail, logInfo, logStep, logSuccess } from '../logger.js';
import { createTrackGenerator, waitCycle } from '../track.js';
import { createWsClient } from '../wsClient.js';

const MAX_GAP_KM = 0.08;

export async function runScenarioB() {
  logInfo('Сценарий B: «Проверка оффлайн-буфера»');

  const { workoutId, id } = await startWorkout();
  const wid = workoutId ?? id;
  logStep(`workout_id=${wid}`);

  let ws = createWsClient(wid);
  await ws.connect();
  logStep('WebSocket подключён');

  const track = createTrackGenerator();
  const offlineBuffer = [];

  // Фаза 1: 3 точки штатно
  for (let i = 0; i < 3; i += 1) {
    const { point, steps } = track.next();
    await ws.sendPoints([point], steps);
    logStep(`Онлайн цикл ${i + 1}/3`);
    await waitCycle();
  }

  // Цикл 4: обрыв связи
  logStep('Имитация обрыва связи (disconnect)');
  ws.disconnect();
  ws = null;

  // Циклы 4–7: накопление в offline_buffer (4 точки)
  for (let i = 0; i < 4; i += 1) {
    const { point, steps } = track.next();
    offlineBuffer.push(point);
    logStep(`Буфер ${i + 1}/4: lat=${point.latitude.toFixed(6)}, steps=${steps}`);
    await waitCycle();
  }

  // Reconnect + batch upload
  ws = createWsClient(wid);
  await ws.connect();
  logStep(`Связь восстановлена, выгрузка пакета (${offlineBuffer.length} точек)`);
  await ws.sendPoints(offlineBuffer, track.totalSteps);

  // Ещё 2 цикла штатно (по ТЗ)
  for (let i = 0; i < 2; i += 1) {
    const { point, steps } = track.next();
    await ws.sendPoints([point], steps);
    logStep(`Онлайн после буфера ${i + 1}/2`);
    await waitCycle();
  }

  // Доп. точки для min 0.5 км на бэкенде (не часть сценария буфера)
  const minPoints = Number(process.env.SCENARIO_B_MIN_POINTS || 45);
  while (track.allPoints.length < minPoints) {
    const { point, steps } = track.next();
    await ws.sendPoints([point], steps);
    await waitCycle();
  }

  ws.disconnect();

  const distanceKm = calcTrackDistanceKm(track.allPoints);
  await finishWorkout(wid, {
    points: track.allPoints,
    distance_km: distanceKm,
    duration_seconds: config.finishDurationSeconds,
    steps_count: track.totalSteps,
  });

  await sleep(2000);

  const workout = await getWorkoutFromHistory(wid);
  const dbPoints = await getWorkoutPoints(wid);

  const errors = [];

  if (workout?.status !== 'approved') {
    errors.push(`ожидался status=approved, получено ${workout?.status}`);
  }

  const expectedMinPoints = 7;
  if (dbPoints.length < expectedMinPoints) {
    errors.push(
      `точки из оффлайн-буфера были утеряны сервером (в БД ${dbPoints.length}, ожидалось ≥${expectedMinPoints})`
    );
  }

  for (let i = 1; i < dbPoints.length; i += 1) {
    const prev = dbPoints[i - 1];
    const cur = dbPoints[i];
    const gapKm = haversineKm(
      Number(prev.latitude),
      Number(prev.longitude),
      Number(cur.latitude),
      Number(cur.longitude)
    );
    if (gapKm > MAX_GAP_KM) {
      errors.push(`разрыв трека между точками ${i} и ${i + 1}: ${(gapKm * 1000).toFixed(0)} м`);
      break;
    }
  }

  const dbDistance = Number(workout?.distance_km) || 0;
  if (dbDistance <= 0) {
    errors.push('дистанция за время оффлайна не зачтена (distance_km=0)');
  }

  if (errors.length) {
    logFail(`Ошибка в сценарии B: ${errors.join('; ')}`);
    process.exitCode = 1;
    return false;
  }

  logSuccess(
    `Сценарий B пройден. status=approved, точек=${dbPoints.length}, дистанция=${dbDistance} км, разрывов нет.`
  );
  return true;
}
