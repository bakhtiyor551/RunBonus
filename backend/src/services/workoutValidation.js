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
/** Допуск на шум GPS (км/ч) — выше лимита из настроек всё равно отклоняем. */
const GPS_SPEED_TOLERANCE_KMH = 1;

export function validateWorkout(points, durationSeconds, settings) {
  const minDurationSec = (settings?.min_duration_minutes ?? 5) * 60;
  const minDistanceKm = settings?.min_distance_km ?? 0.5;
  const maxSpeedKmh = Number(settings?.max_speed_kmh ?? 18);
  const runMax = maxSpeedKmh;
  const speedRejectAbove = maxSpeedKmh + GPS_SPEED_TOLERANCE_KMH;

  const track = prepareTrackPoints(points);
  const distanceFromRaw = calcDistanceFromPoints(points);

  if (track.length < 2) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'Недостаточно GPS-точек для маршрута',
      distanceKm: distanceFromRaw,
    };
  }

  if (durationSeconds < minDurationSec) {
    return {
      ok: false,
      status: 'rejected',
      reason: `Тренировка меньше ${settings?.min_duration_minutes ?? 5} минут`,
    };
  }

  const distanceKm = calcDistanceFromPoints(track);
  if (distanceKm < minDistanceKm) {
    return {
      ok: false,
      status: 'rejected',
      reason: `Минимум ${minDistanceKm} км`,
    };
  }

  let maxSpeed = 0;
  let invalidSpeedCount = 0;
  let suspiciousCount = 0;
  let jumpCount = 0;
  let badAccuracyCount = 0;
  let staleCount = 0;

  const sorted = track;

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const speed = Number(p.speed || 0);
    if (speed > maxSpeed) maxSpeed = speed;

    if (speed > speedRejectAbove) invalidSpeedCount++;
    else if (speed > runMax) suspiciousCount++;

    if (p.accuracy != null && Number(p.accuracy) > MAX_GPS_ACCURACY_M) {
      badAccuracyCount++;
    }

    if (i > 0) {
      const prev = sorted[i - 1];
      const dt =
        (new Date(p.recorded_at) - new Date(prev.recorded_at)) / 1000;
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
        p.longitude === prev.longitude &&
        dt >= STALE_COORD_SEC
      ) {
        staleCount++;
      }
    }
  }

  const speeds = sorted.map((p) => Number(p.speed || 0)).filter((s) => s > 0);
  const avgSpeed =
    speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

  if (maxSpeed > speedRejectAbove) {
    return {
      ok: false,
      status: 'rejected',
      reason: `Максимальная скорость ${maxSpeed.toFixed(1)} км/ч превышает лимит ${maxSpeedKmh} км/ч`,
      distanceKm,
      avgSpeed,
      maxSpeed,
    };
  }

  if (invalidSpeedCount > 0) {
    return {
      ok: false,
      status: 'rejected',
      reason: `Превышен лимит скорости ${maxSpeedKmh} км/ч`,
      distanceKm,
      avgSpeed,
      maxSpeed,
    };
  }

  if (jumpCount > 3) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'Подозрительные скачки GPS',
      distanceKm,
      avgSpeed,
      maxSpeed,
    };
  }

  if (badAccuracyCount > sorted.length * 0.5) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'Слабый сигнал GPS',
      distanceKm,
      avgSpeed,
      maxSpeed,
    };
  }

  if (staleCount > 2) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'Одинаковые координаты слишком долго',
      distanceKm,
      avgSpeed,
      maxSpeed,
    };
  }

  if (suspiciousCount > sorted.length * 0.3) {
    return {
      ok: false,
      status: 'suspicious',
      reason: 'Подозрительная скорость',
      distanceKm,
      avgSpeed,
      maxSpeed,
    };
  }

  const validPace =
    (avgSpeed >= WALK_MIN && avgSpeed <= WALK_MAX) ||
    (avgSpeed >= RUN_MIN && avgSpeed <= runMax);
  if (!validPace && avgSpeed > runMax) {
    return {
      ok: false,
      status: 'suspicious',
      reason: 'Средняя скорость вне нормы',
      distanceKm,
      avgSpeed,
      maxSpeed,
    };
  }

  return { ok: true, status: 'approved', distanceKm, avgSpeed, maxSpeed };
}
