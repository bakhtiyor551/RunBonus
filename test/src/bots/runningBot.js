import { config, metersToCycles } from '../config.js';
import { defineTest } from '../core/testRunner.js';
import { calcTrackDistanceKm } from '../core/geo.js';
import { computeAvgSpeedKmh, assertApprox } from '../core/metrics.js';
import { createTrackGenerator } from '../core/track.js';
import { finishWorkout, startWorkout } from './apiBot.js';
import { createWsClient } from '../core/wsClient.js';

const RUN_TARGETS = [
  { id: 'RUN-001', meters: 100, tolerance: 25 },
  { id: 'RUN-002', meters: 500, tolerance: 15 },
  { id: 'RUN-003', meters: 1000, tolerance: 12 },
  { id: 'RUN-004', meters: 5000, tolerance: 10 },
  { id: 'RUN-005', meters: 10000, tolerance: 8 },
];

function buildRunningTest({ id, meters, tolerance }) {
  return defineTest(id, `Бег ${meters >= 1000 ? `${meters / 1000} км` : `${meters} м`}`, async () => {
    const cycles = metersToCycles(meters);
    const { workoutId, id: wid } = await startWorkout();
    const workoutIdNum = workoutId ?? wid;

    const ws = createWsClient(workoutIdNum);
    await ws.connect();
    const track = createTrackGenerator();

    for (let i = 0; i < cycles; i++) {
      const { point, steps } = track.next();
      await ws.sendPoints([point], steps);
    }
    ws.disconnect();

    const distanceKm = calcTrackDistanceKm(track.allPoints);
    const distanceM = distanceKm * 1000;
    const duration = config.finishDurationSeconds;
    const avgSpeed = computeAvgSpeedKmh(distanceKm, duration);

    const distCheck = assertApprox(distanceM, meters, tolerance);
    if (!distCheck.ok) throw new Error(`distance: ${distCheck.message}`);

    if (distanceKm <= 0) throw new Error('distance = 0');
    if (avgSpeed <= 0) throw new Error('speed = 0');
    if (duration <= 0) throw new Error('time = 0');

    const finishResult = await finishWorkout(workoutIdNum, {
      points: track.allPoints,
      distance_km: distanceKm,
      duration_seconds: duration,
      steps_count: track.totalSteps,
    });

    if (meters >= 500 && finishResult.status !== 'approved') {
      throw new Error(`Ожидался approved для ${meters}м, получено ${finishResult.status}`);
    }
  });
}

export const runningTests = [
  ...RUN_TARGETS.map(buildRunningTest),

  defineTest('RUN-PAUSE', 'Пауза и продолжение тренировки', async () => {
    const { workoutId, id } = await startWorkout();
    const wid = workoutId ?? id;
    const ws = createWsClient(wid);
    await ws.connect();
    const track = createTrackGenerator();

    const p1 = track.next();
    await ws.sendPoints([p1.point], p1.steps);

    await new Promise((r) => setTimeout(r, config.fastMode ? 50 : 2000));

    const p2 = track.next();
    const ack = await ws.sendPoints([p2.point], p2.steps);
    ws.disconnect();

    if (!ack) throw new Error('Тренировка не продолжилась после паузы');
    const dist = calcTrackDistanceKm(track.allPoints);
    if (dist <= 0) throw new Error('Дистанция не рассчитана после паузы');
  }),
];

export const suiteName = 'Running Test';
