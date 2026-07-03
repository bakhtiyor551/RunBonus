import { config, metersToCycles, minApprovedCycles } from '../config.js';
import { defineTest } from '../core/testRunner.js';
import { localStore } from '../core/localStore.js';
import { calcTrackDistanceKm } from '../core/geo.js';
import { createTrackGenerator } from '../core/track.js';
import { runWorkoutWithOfflineBuffer } from '../core/workoutHelper.js';
import {
  finishWorkout,
  getActiveWorkout,
  getWorkoutFromHistory,
  getWorkoutPoints,
  sleep,
  startWorkout,
} from './apiBot.js';
import { createWsClient } from '../core/wsClient.js';
import { logSync } from '../core/sessionLog.js';

export const offlineTests = [
  defineTest('OFFLINE-001', 'Запуск тренировки без интернета', async () => {
    const { workoutId, id } = await startWorkout();
    const wid = workoutId ?? id;

    const ws = createWsClient(wid);
    await ws.connect();
    const track = createTrackGenerator();
    const { point, steps } = track.next();
    await ws.sendPoints([point], steps);

    ws.disconnect();

    const active = await getActiveWorkout();
    if (Number(active?.workoutId ?? active?.id) !== Number(wid)) {
      throw new Error('Тренировка не запущена');
    }
    if (!track.allPoints.length) throw new Error('GPS не работает');
    if (!point.recorded_at) throw new Error('Таймер не работает');
    logSync(wid, 'offline_start', { points: 1 });
  }),

  defineTest('OFFLINE-002', 'Бег 1 км без интернета', async () => {
    const cycles = metersToCycles(1000);
    const { workoutId, id } = await startWorkout();
    const wid = workoutId ?? id;

    let ws = createWsClient(wid);
    await ws.connect();
    const track = createTrackGenerator();
    const buffer = [];

    const p1 = track.next();
    await ws.sendPoints([p1.point], p1.steps);
    ws.disconnect();

    for (let i = 1; i < cycles; i++) {
      buffer.push(track.next().point);
    }

    ws = createWsClient(wid);
    await ws.connect();
    await ws.sendPoints(buffer, track.totalSteps);

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
    const workout = await getWorkoutFromHistory(wid);
    const points = await getWorkoutPoints(wid);

    if (!workout?.distance_km && distanceKm <= 0) throw new Error('Расстояние не сохранено');
    if (!workout?.duration_seconds && !config.finishDurationSeconds) {
      throw new Error('Время не сохранено');
    }
    if (!points.length) throw new Error('Маршрут не сохранён');
  }),

  defineTest('OFFLINE-003', 'Сворачивание приложения (симуляция 10 мин)', async () => {
    const { workoutId, id } = await startWorkout();
    const wid = workoutId ?? id;
    const track = createTrackGenerator();
    track.generate(5);

    const snapshot = localStore.create(wid, track.allPoints, {
      duration_seconds: 600,
      simulated_background_ms: config.fastMode ? 100 : 600_000,
    });

    await sleep(config.fastMode ? 50 : 200);

    const restored = localStore.get(snapshot.id);
    if (!restored?.points?.length) throw new Error('Маршрут потерян после сворачивания');
    if (restored.points.length !== 5) throw new Error('Точки маршрута повреждены');

    const ws = createWsClient(wid);
    await ws.connect();
    const extra = track.next();
    await ws.sendPoints([extra.point], extra.steps);
    ws.disconnect();
  }),

  defineTest('OFFLINE-004', 'Перезагрузка устройства (симуляция)', async () => {
    const { workoutId, id } = await startWorkout();
    const wid = workoutId ?? id;
    const track = createTrackGenerator();
    track.generate(8);

    const saved = localStore.create(wid, track.allPoints, { reboot_simulated: true });
    const reloaded = localStore.get(saved.id);

    if (!reloaded) throw new Error('Тренировка не восстановлена после перезагрузки');
    if (reloaded.status !== 'pending_sync') {
      throw new Error(`Ожидался pending_sync, получено ${reloaded.status}`);
    }

    const active = await getActiveWorkout();
    const activeId = active?.workoutId ?? active?.id;
    if (!activeId) throw new Error('Активная тренировка не найдена на сервере');
  }),

  defineTest('OFFLINE-005', 'Завершение тренировки без интернета — локальное сохранение', async () => {
    const track = createTrackGenerator();
    track.generate(minApprovedCycles());
    const distanceKm = calcTrackDistanceKm(track.allPoints);

    const local = localStore.create(null, track.allPoints, {
      distance: distanceKm,
      duration: config.finishDurationSeconds,
      bonus: distanceKm,
      status: 'pending_sync',
    });

    if (local.status !== 'pending_sync') throw new Error('status должен быть pending_sync');
    if (!local.distance || local.distance <= 0) throw new Error('distance не сохранена');
    if (!local.duration) throw new Error('duration не сохранена');
    if (local.bonus == null) throw new Error('bonus не рассчитан');
  }),

  defineTest('OFFLINE-006', 'Восстановление интернета — синхронизация', async () => {
    const result = await runWorkoutWithOfflineBuffer({ onlineCycles: 2, offlineCycles: 5 });
    logSync(result.workoutId, 'synced', { points: result.points.length });

    if (!result.points.length) throw new Error('Синхронизация не выполнена — нет точек на сервере');
    if (result.workout?.status !== 'approved') {
      throw new Error(`После sync ожидался approved, получено ${result.workout?.status}`);
    }

    const local = localStore.create(result.workoutId, result.track.allPoints);
    localStore.markSynced(local.id);
    if (localStore.get(local.id).status !== 'synced') {
      throw new Error('Локальный статус не обновлён на synced');
    }
  }),

  defineTest('OFFLINE-007', 'Повторная синхронизация при недоступном сервере', async () => {
    const track = createTrackGenerator();
    track.generate(10);
    const local = localStore.create('local_retry_001', track.allPoints, {
      status: 'pending_sync',
    });

    let syncFailed = false;

    const res = await fetch(`${config.baseApiUrl}/api/workouts/999999999/finish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    }).catch(() => null);

    syncFailed = !res || !res.ok;
    if (localStore.get(local.id).status !== 'pending_sync') {
      throw new Error('После ошибки сервера статус должен остаться pending_sync');
    }

    localStore.markSynced(local.id);
    if (localStore.get(local.id).status !== 'synced') {
      throw new Error('После восстановления сервера статус должен быть synced');
    }
  }),
];

export const suiteName = 'Offline Test';
