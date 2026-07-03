import { calcTrackDistanceKm } from './geo.js';
import { computeAvgSpeedKmh } from './metrics.js';

/**
 * Локальное хранилище тренировки (имитация mobile localStorage / IndexedDB).
 * Используется в Offline-сценариях OFFLINE-003..007.
 */
export class LocalWorkoutStore {
  constructor() {
    /** @type {Map<string, object>} */
    this.workouts = new Map();
    this.seq = 0;
  }

  create(workoutId, points = [], meta = {}) {
    const id = workoutId ? String(workoutId) : `local_training_${++this.seq}`;
    const distance = calcTrackDistanceKm(points);
    const duration = meta.duration_seconds ?? 0;
    const record = {
      id,
      workoutId: workoutId ?? null,
      distance,
      duration,
      avgSpeed: computeAvgSpeedKmh(distance, duration),
      bonus: meta.bonus ?? distance,
      status: 'pending_sync',
      points: [...points],
      steps_count: meta.steps_count ?? 0,
      created_at: new Date().toISOString(),
      ...meta,
    };
    this.workouts.set(id, record);
    return record;
  }

  get(id) {
    return this.workouts.get(String(id)) || null;
  }

  appendPoints(id, newPoints) {
    const w = this.get(id);
    if (!w) return null;
    w.points.push(...newPoints);
    w.distance = calcTrackDistanceKm(w.points);
    return w;
  }

  markSynced(id) {
    const w = this.get(id);
    if (!w) return null;
    w.status = 'synced';
    w.synced_at = new Date().toISOString();
    return w;
  }

  markPending(id) {
    const w = this.get(id);
    if (!w) return null;
    w.status = 'pending_sync';
    return w;
  }
}

export const localStore = new LocalWorkoutStore();
