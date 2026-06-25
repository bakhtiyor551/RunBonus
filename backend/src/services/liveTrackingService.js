import { pool } from '../db.js';
import { calcDistanceFromPoints, normalizeGpsPoint } from '../utils/geo.js';

/** Максимальная длительность сессии (совпадает с closeStaleWorkouts). */
export const MAX_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
/** Без новых GPS-точек — считаем тренировку брошенной. */
export const ABANDONED_NO_GPS_MINUTES = 30;
const FUTURE_TOLERANCE_MS = 2 * 60 * 1000;

/**
 * Проверка recorded_at относительно started_at тренировки (защита от подмены времени).
 * @returns {boolean}
 */
export function isPointTimestampValid(workout, recordedAt) {
  if (!workout?.started_at || !recordedAt) return true;
  const startedMs = new Date(workout.started_at).getTime();
  const pointMs = new Date(recordedAt).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(pointMs)) return true;
  const now = Date.now();
  if (pointMs > startedMs + MAX_SESSION_DURATION_MS) return false;
  if (pointMs > now + FUTURE_TOLERANCE_MS) return false;
  return true;
}

/** Не отбрасывать точки до started_at — привязать к старту (якорь / буфер с телефона). */
export function clampPointToWorkoutStart(workout, raw) {
  const p = normalizeGpsPoint(raw);
  if (!p || !workout?.started_at) return p;
  const startedMs = new Date(workout.started_at).getTime();
  const pointMs = new Date(p.recorded_at).getTime();
  if (!Number.isFinite(pointMs) || pointMs < startedMs) {
    const startedIso = new Date(startedMs).toISOString();
    return { ...p, recorded_at: startedIso };
  }
  return p;
}

/** Точки для live-карты: только после старта тренировки. */
export function pointsForLiveDisplay(workout, points) {
  if (!workout?.started_at) return points;
  const startedMs = new Date(workout.started_at).getTime();
  return points
    .map((p) => {
      const t = new Date(p.recorded_at).getTime();
      if (Number.isFinite(t) && t < startedMs) {
        return { ...p, recorded_at: new Date(startedMs).toISOString() };
      }
      return p;
    })
    .filter((p) => isPointTimestampValid(workout, p.recorded_at));
}

function mapPointRow(row) {
  return {
    lat: Number(row.lat ?? row.latitude),
    lng: Number(row.lng ?? row.longitude),
    speed: row.speed != null ? Number(row.speed) : null,
    accuracy: row.accuracy != null ? Number(row.accuracy) : null,
    recorded_at: row.recorded_at,
  };
}

export function buildWorkoutLiveRow(workout, points = []) {
  const mapped = points.map(mapPointRow);
  const trackInput = mapped.map((p) => ({
    latitude: p.lat,
    longitude: p.lng,
    speed: p.speed,
    accuracy: p.accuracy,
    recorded_at: p.recorded_at,
  }));
  const distanceKm = trackInput.length >= 2 ? calcDistanceFromPoints(trackInput) : 0;
  const last = mapped[mapped.length - 1] ?? null;
  const startedMs = new Date(workout.started_at).getTime();
  const elapsedSeconds = Number.isFinite(startedMs)
    ? Math.max(0, Math.floor((Date.now() - startedMs) / 1000))
    : 0;

  return {
    workout_id: workout.id,
    user_id: workout.user_id,
    client_name: workout.client_name,
    phone: workout.phone,
    started_at: workout.started_at,
    status: workout.status,
    steps_count: workout.steps_count != null ? Number(workout.steps_count) : 0,
    pause_seconds: workout.pause_seconds != null ? Number(workout.pause_seconds) : 0,
    distance_km: distanceKm,
    elapsed_seconds: elapsedSeconds,
    points_count: mapped.length,
    last_point_at: last?.recorded_at ?? null,
    last_position: last ? { lat: last.lat, lng: last.lng } : null,
    points: mapped,
  };
}

/** Закрыть in_progress без GPS-активности дольше ABANDONED_NO_GPS_MINUTES. */
export async function closeAbandonedInProgressWorkouts(conn = pool) {
  const [rows] = await conn.query(
    `SELECT w.id FROM workouts w
     WHERE w.status = 'in_progress'
       AND COALESCE(
         (SELECT MAX(p.recorded_at) FROM workout_points p WHERE p.workout_id = w.id),
         w.started_at
       ) < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [ABANDONED_NO_GPS_MINUTES]
  );
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  await conn.query(
    `UPDATE workouts SET
       status = 'rejected',
       reject_reason = 'Тренировка отменена (нет активности GPS)',
       finished_at = NOW()
     WHERE id IN (?)`,
    [ids]
  );
  return ids;
}

/** Снимок всех in_progress тренировок для live_snapshot. */
export async function buildLiveSnapshot(conn = pool) {
  const closedIds = await closeAbandonedInProgressWorkouts(conn);
  if (closedIds.length) {
    const { emitWorkoutClosed } = await import('./liveTrackingWs.js');
    for (const id of closedIds) {
      emitWorkoutClosed(id, 'rejected');
    }
  }

  const [workouts] = await conn.query(
    `SELECT w.id, w.user_id, u.name AS client_name, u.phone, w.started_at, w.status,
            w.steps_count, w.pause_seconds, w.moving_seconds, w.duration_seconds,
            w.avg_speed, w.max_speed, w.distance_km
     FROM workouts w
     JOIN users u ON u.id = w.user_id
     WHERE w.status = 'in_progress'
     ORDER BY w.started_at DESC`
  );

  if (!workouts.length) {
    return { workouts: [], updated_at: new Date().toISOString() };
  }

  const ids = workouts.map((w) => w.id);
  const [pointRows] = await conn.query(
    `SELECT workout_id, latitude AS lat, longitude AS lng, speed, accuracy, recorded_at
     FROM workout_points
     WHERE workout_id IN (?)
     ORDER BY workout_id, recorded_at`,
    [ids]
  );

  const pointsByWorkout = new Map();
  for (const row of pointRows) {
    const list = pointsByWorkout.get(row.workout_id) ?? [];
    list.push(mapPointRow(row));
    pointsByWorkout.set(row.workout_id, list);
  }

  const payload = workouts.map((w) =>
    buildWorkoutLiveRow(w, pointsForLiveDisplay(w, pointsByWorkout.get(w.id) ?? []))
  );

  return { workouts: payload, updated_at: new Date().toISOString() };
}

/** Дистанция по точкам тренировки из БД. */
export async function calcWorkoutDistanceKm(workoutId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT latitude, longitude, speed, accuracy, recorded_at
     FROM workout_points WHERE workout_id = ? ORDER BY recorded_at`,
    [workoutId]
  );
  if (rows.length < 2) return 0;
  return calcDistanceFromPoints(rows);
}
