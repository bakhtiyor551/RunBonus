import { api } from '../api';
import {
  getActiveWorkoutId,
  setActiveWorkoutId,
  clearWorkoutLocal,
} from './geolocation';
import { getWorkoutSession } from './workoutTracker';

function localActiveWorkoutId() {
  const fromStorage = getActiveWorkoutId();
  if (fromStorage) return Number(fromStorage);
  const fromSession = getWorkoutSession()?.workoutId;
  return fromSession ? Number(fromSession) : null;
}

/**
 * Сверяет localStorage с сервером: только одна in_progress тренировка на пользователя.
 * @returns {{ workoutId: number|null, startedAt: number|null, stale: boolean, offline?: boolean }}
 */
export async function syncActiveWorkoutWithServer() {
  const localId = getActiveWorkoutId();

  try {
    const data = await api('/api/workouts/active');
    const serverId = data?.workoutId ?? data?.id ?? null;
    const numServer = serverId != null ? Number(serverId) : null;
    const startedAt = data?.started_at ? new Date(data.started_at).getTime() : null;

    if (numServer) {
      const stale = Boolean(localId && Number(localId) !== numServer);
      if (stale) clearWorkoutLocal(localId);
      setActiveWorkoutId(numServer);
      return { workoutId: numServer, startedAt, stale };
    }

    if (localId) {
      clearWorkoutLocal(localId);
      setActiveWorkoutId(null);
      return { workoutId: null, startedAt: null, stale: true };
    }

    return { workoutId: null, startedAt: null, stale: false };
  } catch {
    const fallback = localActiveWorkoutId();
    return {
      workoutId: fallback,
      startedAt: null,
      stale: false,
      offline: true,
    };
  }
}
