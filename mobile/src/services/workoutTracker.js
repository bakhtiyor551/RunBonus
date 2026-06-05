import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import {
  startBackgroundTracking,
  haversineKm,
  filterTrackPoints,
  shouldRecordGpsPoint,
  saveWorkoutLocal,
  loadWorkoutLocal,
  requestLocationPermission,
  getCurrentPosition,
} from './geolocation';

const SYNC_INTERVAL_MS = 8000;
const BACKGROUND_POLL_MS = 5000;
const BACKGROUND_POLL_SLOW_MS = 10000;

let session = null;
const listeners = new Set();

function syncElapsedSeconds() {
  if (!session) return 0;
  const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
  session.seconds = Math.max(session.seconds, elapsed);
  return session.seconds;
}

function emit() {
  if (!session) return;
  syncElapsedSeconds();
  const snapshot = {
    workoutId: session.workoutId,
    distance: session.distance,
    seconds: session.seconds,
    gpsReady: session.gpsReady,
    gpsError: session.gpsError,
  };
  listeners.forEach((fn) => fn(snapshot));
}

export function persistWorkoutSession() {
  if (!session) return;
  syncElapsedSeconds();
  saveWorkoutLocal(session.workoutId, {
    points: session.points,
    startedAt: session.startedAt,
    seconds: session.seconds,
  });
}

async function flushPointsToServer() {
  if (!session?.points.length || !navigator.onLine || session.serverStale) return;
  const batch = session.points.slice(-80);
  try {
    await session.api(`/api/workouts/${session.workoutId}/points`, {
      method: 'POST',
      body: JSON.stringify({ points: batch }),
    });
  } catch (err) {
    if (err.status === 404 || err.message?.includes('не найдена')) {
      session.serverStale = true;
    }
  }
}

function addPosition(pos) {
  if (!session) return;
  const last = session.points[session.points.length - 1];
  const { record } = shouldRecordGpsPoint(last, pos, session.points);

  if (!record) return;

  session.points = [...session.points, pos];
  session.distance = haversineKm(session.points);
  session.gpsError = '';
  persistWorkoutSession();
  emit();
}

async function pollPositionOnce() {
  if (!session) return;
  try {
    const pos = await getCurrentPosition();
    addPosition(pos);
  } catch {
    /* GPS временно недоступен */
  }
}

/**
 * @param {number|string} workoutId
 * @param {(path: string, init?: RequestInit) => Promise<any>} api
 * @param {{ startedAt?: number|null }} [options]
 */
export async function startWorkoutSession(workoutId, api, options = {}) {
  const id = Number(workoutId);
  if (session?.workoutId === id) {
    syncElapsedSeconds();
    emit();
    return session;
  }

  stopWorkoutSession();

  const saved = loadWorkoutLocal(id);
  const points = saved?.points?.length ? filterTrackPoints(saved.points) : [];
  const localStart = saved?.startedAt;
  const serverStartedAt = options.startedAt > 0 ? options.startedAt : null;
  const startedAt =
    localStart && serverStartedAt
      ? Math.min(localStart, serverStartedAt)
      : (localStart ?? serverStartedAt ?? Date.now());
  const seconds = saved?.seconds || 0;

  session = {
    workoutId: id,
    points,
    distance: haversineKm(points),
    seconds,
    startedAt,
    gpsReady: false,
    gpsError: '',
    api,
  };
  syncElapsedSeconds();

  try {
    await requestLocationPermission();
    session.stopGps = await startBackgroundTracking(addPosition);
    session.gpsReady = true;
    await flushPointsToServer();
  } catch (err) {
    if (session?.workoutId === id) {
      session.gpsError = err.message;
    }
  }

  session.timerId = setInterval(() => {
    if (!session || session.workoutId !== id) return;
    syncElapsedSeconds();
    persistWorkoutSession();
    emit();
  }, 1000);

  session.syncId = setInterval(() => {
    if (!session || session.workoutId !== id) return;
    flushPointsToServer();
  }, SYNC_INTERVAL_MS);

  if (Capacitor.isNativePlatform()) {
    session.backgroundPollId = setInterval(() => {
      if (!session || session.workoutId !== id) return;
      pollPositionOnce();
    }, BACKGROUND_POLL_MS);
    session.onAppState = ({ isActive }) => {
      if (!session || session.workoutId !== id) return;
      clearInterval(session.backgroundPollId);
      const interval = isActive ? BACKGROUND_POLL_MS : BACKGROUND_POLL_SLOW_MS;
      session.backgroundPollId = setInterval(() => {
        if (!session || session.workoutId !== id) return;
        pollPositionOnce();
      }, interval);
    };
    App.addListener('appStateChange', session.onAppState).then((handle) => {
      if (session?.workoutId === id) session.appStateHandle = handle;
    });
  }

  session.onVisibility = () => {
    if (!session || session.workoutId !== id) return;
    if (document.visibilityState === 'visible') {
      resumeWorkoutSession();
    } else {
      persistWorkoutSession();
    }
  };
  document.addEventListener('visibilitychange', session.onVisibility);

  emit();
  return session;
}

/** После возврата из фона — обновить время и GPS. */
export async function resumeWorkoutSession() {
  if (!session) return;
  syncElapsedSeconds();
  await pollPositionOnce();
  await flushPointsToServer();
  emit();
}

export function stopWorkoutSession() {
  if (!session) return;
  clearInterval(session.timerId);
  clearInterval(session.syncId);
  clearInterval(session.backgroundPollId);
  session.stopGps?.();
  session.appStateHandle?.remove?.();
  if (session.onVisibility) {
    document.removeEventListener('visibilitychange', session.onVisibility);
  }
  session = null;
}

export function getWorkoutSession() {
  return session;
}

export function getWorkoutPoints() {
  return session?.points ?? [];
}

export function subscribeWorkoutSession(fn) {
  listeners.add(fn);
  if (session) {
    syncElapsedSeconds();
    fn({
      workoutId: session.workoutId,
      distance: session.distance,
      seconds: session.seconds,
      gpsReady: session.gpsReady,
      gpsError: session.gpsError,
    });
  }
  return () => listeners.delete(fn);
}
