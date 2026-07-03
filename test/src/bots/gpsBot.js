import { config } from '../config.js';
import { startWorkout } from './apiBot.js';
import { defineTest } from '../core/testRunner.js';
import { createTrackGenerator } from '../core/track.js';
import { createWsClient } from '../core/wsClient.js';
import { getWorkoutPoints, sleep } from './apiBot.js';

export const gpsTests = [
  defineTest('GPS-001', 'Получение координат', async () => {
    const { workoutId, id } = await startWorkout();
    const wid = workoutId ?? id;
    const ws = createWsClient(wid);
    await ws.connect();

    const track = createTrackGenerator();
    const { point, steps } = track.next();
    const ack = await ws.sendPoints([point], steps);

    if (!ack || ack.ok === false) throw new Error('GPS точка не принята сервером');
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
      throw new Error('Координаты не получены');
    }

    ws.disconnect();
    await sleep(500);
    const points = await getWorkoutPoints(wid);
    if (!points.length) throw new Error('Точка не сохранена в БД');
  }),

  defineTest('GPS-002', 'Точность GPS ≤ 20 м', async () => {
    const { workoutId, id } = await startWorkout();
    const wid = workoutId ?? id;
    const ws = createWsClient(wid);
    await ws.connect();

    const track = createTrackGenerator();
    const good = track.next({ accuracy: 8 });
    const ack = await ws.sendPoints([good.point], good.steps);
    if (!ack) throw new Error('Точка с accuracy=8 не принята');

    const bad = track.next({ accuracy: 50 });
    try {
      await ws.sendPoints([bad.point], bad.steps);
    } catch {
      /* сервер может отклонить */
    }

    ws.disconnect();
    const points = await getWorkoutPoints(wid);
    const hasGood = points.some((p) => Number(p.accuracy) <= config.maxGpsAccuracyM);
    if (!hasGood) throw new Error(`Нет точек с accuracy ≤ ${config.maxGpsAccuracyM} м`);
  }),

  defineTest('GPS-003', 'Потеря GPS — тренировка активна', async () => {
    const { workoutId, id } = await startWorkout();
    const wid = workoutId ?? id;
    const ws = createWsClient(wid);
    await ws.connect();

    const track = createTrackGenerator();
    const { point, steps } = track.next();
    await ws.sendPoints([point], steps);

    ws.disconnect();
    await sleep(1000);

    const active = await import('./apiBot.js').then((m) => m.getActiveWorkout());
    const activeId = active?.workoutId ?? active?.id;
    if (Number(activeId) !== Number(wid)) {
      throw new Error('Тренировка не активна после потери GPS/связи');
    }
  }),

  defineTest('GPS-004', 'Возврат GPS — тренировка продолжается', async () => {
    const { workoutId, id } = await startWorkout();
    const wid = workoutId ?? id;

    let ws = createWsClient(wid);
    await ws.connect();
    const track = createTrackGenerator();
    const p1 = track.next();
    await ws.sendPoints([p1.point], p1.steps);
    ws.disconnect();

    await sleep(500);
    ws = createWsClient(wid);
    await ws.connect();
    const p2 = track.next();
    const ack = await ws.sendPoints([p2.point], p2.steps);
    ws.disconnect();

    if (!ack) throw new Error('Точка после восстановления GPS не принята');
    const points = await getWorkoutPoints(wid);
    if (points.length < 2) throw new Error('Маршрут не продолжен после восстановления GPS');
  }),
];

export const suiteName = 'GPS Test';
