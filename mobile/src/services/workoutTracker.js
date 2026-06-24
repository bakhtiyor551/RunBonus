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
  GPS_AUTO_PAUSE_MS,
  GPS_AUTO_PAUSE_SPEED_MPS,
  GPS_AUTO_RESUME_SPEED_MPS,
  computeAvgSpeedKmh,
  movingAverageSpeedMps,
  normalizeSpeedMps,
  speedMpsToKmh,
} from './gpsFilter';
import {
  startStepCounter,
  stopStepCounter,
  getSessionSteps,
  restoreSessionSteps,
} from './stepCounter';
import { startWorkoutForeground, stopWorkoutForeground } from './workoutForeground';
import {
  ensureWorkoutLiveActivity,
  syncWorkoutLiveActivity,
  stopWorkoutLiveActivity,
  scheduleLiveActivityUpdates,
} from './liveActivity';
import {
  bufferGpsPoint,
  bufferedToApiPoint,
  clearWorkoutBuffer,
  deleteBufferedPoints,
  getPendingPoints,
} from './gpsBuffer';
import { setConnectivityWorkoutMode, subscribeNetworkReconnect } from './connectivity';
import {
  connectWorkoutSocket,
  disconnectWorkoutSocket,
  isWorkoutSocketOpen,
  isWorkoutSocketConnecting,
  sendWorkoutPoints,
} from './workoutSocket';

const SYNC_INTERVAL_MS = 4000;
const PAUSED_SYNC_INTERVAL_MS = 8000;
const BATCH_SIZE = 50;
const BACKGROUND_POLL_MS = 5000;
const BACKGROUND_POLL_SLOW_MS = 10000;
const GPS_ACQUIRE_POLL_MS = 2000;
const AUTO_PAUSE_GRACE_MS = 45000;

let session = null;
const listeners = new Set();
const commandListeners = new Set();

function emitCommand(cmd) {
  commandListeners.forEach((fn) => fn(cmd));
}

export function subscribeWorkoutCommands(fn) {
  commandListeners.add(fn);
  return () => commandListeners.delete(fn);
}

function handleServerCommand(msg) {
  if (msg.type === 'workout_force_stop') {
    session.serverStale = true;
    freezeWorkoutForFinish();
  }
  emitCommand(msg);
}

function syncIntervalMs() {
  if (!session) return SYNC_INTERVAL_MS;
  return session.paused || session.autoPaused ? PAUSED_SYNC_INTERVAL_MS : SYNC_INTERVAL_MS;
}

function restartSyncInterval() {
  if (!session) return;
  if (session.syncId) clearInterval(session.syncId);
  session.syncId = setInterval(() => {
    if (!session) return;
    flushPointsToServer();
  }, syncIntervalMs());
}

function liveSnapshotFromSession() {
  if (!session) return null;
  syncElapsedSeconds();
  return {
    seconds: session.seconds,
    distance: session.distance,
    currentSpeed: session.currentSpeed,
    steps: session.steps,
    paused: session.paused || session.autoPaused,
    manualPaused: session.paused,
    autoPaused: session.autoPaused,
  };
}

function computeAvgSpeed(distanceKm, movingSeconds) {
  return computeAvgSpeedKmh(distanceKm, movingSeconds);
}

function totalPausedMsNow() {
  if (!session) return 0;
  let pausedMs = session.totalPausedMs;
  if (session.paused && session.pausedAt) {
    pausedMs += Date.now() - session.pausedAt;
  }
  if (session.autoPaused && session.autoPausedAt) {
    pausedMs += Date.now() - session.autoPausedAt;
  }
  return pausedMs;
}

function syncElapsedSeconds() {
  if (!session) return 0;
  const pausedMs = totalPausedMsNow();
  const elapsed = Math.floor((Date.now() - session.startedAt - pausedMs) / 1000);
  session.movingSeconds = Math.max(0, elapsed);
  session.seconds = Math.max(session.seconds, session.movingSeconds);
  session.pauseSeconds = Math.floor(pausedMs / 1000);
  session.avgSpeed = computeAvgSpeed(session.distance, session.movingSeconds);
  session.steps = getSessionSteps();
  return session.seconds;
}

