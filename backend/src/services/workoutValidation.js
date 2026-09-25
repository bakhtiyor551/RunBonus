import {
  calcDistanceFromPoints,
  haversineKm,
  prepareTrackPoints,
  MAX_GPS_ACCURACY_M,
} from '../utils/geo.js';

const WALK_MIN = 3;
const WALK_MAX = 7;
const RUN_MIN = 7;
const MAX_JUMP_KM = 0.15;
const MAX_JUMP_SEC = 5;
const STALE_COORD_SEC = 120;
const GPS_SPEED_TOLERANCE_KMH = 1;
const MAX_GAP_SEC = 180;
const BAD_ACCURACY_M = 100;

/**
 * GPS validation (TZ §17–18). Backend is source of truth for distance + status.
 * @returns {{
 *   ok: boolean,
 *   status: 'approved'|'suspicious'|'rejected',
 *   reason?: string,
 *   reasons?: string[],
 *   distanceKm?: number,
 *   approvedDistanceKm?: number,
 *   avgSpeed?: number,
 *   maxSpeed?: number,
 *   score?: number,
 * }}
 */
export function validateWorkout(points, durationSeconds, settings) {
  const maxSpeedKmh = Number(settings?.max_speed_kmh ?? 18);
  const runMax = maxSpeedKmh;
  const speedRejectAbove = maxSpeedKmh + GPS_SPEED_TOLERANCE_KMH;

  const reasons = [];
  const track = prepareTrackPoints(points);
  const distanceFromRaw = calcDistanceFromPoints(points);

  if (track.length < 2) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'Недостаточно GPS-точек для маршрута',
      reasons: ['DUPLICATE_POINTS'],
      distanceKm: distanceFromRaw,
      approvedDistanceKm: 0,
      score: 0,
    };
  }

  if (durationSeconds < minDurationSec) {
    reasons.push('UNREALISTIC_DISTANCE');
    return {
      ok: false,
      status: 'rejected',
      reason: `Тренировка меньше ${settings?.min_duration_minutes ?? 5} минут`,
      reasons,
      distanceKm: distanceFromRaw,
      approvedDistanceKm: 0,
      score: 10,
    };
  }

  const distanceKm = calcDistanceFromPoints(track);
  if (distanceKm < minDistanceKm) {
    reasons.push('UNREALISTIC_DISTANCE');
    return {
      ok: false,
      status: 'rejected',
      reason: `Минимум ${minDistanceKm} км`,
      reasons,
      distanceKm,
      approvedDistanceKm: 0,
      score: 15,
    };
  }

  let maxSpeed = 0;
  let invalidSpeedCount = 0;
  let suspiciousCount = 0;
  let jumpCount = 0;
  let badAccuracyCount = 0;
  let lowAccuracyCount = 0;
  let staleCount = 0;
  let gapCount = 0;
  let duplicateCount = 0;
  let timestampIssues = 0;

  const sorted = track;

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const speed = Number(p.speed || 0);
    if (speed > maxSpeed) maxSpeed = speed;

    if (speed > speedRejectAbove) invalidSpeedCount++;
    else if (speed > runMax) suspiciousCount++;

    const acc = p.accuracy != null ? Number(p.accuracy) : null;
    if (acc != null && acc > BAD_ACCURACY_M) badAccuracyCount++;
    else if (acc != null && acc > MAX_GPS_ACCURACY_M) lowAccuracyCount++;

    if (i > 0) {
      const prev = sorted[i - 1];
      const tPrev = new Date(prev.recorded_at).getTime();
      const tCur = new Date(p.recorded_at).getTime();
      const dt = (tCur - tPrev) / 1000;

      if (!Number.isFinite(dt) || dt < 0) {
        timestampIssues++;
      } else if (dt >= MAX_GAP_SEC) {
        gapCount++;
      }

      if (dt > 0 && dt <= MAX_JUMP_SEC) {
        const segKm = haversineKm(
          prev.latitude,
          prev.longitude,
          p.latitude,
          p.longitude
        );
        if (segKm > MAX_JUMP_KM) jumpCount++;
        const segSpeedKmh = (segKm / dt) * 3600;
        if (segSpeedKmh > maxSpeed) maxSpeed = segSpeedKmh;
        if (segSpeedKmh > speedRejectAbove) invalidSpeedCount++;
        else if (segSpeedKmh > runMax) suspiciousCount++;
      }

      if (
        p.latitude === prev.latitude &&
        p.longitude === prev.longitude
      ) {
        if (dt >= STALE_COORD_SEC) staleCount++;
        if (dt < 1) duplicateCount++;
      }
    }
  }

  const speeds = sorted.map((p) => Number(p.speed || 0)).filter((s) => s > 0);
  const avgSpeed =
    speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

  if (timestampIssues > 0) reasons.push('INVALID_TIMESTAMP');
  if (jumpCount > 0) reasons.push('GPS_JUMP');
  if (invalidSpeedCount > 0 || maxSpeed > speedRejectAbove) reasons.push('HIGH_SPEED');
  if (badAccuracyCount > 0 || lowAccuracyCount > sorted.length * 0.4) reasons.push('LOW_ACCURACY');
  if (gapCount > 0) reasons.push('GPS_GAP');
  if (duplicateCount > 5 || staleCount > 2) reasons.push('DUPLICATE_POINTS');

  const uniqueReasons = [...new Set(reasons)];

  let score = 100;
  score -= jumpCount * 8;
  score -= invalidSpeedCount * 5;
  score -= Math.min(30, badAccuracyCount);
  score -= gapCount * 4;
  score -= staleCount * 6;
  score = Math.max(0, Math.min(100, score));

  const fail = (status, reason, extra = {}) => ({
    ok: false,
    status,
    reason,
    reasons: uniqueReasons.length ? uniqueReasons : [status === 'rejected' ? 'UNREALISTIC_DISTANCE' : 'HIGH_SPEED'],
    distanceKm,
    approvedDistanceKm: 0,
    avgSpeed,
    maxSpeed,
    score,
    ...extra,
  });

  if (maxSpeed > speedRejectAbove) {
    return fail('rejected', `Максимальная скорость ${maxSpeed.toFixed(1)} км/ч превышает лимит ${maxSpeedKmh} км/ч`);
  }

  if (invalidSpeedCount > 0) {
    return fail('rejected', `Превышен лимит скорости ${maxSpeedKmh} км/ч`);
  }

  if (jumpCount > 3) {
    return fail('rejected', 'Подозрительные скачки GPS');
  }

  if (badAccuracyCount > sorted.length * 0.5) {
    return fail('rejected', 'Слабый сигнал GPS');
  }

  if (staleCount > 2) {
    return fail('rejected', 'Одинаковые координаты слишком долго');
  }

  if (timestampIssues > 2) {
    return fail('rejected', 'Некорректные метки времени GPS');
  }

  if (suspiciousCount > sorted.length * 0.3 || gapCount > 3 || jumpCount > 0) {
    return fail('suspicious', jumpCount > 0 ? 'Подозрительные скачки GPS' : 'Подозрительная скорость');
  }

  const validPace =
    (avgSpeed >= WALK_MIN && avgSpeed <= WALK_MAX) ||
    (avgSpeed >= RUN_MIN && avgSpeed <= runMax) ||
    avgSpeed === 0;
  if (!validPace && avgSpeed > runMax) {
    return fail('suspicious', 'Средняя скорость вне нормы');
  }

  // Unrealistic: > ~25 km/h average for duration
  const overallKmh = durationSeconds > 0 ? (distanceKm / durationSeconds) * 3600 : 0;
  if (overallKmh > speedRejectAbove) {
    uniqueReasons.push('UNREALISTIC_DISTANCE');
    return fail('rejected', 'Нереалистичная дистанция за время тренировки');
  }

  return {
    ok: true,
    status: 'approved',
    reasons: uniqueReasons,
    distanceKm,
    approvedDistanceKm: distanceKm,
    avgSpeed,
    maxSpeed,
    score,
  };
}
