import { pool } from '../db.js';
import {
  isSameCoordinates,
  isValidTrackPoint,
  normalizeGpsPoint,
  shouldSaveGpsPoint,
  haversineKm,
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
    `SELECT * FROM workouts WHERE id = ? AND user_id = ? AND status IN ('in_progress', 'paused')`,
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

function preparePointRow(workoutId, rawPoint, workoutStartedAt = null) {
  const p = normalizeGpsPoint(rawPoint);
  if (!p) return null;

  let recordedAt = p.recorded_at ? new Date(p.recorded_at) : new Date();
  if (workoutStartedAt) {
    const startedMs = new Date(workoutStartedAt).getTime();
    if (Number.isFinite(startedMs) && recordedAt.getTime() < startedMs) {
      recordedAt = new Date(workoutStartedAt);
    }
  }

  return {
    workoutId,
    latitude: p.latitude,
    longitude: p.longitude,
    speed: p.speed,
    accuracy: p.accuracy,
    altitude: p.altitude,
    course: p.course,
    recordedAt,
    point: { ...p, recorded_at: recordedAt.toISOString?.() || recordedAt },
  };
}

async function insertGpsPointsBulk(conn, rows) {
  if (!rows.length) return;
  const valuesFull = rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const paramsFull = [];
  for (const r of rows) {
    paramsFull.push(
      r.workoutId,
      r.latitude,
      r.longitude,
      r.speed,
      r.accuracy,
      r.altitude ?? null,
      r.course ?? null,
      r.recordedAt
    );
  }
  try {
    await conn.query(
      `INSERT INTO workout_points (workout_id, latitude, longitude, speed, accuracy, altitude, course, recorded_at)
       VALUES ${valuesFull}`,
      paramsFull
    );
  } catch (err) {
    if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
    const values = rows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const params = [];
    for (const r of rows) {
      params.push(r.workoutId, r.latitude, r.longitude, r.speed, r.accuracy, r.recordedAt);
    }
    await conn.query(
      `INSERT INTO workout_points (workout_id, latitude, longitude, speed, accuracy, recorded_at)
       VALUES ${values}`,
      params
    );
  }
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

function incrementalDistanceKm(prevLast, savedNormalized) {
  if (!savedNormalized.length) return 0;
  let total = 0;
  let last = prevLast;
  for (const p of savedNormalized) {
    if (last) {
      total += haversineKm(last.latitude, last.longitude, p.latitude, p.longitude);
    }
    last = p;
  }
  return Math.round(total * 1000) / 1000;
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
  const prevLast = last;
  const toInsert = [];
  const savedNormalized = [];

  if (!last) {
    for (const raw of list) {
      const p = clampPointToWorkoutStart(workout, raw);
      if (!p || !isValidTrackPoint(p, { acquire: true })) continue;
      if (!isPointTimestampValid(workout, p.recorded_at)) continue;
      const row = preparePointRow(workoutId, p, workout.started_at);
      if (!row) continue;
      toInsert.push(row);
      savedNormalized.push(row.point);
      last = row.point;
      break;
    }
  }

  for (const raw of list) {
    if (!shouldSaveGpsPoint(last, raw)) continue;
    let p = clampPointToWorkoutStart(workout, raw);
    if (!p) continue;
    if (!isPointTimestampValid(workout, p.recorded_at)) continue;
    if (last && isSameCoordinates(last, p)) continue;
    const row = preparePointRow(workoutId, p, workout.started_at);
    if (!row) continue;
    toInsert.push(row);
    savedNormalized.push(row.point);
    last = row.point;
  }

  if (toInsert.length) {
    await insertGpsPointsBulk(pool, toInsert);
  }

  if (meta.steps_count != null) {
    const steps = Math.max(0, Math.floor(Number(meta.steps_count)));
    await pool.query('UPDATE workouts SET steps_count = ? WHERE id = ?', [steps, workoutId]);
  }

  const savedPoints = savedNormalized.map((p) => ({
    lat: p.latitude,
    lng: p.longitude,
    speed: p.speed,
    accuracy: p.accuracy,
    recorded_at: p.recorded_at ?? workout.started_at,
  }));

  let distanceKm = 0;
  if (savedPoints.length) {
    // Prefer incremental distance; fall back to full scan if no previous point
    const delta = incrementalDistanceKm(prevLast, savedNormalized);
    if (prevLast) {
      const base = Number(workout.distance_km) || 0;
      distanceKm = Math.round((base + delta) * 1000) / 1000;
      await pool.query('UPDATE workouts SET distance_km = ? WHERE id = ?', [distanceKm, workoutId]);
    } else {
      distanceKm = await calcWorkoutDistanceKm(workoutId);
      await pool.query('UPDATE workouts SET distance_km = ? WHERE id = ?', [distanceKm, workoutId]);
    }

    const [metaRows] = await pool.query(
      `SELECT u.name AS client_name, u.phone
       FROM workouts w JOIN users u ON u.id = w.user_id WHERE w.id = ?`,
      [workoutId]
    );
    const rowMeta = metaRows[0] || {};
    emitPointReceived(workoutId, savedPoints, distanceKm, {
      client_name: rowMeta.client_name,
      phone: rowMeta.phone,
      points_count: savedPoints.length,
    });
  }

  return { workout, savedPoints, distanceKm };
}

export async function forceStopWorkout(workoutId, userId, reason) {
  const [result] = await pool.query(
    `UPDATE workouts SET
       status = 'rejected',
       reject_reason = ?,
       approved_distance_km = 0,
       finished_at = NOW()
     WHERE id = ? AND user_id = ? AND status IN ('in_progress', 'paused')`,
    [reason, workoutId, userId]
  );
  return result.affectedRows > 0;
}
