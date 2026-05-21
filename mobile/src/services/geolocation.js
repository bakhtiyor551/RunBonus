import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

/** Интервал опроса в браузере / fallback (сек). */
const GPS_INTERVAL_MS = 8000;

/** Минимальное смещение для новой точки маршрута (~5 м). */
export const MIN_SEGMENT_METERS = 5;

export const MAX_ACCURACY_METERS = 50;
export const MAX_SPEED_KMH = 25;

const COORD_EPS = 1e-6;
const MAX_JUMP_METERS = 80;
const MAX_JUMP_SECONDS = 4;
/** Если новая точка в этом радиусе от «центра» последних точек — дрейф. */
const STATIONARY_RADIUS_METERS = 28;
const STATIONARY_RECENT_COUNT = 4;
/** Минимальная скорость сегмента (км/ч), иначе считаем стоянием. */
const MIN_SPEED_KMH = 1.5;
/** Минимум между точками маршрута (мс). */
const MIN_RECORD_INTERVAL_MS = 4000;

function minSegmentForAccuracy(accuracy) {
  const acc = Number(accuracy);
  if (!Number.isFinite(acc) || acc <= 0) return MIN_SEGMENT_METERS;
  return Math.max(MIN_SEGMENT_METERS, Math.min(20, acc * 0.4));
}

function isNearStationaryCluster(recent, pos) {
  if (!recent?.length || !pos) return false;
  let sumLat = 0;
  let sumLon = 0;
  for (const p of recent) {
    sumLat += p.latitude;
    sumLon += p.longitude;
  }
  const cLat = sumLat / recent.length;
  const cLon = sumLon / recent.length;
  return haversineMeters(cLat, cLon, pos.latitude, pos.longitude) < STATIONARY_RADIUS_METERS;
}

function isNative() {
  return Capacitor.isNativePlatform();
}

function permissionOk(status) {
  return status.location === 'granted' || status.location === 'prompt';
}

async function requestAndroidBackgroundLocation() {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    const status = await Geolocation.checkPermissions();
    if (status.location === 'granted') {
      await Geolocation.requestPermissions();
    }
  } catch {
    /* опционально */
  }
}

export async function requestLocationPermission() {
  if (isNative()) {
    try {
      let status = await Geolocation.checkPermissions();
      if (!permissionOk(status)) {
        status = await Geolocation.requestPermissions();
      }
      if (!permissionOk(status)) {
        throw new Error('Включите геолокацию для начала тренировки');
      }
      await requestAndroidBackgroundLocation();
      await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      return true;
    } catch (err) {
      if (err.message?.includes('геолокацию')) throw err;
      throw new Error('Включите геолокацию для начала тренировки');
    }
  }

  if (!navigator.geolocation) {
    throw new Error('Геолокация не поддерживается на этом устройстве');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      () => reject(new Error('Включите геолокацию для начала тренировки')),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

function normalizePosition(pos) {
  const c = pos.coords || pos;
  const rawSpeed = c.speed;
  const mps = rawSpeed != null && rawSpeed >= 0 ? rawSpeed : 0;
  return {
    latitude: c.latitude,
    longitude: c.longitude,
    speed: mps * 3.6,
    accuracy: c.accuracy,
    recorded_at: new Date().toISOString(),
  };
}

export async function getCurrentPosition() {
  if (isNative()) {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
    });
    return normalizePosition(pos);
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(normalizePosition(p)),
      () => reject(new Error('Включите геолокацию для начала тренировки')),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  });
}

/**
 * @returns {Promise<() => void>} stop
 */
