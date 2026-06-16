import WorkoutTracking from '../plugins/workoutNative';
import { Capacitor } from '@capacitor/core';

const UPDATE_INTERVAL_MS = 4000;
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

export async function startWorkoutLiveActivity(snapshot) {
  if (Capacitor.getPlatform() !== 'ios') return;
  try {
    const result = await WorkoutTracking.startLiveActivity(toNativePayload(snapshot));
    enabled = Boolean(result?.active || result?.ok);
    lastPayload = payloadKey(snapshot);
  } catch {
    enabled = false;
  }
}

export async function ensureWorkoutLiveActivity(snapshot) {
  if (Capacitor.getPlatform() !== 'ios') return;
  if (enabled) {
    await syncWorkoutLiveActivity(snapshot);
    return;
  }
  await startWorkoutLiveActivity(snapshot);
}

export async function syncWorkoutLiveActivity(snapshot) {
  if (Capacitor.getPlatform() !== 'ios') return;
  const key = payloadKey(snapshot);
  if (enabled && key === lastPayload) return;
  lastPayload = key;
  try {
    const result = await WorkoutTracking.updateLiveActivity(toNativePayload(snapshot));
    enabled = Boolean(result?.active || result?.ok || enabled);
  } catch {
    enabled = false;
  }
}

export async function stopWorkoutLiveActivity() {
  if (Capacitor.getPlatform() !== 'ios') return;
  enabled = false;
  lastPayload = '';
  try {
    await WorkoutTracking.endLiveActivity();
  } catch {
    /* optional */
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
