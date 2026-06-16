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
import {
  startStepCounter,
  stopStepCounter,
  getSessionSteps,
  restoreSessionSteps,
} from './stepCounter';
import { startWorkoutForeground, stopWorkoutForeground } from './workoutForeground';
import {
  startWorkoutLiveActivity,
  syncWorkoutLiveActivity,
  stopWorkoutLiveActivity,
  scheduleLiveActivityUpdates,
} from './liveActivity';

const SYNC_INTERVAL_MS = 8000;
const BACKGROUND_POLL_MS = 5000;
const BACKGROUND_POLL_SLOW_MS = 10000;

let session = null;
const listeners = new Set();

function computeAvgSpeed(distanceKm, movingSeconds) {
  if (!movingSeconds || movingSeconds <= 0) return 0;
  return (distanceKm / movingSeconds) * 3600;
}

function syncElapsedSeconds() {
  if (!session) return 0;
  let pausedMs = session.totalPausedMs;
  if (session.paused && session.pausedAt) {
    pausedMs += Date.now() - session.pausedAt;
  }
  const elapsed = Math.floor((Date.now() - session.startedAt - pausedMs) / 1000);
  session.seconds = Math.max(session.seconds, Math.max(0, elapsed));
  session.pauseSeconds = Math.floor(pausedMs / 1000);
  session.movingSeconds = session.seconds;
  session.avgSpeed = computeAvgSpeed(session.distance, session.movingSeconds);
  session.steps = getSessionSteps();
  return session.seconds;
}

function emit() {
  if (!session) return;
  syncElapsedSeconds();
  const snapshot = {
    workoutId: session.workoutId,
    distance: session.distance,
    seconds: session.seconds,
    movingSeconds: session.movingSeconds,
    pauseSeconds: session.pauseSeconds,
    currentSpeed: session.currentSpeed,
    maxSpeed: session.maxSpeed,
    avgSpeed: session.avgSpeed,
    steps: session.steps,
    paused: session.paused,
    gpsReady: session.gpsReady,
    gpsError: session.gpsError,
    points: session.points,
  };
  listeners.forEach((fn) => fn(snapshot));
  syncWorkoutLiveActivity(snapshot);
}

export function persistWorkoutSession() {
  if (!session) return;
  syncElapsedSeconds();
  saveWorkoutLocal(session.workoutId, {
    points: session.points,
    startedAt: session.startedAt,
    seconds: session.seconds,
    movingSeconds: session.movingSeconds,
    pauseSeconds: session.pauseSeconds,
    maxSpeed: session.maxSpeed,
    steps: session.steps,
    paused: session.paused,
    pausedAt: session.pausedAt,
    totalPausedMs: session.totalPausedMs,
  });
}

async function flushPointsToServer() {
  if (!session?.points.length || !navigator.onLine || session.serverStale || session.paused) return;
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
  if (!session || session.paused) return;

  const speed = Number(pos.speed) || 0;
  if (speed > 0) {
    session.currentSpeed = speed;
    session.maxSpeed = Math.max(session.maxSpeed, speed);
  }

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
  if (!session || session.paused) return;
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
    movingSeconds: saved?.movingSeconds || seconds,
    pauseSeconds: saved?.pauseSeconds || 0,
    startedAt,
    totalPausedMs: saved?.totalPausedMs || 0,
    paused: Boolean(saved?.paused),
    pausedAt: saved?.pausedAt || null,
    currentSpeed: 0,
    maxSpeed: saved?.maxSpeed || 0,
    avgSpeed: 0,
    steps: saved?.steps || 0,
    gpsReady: false,
    gpsError: '',
    api,
    serverStale: false,
  };

  restoreSessionSteps(saved?.steps || 0);
  syncElapsedSeconds();

  try {
    await requestLocationPermission();
    await startWorkoutForeground();
    await startStepCounter();
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
    if (!session.paused) syncElapsedSeconds();
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

  const liveSnapshot = {
    seconds: session.seconds,
    distance: session.distance,
    currentSpeed: session.currentSpeed,
    steps: session.steps,
    paused: session.paused,
  };
  startWorkoutLiveActivity(liveSnapshot).catch(() => {});
  session.stopLiveActivity = scheduleLiveActivityUpdates(() => {
    if (!session) return null;
    syncElapsedSeconds();
    return {
      seconds: session.seconds,
      distance: session.distance,
      currentSpeed: session.currentSpeed,
      steps: session.steps,
      paused: session.paused,
    };
  });

  emit();
  return session;
}

export function pauseWorkoutSession() {
  if (!session || session.paused) return;
  session.paused = true;
  session.pausedAt = Date.now();
  session.currentSpeed = 0;
  persistWorkoutSession();
  emit();
}

export function resumeWorkoutSessionTracking() {
  if (!session || !session.paused) return;
  if (session.pausedAt) {
    session.totalPausedMs += Date.now() - session.pausedAt;
  }
  session.paused = false;
  session.pausedAt = null;
  pollPositionOnce().catch(() => {});
  persistWorkoutSession();
  emit();
}

export function toggleWorkoutPause() {
  if (!session) return;
  if (session.paused) resumeWorkoutSessionTracking();
  else pauseWorkoutSession();
}

/** После возврата из фона — обновить время и GPS. */
export async function resumeWorkoutSession() {
  if (!session) return;
  syncElapsedSeconds();
  if (!session.paused) await pollPositionOnce();
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
  session.stopLiveActivity?.();
  stopWorkoutLiveActivity().catch(() => {});
  stopStepCounter();
  stopWorkoutForeground().catch(() => {});
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
      movingSeconds: session.movingSeconds,
      pauseSeconds: session.pauseSeconds,
      currentSpeed: session.currentSpeed,
      maxSpeed: session.maxSpeed,
      avgSpeed: session.avgSpeed,
      steps: session.steps,
      paused: session.paused,
      gpsReady: session.gpsReady,
      gpsError: session.gpsError,
      points: session.points,
    });
  }
  return () => listeners.delete(fn);
}
