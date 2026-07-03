import { config } from '../config.js';
import { defineTest } from '../core/testRunner.js';
import { createTrackGenerator } from '../core/track.js';
import { createWsClient } from '../core/wsClient.js';
import { offsetNorthMeters } from '../core/geo.js';
import {
  getWorkoutFromHistory,
  sleep,
  startWorkout,
} from './apiBot.js';

async function runFraudAttack({ speedKmh, jumpMeters, teleport, label }) {
  const { workoutId, id } = await startWorkout();
  const wid = workoutId ?? id;
  const ws = createWsClient(wid);
  await ws.connect();

  const track = createTrackGenerator();

  for (let i = 0; i < 2; i++) {
    const { point, steps } = track.next();
    await ws.sendPoints([point], steps);
  }

  let fraudPoint;
  if (teleport) {
    fraudPoint = track.next({
      latitude: config.khujand.lat,
      longitude: config.khujand.lng,
      speed: speedKmh ?? 120,
    });
  } else {
    const prev = track.allPoints[track.allPoints.length - 1];
    const jumped = offsetNorthMeters(prev.latitude, prev.longitude, jumpMeters ?? 500);
    fraudPoint = track.next({
      latitude: jumped.latitude,
      longitude: jumped.longitude,
      speed: speedKmh ?? 200,
    });
  }

  const forceStopPromise = ws.waitForForceStop(5000);
  try {
    await ws.sendPoints([fraudPoint.point], fraudPoint.steps);
  } catch {
    /* сокет может закрыться */
  }

  let forceStopReceived = false;
  try {
    await forceStopPromise;
    forceStopReceived = true;
  } catch {
    /* проверим статус в истории */
  }

  await sleep(1500);
  const workout = await getWorkoutFromHistory(wid);
  const status = workout?.status;
  const rejected =
    forceStopReceived ||
    status === 'rejected' ||
    status === 'suspicious';

  if (!rejected) {
    throw new Error(
      `${label}: ожидалось отклонение/fraud, status=${status ?? 'null'}, forceStop=${forceStopReceived}`
    );
  }

  ws.disconnect();
  return { wid, status, forceStopReceived };
}

export const fraudTests = [
  defineTest('FRAUD-001', 'Автомобиль ~60 км/ч — тренировка отклонена', async () => {
    await runFraudAttack({ speedKmh: 65, jumpMeters: 30, label: 'Автомобиль' });
  }),

  defineTest('FRAUD-002', 'Мотоцикл 80 км/ч — тренировка отклонена', async () => {
    await runFraudAttack({ speedKmh: 80, jumpMeters: 50, label: 'Мотоцикл' });
  }),

  defineTest('FRAUD-003', 'Телепортация Душанбе → Худжанд', async () => {
    const { workoutId, id } = await startWorkout();
    const wid = workoutId ?? id;
    const ws = createWsClient(wid);
    await ws.connect();

    const track = createTrackGenerator({
      startLat: config.dushanbe.lat,
      startLng: config.dushanbe.lng,
    });

    const p1 = track.next();
    await ws.sendPoints([p1.point], p1.steps);

    const fraud = track.next({
      latitude: config.khujand.lat,
      longitude: config.khujand.lng,
      speed: 15,
    });

    const forceStopPromise = ws.waitForForceStop(5000);
    try {
      await ws.sendPoints([fraud.point], fraud.steps);
    } catch {
      /* */
    }

    let detected = false;
    try {
      await forceStopPromise;
      detected = true;
    } catch {
      /* */
    }

    await sleep(1500);
    const workout = await getWorkoutFromHistory(wid);
    const ok =
      detected ||
      workout?.status === 'rejected' ||
      workout?.status === 'suspicious';

    ws.disconnect();
    if (!ok) throw new Error('Fraud (телепортация) не обнаружен');
  }),

  defineTest('FRAUD-004', 'Fake GPS — подмена координат', async () => {
    const { workoutId, id } = await startWorkout();
    const wid = workoutId ?? id;
    const ws = createWsClient(wid);
    await ws.connect();

    const track = createTrackGenerator();
    track.next();

    const fake = track.next({
      latitude: config.startLat + 5,
      longitude: config.startLng + 5,
      speed: 150,
      accuracy: 1,
    });

    const forceStopPromise = ws.waitForForceStop(5000);
    try {
      await ws.sendPoints([fake.point], fake.steps);
    } catch {
      /* */
    }

    let detected = false;
    try {
      await forceStopPromise;
      detected = true;
    } catch {
      /* */
    }

    await sleep(1500);
    const workout = await getWorkoutFromHistory(wid);
    ws.disconnect();

    const ok =
      detected ||
      workout?.status === 'rejected' ||
      workout?.status === 'suspicious';

    if (!ok) throw new Error('Fake GPS не обнаружен');
  }),
];

export const suiteName = 'Fraud Test';