function updateDisplaySpeed(pos) {
  const mps = normalizeSpeedMps(pos.speedMps);
  session.speedSamplesMps.push(mps);
  if (session.speedSamplesMps.length > 6) {
    session.speedSamplesMps = session.speedSamplesMps.slice(-6);
  }
  const avgMps = movingAverageSpeedMps(session.speedSamplesMps);
  const kmh = speedMpsToKmh(avgMps);
  session.currentSpeed = kmh;
  if (kmh > 0) {
    session.maxSpeed = Math.max(session.maxSpeed, kmh);
  }
}

function processAutoPause(pos) {
  if (!session || session.paused || !session.gpsReady) return;

  const waitingForTrack = !session.points.length;
  const inGracePeriod = Date.now() - session.startedAt < AUTO_PAUSE_GRACE_MS;
  if (waitingForTrack && inGracePeriod) return;

  const mps = Number(pos.speedMps) || 0;

  if (session.autoPaused) {
    if (mps >= GPS_AUTO_RESUME_SPEED_MPS) {
      if (session.autoPausedAt) {
        session.totalPausedMs += Date.now() - session.autoPausedAt;
      }
      session.autoPaused = false;
      session.autoPausedAt = null;
      session.lowSpeedSince = null;
      session.currentSpeed = speedMpsToKmh(mps);
      session.restartSyncInterval?.();
    }
    return;
  }

  if (mps < GPS_AUTO_PAUSE_SPEED_MPS) {
    if (!session.lowSpeedSince) {
      session.lowSpeedSince = Date.now();
    } else if (Date.now() - session.lowSpeedSince >= GPS_AUTO_PAUSE_MS) {
      session.autoPaused = true;
      session.autoPausedAt = Date.now();
      session.currentSpeed = 0;
      session.lowSpeedSince = null;
      session.restartSyncInterval?.();
    }
  } else {
    session.lowSpeedSince = null;
  }
}

function isTrackingFrozen() {
  return session?.paused || session?.autoPaused;
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
    paused: session.paused || session.autoPaused,
    manualPaused: session.paused,
    autoPaused: session.autoPaused,
    gpsReady: session.gpsReady,
    gpsError: session.gpsError,
    points: session.points,
    livePosition: session.livePosition,
  };
  listeners.forEach((fn) => fn(snapshot));
  syncWorkoutLiveActivity(snapshot);
}

