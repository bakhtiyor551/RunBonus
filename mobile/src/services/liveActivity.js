import WorkoutTracking from '../plugins/workoutNative';

const UPDATE_INTERVAL_MS = 5000;
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

export async function startWorkoutLiveActivity(snapshot) {
  try {
    const result = await WorkoutTracking.startLiveActivity({
      title: 'RunBonus — тренировка',
      elapsedSeconds: Math.floor(snapshot.seconds || 0),
      distanceKm: Number(snapshot.distance) || 0,
      speedKmh: Number(snapshot.currentSpeed) || 0,
      steps: Math.floor(snapshot.steps || 0),
      isPaused: Boolean(snapshot.paused),
    });
    enabled = Boolean(result?.enabled);
    lastPayload = payloadKey(snapshot);
  } catch {
    enabled = false;
  }
}

export async function syncWorkoutLiveActivity(snapshot) {
  if (!enabled) return;
  const key = payloadKey(snapshot);
  if (key === lastPayload) return;
  lastPayload = key;
  try {
    await WorkoutTracking.updateLiveActivity({
      elapsedSeconds: Math.floor(snapshot.seconds || 0),
      distanceKm: Number(snapshot.distance) || 0,
      speedKmh: Number(snapshot.currentSpeed) || 0,
      steps: Math.floor(snapshot.steps || 0),
      isPaused: Boolean(snapshot.paused),
    });
  } catch {
    /* ignore transient live activity errors */
  }
}

export async function stopWorkoutLiveActivity() {
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
    if (snapshot) syncWorkoutLiveActivity(snapshot);
  };
  const id = setInterval(tick, UPDATE_INTERVAL_MS);
  return () => clearInterval(id);
}
