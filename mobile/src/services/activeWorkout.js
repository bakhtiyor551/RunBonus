import { api } from '../api';
import {
  getActiveWorkoutId,
  setActiveWorkoutId,
  clearWorkoutLocal,
} from './geolocation';

/**
 * Сверяет localStorage с сервером: только одна in_progress тренировка на пользователя.
 * @returns {{ workoutId: number|null, stale: boolean, offline?: boolean }}
 */
export async function syncActiveWorkoutWithServer() {
  const localId = getActiveWorkoutId();

  try {
    const data = await api('/api/workouts/active');
    const serverId = data?.workoutId ?? data?.id ?? null;
    const numServer = serverId != null ? Number(serverId) : null;

    if (numServer) {
      const stale = Boolean(localId && Number(localId) !== numServer);
      if (stale) clearWorkoutLocal(localId);
      setActiveWorkoutId(numServer);
      return { workoutId: numServer, stale };
    }

    if (localId) {
      clearWorkoutLocal(localId);
      setActiveWorkoutId(null);
      return { workoutId: null, stale: true };
    }

    return { workoutId: null, stale: false };
  } catch {
    if (localId) {
      return { workoutId: Number(localId), stale: false, offline: true };
    }
    return { workoutId: null, stale: false, offline: true };
  }
}