function attachLiveActivityHandlers() {
  if (!session) return;
  ensureWorkoutLiveActivity(liveSnapshotFromSession()).catch(() => {});
  session.stopLiveActivity?.();
  session.stopLiveActivity = scheduleLiveActivityUpdates(liveSnapshotFromSession);
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

async function uploadPointBatch(batch) {
  if (!session || !batch.length) return;

  if (isWorkoutSocketOpen()) {
    try {
      await sendWorkoutPoints(batch, session.steps);
      return;
    } catch {
      /* WS send failed — fallback ниже */
    }
  }

  if (!isWorkoutSocketConnecting()) {
    try {
      await connectWorkoutSocket(session.workoutId, { onCommand: handleServerCommand });
      if (isWorkoutSocketOpen()) {
        await sendWorkoutPoints(batch, session.steps);
        return;
      }
    } catch {
      /* Android WebView часто не поднимает WS — шлём по HTTP */
    }
  }

  await session.api(`/api/workouts/${session.workoutId}/points`, {
    method: 'POST',
    body: JSON.stringify({ points: batch, steps_count: session.steps }),
  });
}

async function flushPointsToServer() {
  if (!session || session.serverStale) return;

  let sentAny = false;

  while (session && !session.serverStale) {
    const pending = await getPendingPoints(session.workoutId, BATCH_SIZE);
    if (!pending.length) {
      if (!sentAny && session.livePosition && !session.points.length) {
        try {
          await uploadPointBatch([session.livePosition]);
        } catch {
          /* оффлайн */
        }
      }
      return;
    }

    const ids = pending.map((r) => r.id);
    const batch = pending.map(bufferedToApiPoint);

    try {
      await uploadPointBatch(batch);
      await deleteBufferedPoints(ids);
      sentAny = true;
      if (pending.length < BATCH_SIZE) return;
    } catch (err) {
      if (err.status === 404 || err.message?.includes('не найдена') || err.message?.includes('workout_not_active')) {
        session.serverStale = true;
      }
      return;
    }
  }
}

/** Выгрузить весь pending-буфер (при восстановлении сети / перед finish). */
export async function flushAllPendingPoints() {
  if (!session || session.serverStale) return;
  let guard = 0;
  while (session && !session.serverStale && guard < 200) {
    const before = await getPendingPoints(session.workoutId, 1);
    if (!before.length) return;
    await flushPointsToServer();
    const after = await getPendingPoints(session.workoutId, 1);
    if (after.length && after[0].id === before[0].id) return;
    guard += 1;
  }
}

async function migrateLocalPointsToBuffer(workoutId, points) {
  const pending = await getPendingPoints(workoutId, 1);
  if (pending.length) return;
  for (const p of points) {
    await bufferGpsPoint(workoutId, p).catch(() => {});
  }
}

let lastLiveAnchorFlushAt = 0;

function flushLiveAnchorIfNeeded() {
  if (!session?.livePosition || session.points.length) return;
  const now = Date.now();
  if (now - lastLiveAnchorFlushAt < 3000) return;
  lastLiveAnchorFlushAt = now;
  flushPointsToServer().catch(() => {});
}

function markGpsSignal() {
  if (!session || session.gpsReady) return;
  session.gpsReady = true;
  session.gpsError = '';
}

function onGpsPosition(pos) {
  if (!session || !pos || session.finishing) return;

  session.livePosition = pos;
  markGpsSignal();
  flushLiveAnchorIfNeeded();
  processAutoPause(pos);

  if (!isTrackingFrozen()) {
    updateDisplaySpeed(pos);
  } else {
    session.currentSpeed = 0;
  }

  if (isTrackingFrozen()) {
    emit();
    return;
  }

  const last = session.points[session.points.length - 1];
  const { record, segmentMeters } = shouldRecordGpsPoint(last, pos);

  if (!record) {
    emit();
    return;
  }

  session.points = [...session.points, pos];
  session.distanceMeters += segmentMeters || 0;
  session.distance = Math.round((session.distanceMeters / 1000) * 1000) / 1000;
  session.gpsError = '';
  bufferGpsPoint(session.workoutId, pos).catch(() => {});
  persistWorkoutSession();
  emit();
}

async function pollPositionOnce() {
  if (!session) return;
  try {
    const pos = await getCurrentPosition();
    onGpsPosition(pos);
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
    attachLiveActivityHandlers();
    connectWorkoutSocket(id, { onCommand: handleServerCommand }).catch(() => {});
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

  const distanceKm = haversineKm(points);

  session = {
    workoutId: id,
    points,
    distance: distanceKm,
    distanceMeters: distanceKm * 1000,
    seconds,
    movingSeconds: saved?.movingSeconds || seconds,
    pauseSeconds: saved?.pauseSeconds || 0,
    startedAt,
    totalPausedMs: saved?.totalPausedMs || 0,
    paused: Boolean(saved?.paused),
    pausedAt: saved?.pausedAt || null,
    autoPaused: false,
    autoPausedAt: null,
    lowSpeedSince: null,
    speedSamplesMps: [],
    currentSpeed: 0,
    maxSpeed: saved?.maxSpeed || 0,
    avgSpeed: 0,
    steps: saved?.steps || 0,
    gpsReady: points.length > 0,
    gpsError: '',
    livePosition: points.length ? points[points.length - 1] : null,
    api,
    serverStale: false,
  };

  restoreSessionSteps(saved?.steps || 0);
  syncElapsedSeconds();
  await migrateLocalPointsToBuffer(id, points);

  setConnectivityWorkoutMode(true);

  try {
    await connectWorkoutSocket(id, { onCommand: handleServerCommand });
  } catch {
    /* оффлайн — буфер + reconnect при восстановлении сети */
  }

  try {
    await requestLocationPermission();
  } catch (err) {
    if (session?.workoutId === id) {
      session.gpsError = err.message;
    }
  }

  try {
    await startWorkoutForeground();
    await startStepCounter();
  } catch {
    /* foreground / шаги опциональны */
  }

  if (!session.gpsError) {
    try {
      session.stopGps = await startBackgroundTracking(onGpsPosition);
      pollPositionOnce().catch(() => {});
      await flushPointsToServer();
    } catch (err) {
      if (session?.workoutId === id) {
        session.gpsError = err.message || 'Не удалось запустить GPS';
      }
    }
  }

  session.gpsAcquirePollId = setInterval(() => {
    if (!session || session.workoutId !== id) return;
    if (session.gpsReady && session.livePosition) {
      clearInterval(session.gpsAcquirePollId);
      session.gpsAcquirePollId = null;
      return;
    }
    pollPositionOnce();
  }, GPS_ACQUIRE_POLL_MS);

  session.timerId = setInterval(() => {
    if (!session || session.workoutId !== id) return;
    if (!isTrackingFrozen()) syncElapsedSeconds();
    persistWorkoutSession();
    emit();
  }, 1000);

  session.syncId = setInterval(() => {
    if (!session || session.workoutId !== id) return;
    flushPointsToServer();
  }, syncIntervalMs());

  session.restartSyncInterval = restartSyncInterval;

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
      if (isActive) attachLiveActivityHandlers();
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

  session.unsubConnectivity = subscribeNetworkReconnect(() => {
    if (session?.workoutId === id) {
      connectWorkoutSocket(id, { onCommand: handleServerCommand })
        .then(() => flushAllPendingPoints())
        .catch(() => {});
    }
  });

  attachLiveActivityHandlers();
  emit();
  return session;
}

export function pauseWorkoutSession() {
  if (!session || session.paused) return;
  if (session.autoPaused && session.autoPausedAt) {
    session.totalPausedMs += Date.now() - session.autoPausedAt;
    session.autoPaused = false;
    session.autoPausedAt = null;
  }
  session.lowSpeedSince = null;
  session.paused = true;
  session.pausedAt = Date.now();
  session.currentSpeed = 0;
  session.restartSyncInterval?.();
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
  session.restartSyncInterval?.();
  pollPositionOnce().catch(() => {});
  persistWorkoutSession();
  emit();
}

export function toggleWorkoutPause() {
  if (!session || session.autoPaused) return;
  if (session.paused) resumeWorkoutSessionTracking();
  else pauseWorkoutSession();
}

/** Остановить таймер и GPS при завершении (сессия остаётся для flush/finish). */
export function freezeWorkoutForFinish() {
  if (!session || session.finishing) return;
  session.finishing = true;
  syncElapsedSeconds();
  clearInterval(session.timerId);
  session.timerId = null;
  clearInterval(session.syncId);
  session.syncId = null;
  clearInterval(session.backgroundPollId);
  session.backgroundPollId = null;
  clearInterval(session.gpsAcquirePollId);
  session.gpsAcquirePollId = null;
  session.stopGps?.();
  session.stopGps = null;
  session.currentSpeed = 0;
  emit();
}

export function getWorkoutFinishSnapshot() {
  if (!session) return null;
  return {
    distance: session.distance,
    seconds: session.seconds,
    movingSeconds: session.movingSeconds,
    pauseSeconds: session.pauseSeconds,
    steps: session.steps,
    maxSpeed: session.maxSpeed,
    avgSpeed: session.avgSpeed,
  };
}

/** После возврата из фона — обновить время и GPS. */
export async function resumeWorkoutSession() {
  if (!session || session.finishing) return;
  syncElapsedSeconds();
  attachLiveActivityHandlers();
  if (!isWorkoutSocketOpen()) {
    connectWorkoutSocket(session.workoutId, { onCommand: handleServerCommand }).catch(() => {});
  }
  if (!isTrackingFrozen()) await pollPositionOnce();
  await flushAllPendingPoints();
  emit();
}

export function stopWorkoutSession() {
  if (!session) return;
  clearInterval(session.timerId);
  clearInterval(session.syncId);
  clearInterval(session.backgroundPollId);
  clearInterval(session.gpsAcquirePollId);
  session.stopGps?.();
  session.appStateHandle?.remove?.();
  if (session.onVisibility) {
    document.removeEventListener('visibilitychange', session.onVisibility);
  }
  session.unsubConnectivity?.();
  session.stopLiveActivity?.();
  stopWorkoutLiveActivity().catch(() => {});
  stopStepCounter();
  stopWorkoutForeground().catch(() => {});
  setConnectivityWorkoutMode(false);
  disconnectWorkoutSocket().catch(() => {});
  session = null;
}

export async function clearWorkoutGpsBuffer(workoutId) {
  await clearWorkoutBuffer(workoutId);
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
      paused: session.paused || session.autoPaused,
      manualPaused: session.paused,
      autoPaused: session.autoPaused,
      gpsReady: session.gpsReady,
      gpsError: session.gpsError,
      points: session.points,
      livePosition: session.livePosition,
    });
  }
  return () => listeners.delete(fn);
}
