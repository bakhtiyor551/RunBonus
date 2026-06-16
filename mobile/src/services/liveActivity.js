import WorkoutTracking from '../plugins/workoutNative';
import { Capacitor } from '@capacitor/core';

const UPDATE_INTERVAL_MS = 1000;
let enabled = false;
let lastPayload = '';

function payloadKey(data) {
  return [
    data.seconds ?? data.elapsedSeconds,
    Number(data.distance ?? data.distanceKm ?? 0).toFixed(3),
    Number(data.currentSpeed ?? data.speedKmh ?? 0).toFixed(1),
    data.steps,
    data.paused ?? data.isPaused,
  ].join('|');
}

function toNativePayload(snapshot) {
  return {
    title: 'RunBonus — тренировка',
    elapsedSeconds: Math.floor(snapshot.seconds || 0),
    distanceKm: Number(snapshot.distance) || 0,
    speedKmh: Number(snapshot.currentSpeed) || 0,
    steps: Math.floor(snapshot.steps || 0),
    isPaused: Boolean(snapshot.paused),
  };
}

function applyResult(result, snapshot) {
  const active = Boolean(result?.active);
  const ok = Boolean(result?.ok);
  enabled = active || ok;
  if (snapshot) lastPayload = payloadKey(snapshot);
  if (Capacitor.getPlatform() === 'ios') {
    console.info('[LiveActivity]', result);
  }
  return enabled;
}

export async function startWorkoutLiveActivity(snapshot) {
  if (Capacitor.getPlatform() !== 'ios') return false;
  try {
    const result = await WorkoutTracking.startLiveActivity(toNativePayload(snapshot));
    return applyResult(result, snapshot);
  } catch (err) {
    console.warn('[LiveActivity] start failed', err);
    enabled = false;
    return false;
  }
}

export async function ensureWorkoutLiveActivity(snapshot) {
  if (Capacitor.getPlatform() !== 'ios' || !snapshot) return false;
  try {
    const result = await WorkoutTracking.updateLiveActivity(toNativePayload(snapshot));
    if (applyResult(result, snapshot)) return true;
  } catch (err) {
    console.warn('[LiveActivity] update failed', err);
  }
  return startWorkoutLiveActivity(snapshot);
}

export async function syncWorkoutLiveActivity(snapshot) {
  if (Capacitor.getPlatform() !== 'ios' || !snapshot) return;
  const key = payloadKey(snapshot);
  if (enabled && key === lastPayload) return;
  await ensureWorkoutLiveActivity(snapshot);
}

export async function stopWorkoutLiveActivity() {
  if (Capacitor.getPlatform() !== 'ios') return;
  enabled = false;
  lastPayload = '';
  try {
    await WorkoutTracking.endLiveActivity();
  } catch (err) {
    console.warn('[LiveActivity] end failed', err);
  }
}

export function scheduleLiveActivityUpdates(getSnapshot) {
  const tick = () => {
    const snapshot = getSnapshot?.();
    if (snapshot) ensureWorkoutLiveActivity(snapshot);
  };
  tick();
  const id = setInterval(tick, UPDATE_INTERVAL_MS);
  return () => clearInterval(id);
}

export async function getLiveActivityStatus() {
  if (Capacitor.getPlatform() !== 'ios') {
    return { enabled: false, active: false };
  }
  try {
    return await WorkoutTracking.getLiveActivityStatus();
  } catch {
    return { enabled: false, active: false };
  }
}
