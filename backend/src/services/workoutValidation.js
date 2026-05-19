import { calcDistanceFromPoints } from '../utils/geo.js';

const WALK_MIN = 3;
const WALK_MAX = 7;
const RUN_MIN = 7;
const MAX_JUMP_KM = 0.15;
const MAX_JUMP_SEC = 5;
const STALE_COORD_SEC = 120;
const MIN_ACCURACY_METERS = 80;
const SUSPICIOUS_MARGIN = 7;

export function validateWorkout(points, durationSeconds, settings) {
  const minDurationSec = (settings?.min_duration_minutes ?? 5) * 60;
  const minDistanceKm = settings?.min_distance_km ?? 0.5;
  const maxSpeedKmh = settings?.max_speed_kmh ?? 18;
  const runMax = maxSpeedKmh;
  const suspiciousMax = maxSpeedKmh + SUSPICIOUS_MARGIN;
  const rejectMax = maxSpeedKmh + 22;

  if (!points || points.length < 2) {
    return { ok: false, status: 'rejected', reason: 'Недостаточно GPS-точек' };
  }

  if (durationSeconds < minDurationSec) {
    return {
      ok: false,
      status: 'rejected',
      reason: `Тренировка меньше ${settings?.min_duration_minutes ?? 5} минут`,
    };
  }

  const distanceKm = calcDistanceFromPoints(points);
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

  const sorted = [...points].sort(
    (a, b) => new Date(a.recorded_at) - new Date(b.recorded_at)
  );

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const speed = Number(p.speed || 0);
    if (speed > maxSpeed) maxSpeed = speed;

    if (speed > rejectMax) invalidSpeedCount++;
    else if (speed > suspiciousMax) suspiciousCount++;

    const inWalk = speed >= WALK_MIN && speed <= WALK_MAX;
    const inRun = speed >= RUN_MIN && speed <= runMax;
    if (speed > 0 && speed < WALK_MIN) invalidSpeedCount++;
    if (speed > runMax && speed <= suspiciousMax) suspiciousCount++;

    if (p.accuracy != null && Number(p.accuracy) > MIN_ACCURACY_METERS) {
      badAccuracyCount++;
    }

    if (i > 0) {
      const prev = sorted[i - 1];
      const dt =
        (new Date(p.recorded_at) - new Date(prev.recorded_at)) / 1000;
      if (dt > 0 && dt <= MAX_JUMP_SEC) {
        const segKm =
          Math.abs(p.latitude - prev.latitude) +
          Math.abs(p.longitude - prev.longitude);
        if (segKm > 0.01) {
          const approxKm = segKm * 111;
          if (approxKm > MAX_JUMP_KM) jumpCount++;
        }
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

  if (invalidSpeedCount > sorted.length * 0.2) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'Слишком высокая скорость (возможно транспорт)',
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
