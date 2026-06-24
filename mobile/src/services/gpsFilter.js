/** Макс. погрешность GPS (м) — точки хуже отбрасываются. */
export const GPS_MAX_ACCURACY_M = 15;

/** Для первой точки маршрута допускаем более слабый сигнал (Android / помещение). */
export const GPS_ACQUIRE_ACCURACY_M = 120;

/** Мин. смещение между сохранёнными точками (м). */
export const GPS_MIN_SEGMENT_M = 2.5;

/** Оптимальный интервал между точками (мс). */
export const GPS_MIN_INTERVAL_MS = 1000;

/** Слишком старая точка — не учитывать (мс). */
export const GPS_MAX_INTERVAL_MS = 15000;

/** Ниже — считаем скорость нулевой (м/с). */
export const GPS_STATIONARY_SPEED_MPS = 0.2;

export const GPS_AUTO_PAUSE_SPEED_MPS = 0.5;
export const GPS_AUTO_RESUME_SPEED_MPS = 0.8;
export const GPS_AUTO_PAUSE_MS = 4000;

export const SPEED_AVERAGE_WINDOW = 3;

/** Лимит скорости для отсечения выбросов (км/ч). */
export const MAX_SPEED_KMH = 19;

const COORD_EPS = 1e-6;
const MAX_JUMP_METERS = 80;
const MAX_JUMP_SECONDS = 4;

export function normalizeSpeedMps(rawSpeed) {
  const v = Number(rawSpeed);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

/** Скорость из coords: Capacitor отдаёт м/с. */
export function speedKmhToMps(kmh) {
  return (Number(kmh) || 0) / 3.6;
}

export function speedMpsToKmh(mps) {
  const v = Number(mps) || 0;
  if (v < GPS_STATIONARY_SPEED_MPS) return 0;
  return Math.round(v * 3.6 * 10) / 10;
}

export function movingAverageSpeedMps(samples) {
  if (!samples?.length) return 0;
  const slice = samples.slice(-SPEED_AVERAGE_WINDOW);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / slice.length;
}

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function isSameCoordinates(a, b) {
  if (!a || !b) return false;
  return (
    Math.abs(a.latitude - b.latitude) < COORD_EPS &&
    Math.abs(a.longitude - b.longitude) < COORD_EPS
  );
}

function segmentSeconds(a, b) {
  if (!a?.recorded_at || !b?.recorded_at) return null;
  const dt = (new Date(b.recorded_at) - new Date(a.recorded_at)) / 1000;
  return dt > 0 ? dt : null;
}

function isGpsJump(last, pos, distM) {
  const dt = segmentSeconds(last, pos);
  if (dt == null || dt > MAX_JUMP_SECONDS) return false;
  return distM > MAX_JUMP_METERS;
}

function passesAccuracy(pos, maxAccuracyM) {
  if (!pos) return false;
  const acc = pos.accuracy;
  if (acc != null && Number(acc) > maxAccuracyM) return false;
  if (pos.speed != null && Number(pos.speed) > MAX_SPEED_KMH) return false;
  return true;
}

export function isValidTrackPoint(pos) {
  return passesAccuracy(pos, GPS_MAX_ACCURACY_M);
}

/**
 * Фильтры точности, времени и минимального смещения перед записью в маршрут.
 */
export function shouldRecordGpsPoint(last, pos) {
  const maxAcc = last ? GPS_MAX_ACCURACY_M : GPS_ACQUIRE_ACCURACY_M;
  if (!passesAccuracy(pos, maxAcc)) {
    return { record: false, reason: 'accuracy_or_speed' };
  }

  if (!last) {
    return { record: true, segmentMeters: 0 };
  }

  if (isSameCoordinates(last, pos)) {
    return { record: false, reason: 'duplicate' };
  }

  const elapsedMs = new Date(pos.recorded_at) - new Date(last.recorded_at);
  if (elapsedMs > 0 && elapsedMs < GPS_MIN_INTERVAL_MS) {
    return { record: false, reason: 'interval_fast' };
  }
  if (elapsedMs > GPS_MAX_INTERVAL_MS) {
    return { record: false, reason: 'interval_stale' };
  }

  const distM = haversineMeters(last.latitude, last.longitude, pos.latitude, pos.longitude);

  if (distM < GPS_MIN_SEGMENT_M) {
    return { record: false, reason: 'min_distance', distM };
  }

  const speedMps = normalizeSpeedMps(pos.speedMps ?? (pos.speed != null ? pos.speed / 3.6 : null));
  if (speedMps < GPS_STATIONARY_SPEED_MPS) {
    return { record: false, reason: 'stationary_speed', distM };
  }

  if (isGpsJump(last, pos, distM)) {
    return { record: false, reason: 'jump', distM };
  }

  return { record: true, segmentMeters: distM };
}

export function prepareTrackPoints(points) {
  if (!points?.length) return [];
  const sorted = [...points].sort(
    (a, b) => new Date(a.recorded_at) - new Date(b.recorded_at)
  );
  const out = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    const { record } = shouldRecordGpsPoint(last, p);
    if (record) out.push(p);
  }
  return out;
}

/** Сумма Haversine между соседними точками (км). */
export function haversineKm(points) {
  const track = prepareTrackPoints(points);
  if (track.length < 2) return 0;

  let distM = 0;
  for (let i = 1; i < track.length; i++) {
    distM += haversineMeters(
      track[i - 1].latitude,
      track[i - 1].longitude,
      track[i].latitude,
      track[i].longitude
    );
  }
  return Math.round((distM / 1000) * 1000) / 1000;
}

export function computeAvgSpeedKmh(distanceKm, movingSeconds) {
  if (!movingSeconds || movingSeconds <= 0 || !distanceKm) return 0;
  return (distanceKm / movingSeconds) * 3600;
}
