import { config, minApprovedCycles } from '../config.js';
import {
  finishWorkout,
  getActiveWorkout,
  getWorkoutFromHistory,
  getWorkoutPoints,
  sleep,
  startWorkout,
} from '../bots/apiBot.js';
import { calcTrackDistanceKm } from '../core/geo.js';
import { createTrackGenerator, waitCycle } from '../core/track.js';
import { createWsClient } from '../core/wsClient.js';
import { logGps } from '../core/sessionLog.js';

/** Завершить зависшую in_progress тренировку перед следующим тестом. */
export async function cleanupActiveWorkout() {
  try {
    const active = await getActiveWorkout();
    const wid = active?.workoutId ?? active?.id;
    if (!wid) return;

    const track = createTrackGenerator();
    track.generate(2);
    await finishWorkout(wid, {
      points: track.allPoints,
      distance_km: 0.01,
      duration_seconds: 60,
      steps_count: track.totalSteps,
    });
    await sleep(300);
  } catch {
    /* тренировка уже закрыта */
  }
}

/**
 * Общий хелпер: старт → N циклов GPS → finish.
 */
export async function runWorkoutTrack({
  cycles,
  waitBetween = false,
  speedKmh,
  onCycle,
  startWorkoutFn = startWorkout,
} = {}) {
  const n = cycles ?? minApprovedCycles();
  const { workoutId, id } = await startWorkoutFn();
  const wid = workoutId ?? id;

  const ws = createWsClient(wid);
  await ws.connect();

  const track = createTrackGenerator(speedKmh != null ? { speedKmh } : {});

  for (let i = 0; i < n; i++) {
    const { point, steps } = track.next();
    const ack = await ws.sendPoints([point], steps);
    logGps(wid, point, { cycle: i + 1, ack });
    onCycle?.({ i, point, steps, ack, wid });
    if (waitBetween && i < n - 1) await waitCycle();
  }

  ws.disconnect();

  const distanceKm = calcTrackDistanceKm(track.allPoints);
  const finishBody = {
    points: track.allPoints,
    distance_km: distanceKm,
    duration_seconds: config.finishDurationSeconds,
    steps_count: track.totalSteps,
  };

  const finishResult = await finishWorkout(wid, finishBody);
  await sleep(1500);

  const workout = await getWorkoutFromHistory(wid);
  const points = await getWorkoutPoints(wid);

  return {
    workoutId: wid,
    track,
    distanceKm,
    finishResult,
    workout,
    points,
  };
}

export async function runWorkoutWithOfflineBuffer({
  onlineCycles = 3,
  offlineCycles = 4,
  extraCycles = 0,
} = {}) {
  const { workoutId, id } = await startWorkout();
  const wid = workoutId ?? id;

  let ws = createWsClient(wid);
  await ws.connect();

  const track = createTrackGenerator();
  const offlineBuffer = [];

  for (let i = 0; i < onlineCycles; i++) {
    const { point, steps } = track.next();
    await ws.sendPoints([point], steps);
    if (config.fastMode) continue;
    await waitCycle();
  }

  ws.disconnect();
  ws = null;

  for (let i = 0; i < offlineCycles; i++) {
    const { point } = track.next();
    offlineBuffer.push(point);
    if (!config.fastMode) await waitCycle();
  }

  ws = createWsClient(wid);
  await ws.connect();
  await ws.sendPoints(offlineBuffer, track.totalSteps);

  const totalNeeded = minApprovedCycles();
  while (track.allPoints.length < totalNeeded) {
    const { point, steps } = track.next();
    await ws.sendPoints([point], steps);
    if (!config.fastMode) await waitCycle();
  }

  for (let i = 0; i < extraCycles; i++) {
    const { point, steps } = track.next();
    await ws.sendPoints([point], steps);
  }

  ws.disconnect();

  const distanceKm = calcTrackDistanceKm(track.allPoints);
  const finishResult = await finishWorkout(wid, {
    points: track.allPoints,
    distance_km: distanceKm,
    duration_seconds: config.finishDurationSeconds,
    steps_count: track.totalSteps,
  });

  await sleep(1500);
  const workout = await getWorkoutFromHistory(wid);
  const points = await getWorkoutPoints(wid);

  return { workoutId: wid, track, distanceKm, finishResult, workout, points, offlineBuffer };
}
