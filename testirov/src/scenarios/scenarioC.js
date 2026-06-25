import {
  getWorkoutFromHistory,
  sleep,
  startWorkout,
} from '../api.js';
import { offsetNorthMeters } from '../geo.js';
import { logFail, logInfo, logStep, logSuccess } from '../logger.js';
import { createTrackGenerator, waitCycle } from '../track.js';
import { createWsClient } from '../wsClient.js';

const FRAUD_SPEED_KMH = 200;
const JUMP_METERS = 500;

export async function runScenarioC() {
  logInfo('Сценарий C: «Поимка читера» (антифрод)');

  const { workoutId, id } = await startWorkout();
  const wid = workoutId ?? id;
  logStep(`workout_id=${wid}`);

  const ws = createWsClient(wid);
  await ws.connect();
  logStep('WebSocket подключён');

  const track = createTrackGenerator();

  // 2 нормальные точки (~10 км/ч)
  for (let i = 0; i < 2; i += 1) {
    const { point, steps } = track.next();
    await ws.sendPoints([point], steps);
    logStep(`Нормальная точка ${i + 1}/2`);
    await waitCycle();
  }

  // 3-я точка: скачок 500 м + аномальная скорость
  const prev = track.allPoints[track.allPoints.length - 1];
  const jumped = offsetNorthMeters(prev.latitude, prev.longitude, JUMP_METERS);
  const { point: fraudPoint, steps } = track.next({
    latitude: jumped.latitude,
    longitude: jumped.longitude,
    speed: FRAUD_SPEED_KMH,
  });

  logStep(
    `Атака: скачок ${JUMP_METERS} м, speed=${FRAUD_SPEED_KMH} км/ч ` +
      `(lat ${fraudPoint.latitude.toFixed(6)})`
  );

  const forceStopPromise = ws.waitForForceStop(3000);
  const fraudSentAt = Date.now();

  try {
    await ws.sendPoints([fraudPoint], steps);
  } catch {
    /* сервер может закрыть сокет до ack */
  }

  let elapsedMs;
  try {
    await forceStopPromise;
    elapsedMs = (ws.forceStopAt || Date.now()) - fraudSentAt;
    logStep(`workout_force_stop за ${(elapsedMs / 1000).toFixed(2)} с после атаки`);
  } catch (err) {
    logFail(`Ошибка в сценарии C: ${err.message}`);
    process.exitCode = 1;
    return false;
  }

  await sleep(1000);

  const workout = await getWorkoutFromHistory(wid);
  const status = workout?.status;
  const okStatus = status === 'rejected' || status === 'suspicious';

  if (!okStatus) {
    logFail(
      `Ошибка в сценарии C: ожидался status rejected/suspicious, получено ${status ?? 'null'}`
    );
    process.exitCode = 1;
    return false;
  }

  if (elapsedMs > 1000) {
    logFail(
      `Ошибка в сценарии C: workout_force_stop пришёл позже 1 с (${(elapsedMs / 1000).toFixed(2)} с)`
    );
    process.exitCode = 1;
    return false;
  }

  logSuccess(
    `Сценарий C пройден. Сервер успешно заблокировал читера за ${(elapsedMs / 1000).toFixed(1)} с. ` +
      `status=${status}.`
  );
  return true;
}
