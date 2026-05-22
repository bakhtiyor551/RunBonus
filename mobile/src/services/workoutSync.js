import {
  clearWorkoutLocal,
  getActiveWorkoutId,
  setActiveWorkoutId,
} from './geolocation';

/** Активная тренировка на сервере (in_progress) или null. */
export async function fetchActiveWorkoutId(api) {
  const data = await api('/api/workouts/active');
  if (!data?.active) return null;
  return data.workoutId ?? data.id ?? null;
}

/**
 * Сверка localStorage с сервером. Убирает устаревший id (например уже завершённую #14).
 * @returns {Promise<number|null>} актуальный id или null
 */
export async function syncActiveWorkoutWithServer(api) {
  const serverId = await fetchActiveWorkoutId(api);
  const localId = getActiveWorkoutId();

  if (!serverId) {
    if (localId) {
      clearWorkoutLocal(localId);
      setActiveWorkoutId(null);
    }
    return null;
  }

  const numericServer = Number(serverId);
  if (localId && Number(localId) !== numericServer) {
    clearWorkoutLocal(localId);
  }
  setActiveWorkoutId(numericServer);
  return numericServer;
}
