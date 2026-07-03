import { config, minApprovedCycles } from '../config.js';
import { defineTest } from '../core/testRunner.js';
import { runWorkoutWithOfflineBuffer } from '../core/workoutHelper.js';
import {
  finishWorkout,
  getBonusBalance,
  getWorkoutFromHistory,
  getWorkoutPoints,
  sleep,
  startWorkout,
} from './apiBot.js';
import { createTrackGenerator } from '../core/track.js';
import { createWsClient } from '../core/wsClient.js';
import { calcTrackDistanceKm } from '../core/geo.js';
import { logSync } from '../core/sessionLog.js';

export const syncTests = [
  defineTest('SYNC-001', 'Отправка маршрута после появления интернета', async () => {
    const result = await runWorkoutWithOfflineBuffer();
    logSync(result.workoutId, 'route_synced', { distance: result.distanceKm });

    if (!result.points.length) throw new Error('Маршрут не отправлен');
    if (result.points.length < 7) throw new Error('Недостаточно GPS точек после sync');
  }),

  defineTest('SYNC-002', 'Отправка бонусов после синхронизации', async () => {
    const balanceBefore = await getBonusBalance();
    const result = await runWorkoutWithOfflineBuffer();

    if (result.workout?.status !== 'approved') {
      throw new Error(`Тренировка не approved: ${result.workout?.status}`);
    }

    const balanceAfter = await getBonusBalance();
    const credited =
      balanceAfter > balanceBefore ||
      Number(result.workout?.calculated_bonus) > 0 ||
      Number(result.finishResult?.bonus_earned) > 0;

    if (!credited) throw new Error('Бонусы не начислены после синхронизации');
    logSync(result.workoutId, 'bonus_synced', { balanceBefore, balanceAfter });
  }),

  defineTest('SYNC-003', 'Отправка статистики (distance, duration)', async () => {
    const result = await runWorkoutWithOfflineBuffer();
    const w = result.workout;

    if (!w?.distance_km || Number(w.distance_km) <= 0) {
      throw new Error('Статистика distance не синхронизирована');
    }
    if (!w?.duration_seconds && !config.finishDurationSeconds) {
      throw new Error('Статистика duration не синхронизирована');
    }
  }),

  defineTest('SYNC-004', 'Отправка GPS точек', async () => {
    const { workoutId, id } = await startWorkout();
    const wid = workoutId ?? id;

    let ws = createWsClient(wid);
    await ws.connect();
    const track = createTrackGenerator();
    const offline = [];

    for (let i = 0; i < 3; i++) {
      const { point, steps } = track.next();
      await ws.sendPoints([point], steps);
    }

    ws.disconnect();
    for (let i = 0; i < 5; i++) offline.push(track.next().point);

    ws = createWsClient(wid);
    await ws.connect();
    await ws.sendPoints(offline, track.totalSteps);

    while (track.allPoints.length < minApprovedCycles()) {
      const { point, steps } = track.next();
      await ws.sendPoints([point], steps);
    }
    ws.disconnect();

    const distanceKm = calcTrackDistanceKm(track.allPoints);
    await finishWorkout(wid, {
      points: track.allPoints,
      distance_km: distanceKm,
      duration_seconds: config.finishDurationSeconds,
      steps_count: track.totalSteps,
    });

    await sleep(1500);
    const points = await getWorkoutPoints(wid);
    if (points.length < 8) throw new Error(`GPS точки не синхронизированы: ${points.length}`);
  }),

  defineTest('SYNC-005', 'Повторная синхронизация при сбое', async () => {
    const result = await runWorkoutWithOfflineBuffer({ onlineCycles: 1, offlineCycles: 6 });
    const w1 = await getWorkoutFromHistory(result.workoutId);
    const w2 = await getWorkoutFromHistory(result.workoutId);

    if (!w1 || !w2) throw new Error('Данные тренировки недоступны после sync');
    if (w1.status !== w2.status) throw new Error('Статус изменился при повторном чтении');
  }),
];

export const suiteName = 'Sync Test';
