import { pool } from '../db.js';
import {
  isSameCoordinates,
  isValidTrackPoint,
  normalizeGpsPoint,
  shouldSaveGpsPoint,
} from '../utils/geo.js';
import {
  calcWorkoutDistanceKm,
  clampPointToWorkoutStart,
  isPointTimestampValid,
} from './liveTrackingService.js';
import { emitPointReceived } from './liveTrackingWs.js';

/** Антифрод: принудительная остановка при аномальной скорости (км/ч). */
export const FORCE_STOP_SPEED_KMH = 60;

async function assertWorkoutOwner(workoutId, userId) {
  const [rows] = await pool.query(
    `SELECT * FROM workouts WHERE id = ? AND user_id = ? AND status = 'in_progress'`,
    [workoutId, userId]
  );
  return rows[0] || null;
}

async function getLastWorkoutPoint(workoutId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT latitude, longitude, speed, accuracy, recorded_at
     FROM workout_points WHERE workout_id = ? ORDER BY recorded_at DESC LIMIT 1`,
    [workoutId]
  );
  return rows[0] ? normalizeGpsPoint(rows[0]) : null;
}

async function insertGpsPoint(conn, workoutId, rawPoint, workoutStartedAt = null) {
  const p = normalizeGpsPoint(rawPoint);
  if (!p) return false;

  let recordedAt = p.recorded_at ? new Date(p.recorded_at) : new Date();
  if (workoutStartedAt) {
    const startedMs = new Date(workoutStartedAt).getTime();
    if (Number.isFinite(startedMs) && recordedAt.getTime() < startedMs) {
      recordedAt = new Date(workoutStartedAt);
    }
  }

  await conn.query(
    `INSERT INTO workout_points (workout_id, latitude, longitude, speed, accuracy, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [workoutId, p.latitude, p.longitude, p.speed, p.accuracy, recordedAt]
  );
  return true;
}

export function detectSpeedFraud(points) {
  const list = Array.isArray(points) ? points : [points];
  for (const raw of list) {
    const p = normalizeGpsPoint(raw);
    if (!p?.speed || !Number.isFinite(p.speed)) continue;
    if (p.speed > FORCE_STOP_SPEED_KMH) {
      return {
        fraud: true,
        reason: `Аномальная скорость (${Math.round(p.speed)} км/ч). Пробежка аннулирована.`,
        speed_kmh: p.speed,
      };
    }
  }
  return { fraud: false };
}

/**
 * @returns {Promise<{ workout, savedPoints, distanceKm, fraud?: object }|null>}
 */
export async function saveWorkoutPoints(workoutId, userId, points, meta = {}) {
  const fraud = detectSpeedFraud(points);
  if (fraud.fraud) {
    const workout = await assertWorkoutOwner(workoutId, userId);
    if (!workout) return null;
    return { workout, savedPoints: [], distanceKm: 0, fraud };
  }

  const workout = await assertWorkoutOwner(workoutId, userId);
  if (!workout) return null;

  const list = Array.isArray(points) ? points : [points];
  let last = await getLastWorkoutPoint(workoutId);
  const savedPoints = [];

  if (!last) {
    for (const raw of list) {
      const p = clampPointToWorkoutStart(workout, raw);
      if (!p || !isValidTrackPoint(p, { acquire: true })) continue;
      if (!isPointTimestampValid(workout, p.recorded_at)) continue;
      await insertGpsPoint(pool, workoutId, p, workout.started_at);
      savedPoints.push({
        lat: p.latitude,
        lng: p.longitude,
        speed: p.speed,
        accuracy: p.accuracy,
        recorded_at: p.recorded_at ?? workout.started_at,
      });
      last = p;
      break;
    }
  }

  for (const raw of list) {
    if (!shouldSaveGpsPoint(last, raw)) continue;
    let p = clampPointToWorkoutStart(workout, raw);
    if (!p) continue;
    if (!isPointTimestampValid(workout, p.recorded_at)) continue;
    if (last && isSameCoordinates(last, p)) continue;
    await insertGpsPoint(pool, workoutId, p, workout.started_at);
    savedPoints.push({
      lat: p.latitude,
      lng: p.longitude,
      speed: p.speed,
      accuracy: p.accuracy,
      recorded_at: p.recorded_at,
    });
    last = p;
  }

  if (meta.steps_count != null) {
    const steps = Math.max(0, Math.floor(Number(meta.steps_count)));
    await pool.query('UPDATE workouts SET steps_count = ? WHERE id = ?', [steps, workoutId]);
  }

  let distanceKm = 0;
  if (savedPoints.length) {
    distanceKm = await calcWorkoutDistanceKm(workoutId);
    const [metaRows] = await pool.query(
      `SELECT u.name AS client_name, u.phone,
              (SELECT COUNT(*) FROM workout_points WHERE workout_id = ?) AS points_count
       FROM workouts w JOIN users u ON u.id = w.user_id WHERE w.id = ?`,
      [workoutId, workoutId]
    );
    const meta = metaRows[0] || {};
    emitPointReceived(workoutId, savedPoints, distanceKm, {
      client_name: meta.client_name,
      phone: meta.phone,
      points_count: Number(meta.points_count) || savedPoints.length,
    });
  }

  return { workout, savedPoints, distanceKm };
}

export async function forceStopWorkout(workoutId, userId, reason) {
  const [result] = await pool.query(
    `UPDATE workouts SET
       status = 'rejected',
       reject_reason = ?,
       finished_at = NOW()
     WHERE id = ? AND user_id = ? AND status = 'in_progress'`,
    [reason, workoutId, userId]
  );
  return result.affectedRows > 0;
}