export async function startBackgroundTracking(onPosition) {
  if (isNative()) {
    const watchId = await Geolocation.watchPosition(
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 5000,
      },
      (pos, err) => {
        if (err || !pos) return;
        onPosition(normalizePosition(pos));
      }
    );
    return () => Geolocation.clearWatch({ id: watchId });
  }

  if (navigator.geolocation) {
    const watchId = navigator.geolocation.watchPosition(
      (p) => onPosition(normalizePosition(p)),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }

  const intervalId = setInterval(async () => {
    try {
      const pos = await getCurrentPosition();
      onPosition(pos);
    } catch {
      /* retry */
    }
  }, GPS_INTERVAL_MS);

  return () => clearInterval(intervalId);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
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

function isValidTrackPoint(pos) {
  if (pos.accuracy != null && pos.accuracy > MAX_ACCURACY_METERS) {
    return false;
  }
  if (pos.speed != null && pos.speed > MAX_SPEED_KMH) {
    return false;
  }
  return true;
}

/**
 * Стоит ли добавить точку в маршрут.
 */
export function shouldRecordGpsPoint(last, pos, recentPoints = []) {
  if (!isValidTrackPoint(pos)) {
    return { record: false, reason: 'accuracy_or_speed' };
  }

  if (!last) {
    return { record: true, segmentMeters: 0 };
  }
  if (isSameCoordinates(last, pos)) {
    return { record: false, reason: 'duplicate' };
  }

  const elapsedMs = new Date(pos.recorded_at) - new Date(last.recorded_at);
  if (elapsedMs > 0 && elapsedMs < MIN_RECORD_INTERVAL_MS) {
    return { record: false, reason: 'interval' };
  }

  const distM = haversineMeters(last.latitude, last.longitude, pos.latitude, pos.longitude);
  const minSeg = minSegmentForAccuracy(pos.accuracy ?? last.accuracy);

  if (distM < minSeg) {
    return { record: false, reason: 'drift', distM };
  }

  const recent = recentPoints.length
    ? recentPoints.slice(-STATIONARY_RECENT_COUNT)
    : [last];
  if (isNearStationaryCluster(recent, pos)) {
    return { record: false, reason: 'stationary', distM };
  }

  if (isGpsJump(last, pos, distM)) {
    return { record: false, reason: 'jump', distM };
  }

  const dt = segmentSeconds(last, pos);
  if (dt != null && dt > 0 && dt < 120) {
    const speedKmh = (distM / 1000 / dt) * 3600;
    if (speedKmh < MIN_SPEED_KMH) {
      return { record: false, reason: 'slow', distM };
    }
  }

  return { record: true, segmentMeters: distM };
}

/** Подготовка маршрута: валидные точки без подряд идущих дублей. */
export function prepareTrackPoints(points) {
  if (!points?.length) return [];
  const sorted = [...points].sort(
    (a, b) => new Date(a.recorded_at) - new Date(b.recorded_at)
  );
  const out = [];
  for (const p of sorted) {
    if (!isValidTrackPoint(p)) continue;
    const last = out[out.length - 1];
    if (last && isSameCoordinates(last, p)) continue;
    out.push(p);
  }
  return out;
}

/** Дистанция: сумма Haversine между соседними точками. */
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

/** Оставить только значимые точки маршрута (для отправки на сервер). */
export function filterTrackPoints(points) {
  return prepareTrackPoints(points);
}

export function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export const WORKOUT_STORAGE_KEY = (id) => `runbonus_workout_${id}`;
export const ACTIVE_WORKOUT_ID_KEY = 'runbonus_active_workout_id';

export function setActiveWorkoutId(id) {
  if (id != null && id !== '') {
    localStorage.setItem(ACTIVE_WORKOUT_ID_KEY, String(id));
  } else {
    localStorage.removeItem(ACTIVE_WORKOUT_ID_KEY);
  }
}

export function getActiveWorkoutId() {
  const raw = localStorage.getItem(ACTIVE_WORKOUT_ID_KEY);
  return raw ? Number(raw) : null;
}

export function saveWorkoutLocal(id, data) {
  try {
    localStorage.setItem(WORKOUT_STORAGE_KEY(id), JSON.stringify(data));
  } catch {
    /* quota */
  }
}

export function loadWorkoutLocal(id) {
  try {
    const raw = localStorage.getItem(WORKOUT_STORAGE_KEY(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearWorkoutLocal(id) {
  localStorage.removeItem(WORKOUT_STORAGE_KEY(id));
}
