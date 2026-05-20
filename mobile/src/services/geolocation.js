import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

const GPS_INTERVAL_MS = 7000;

/** Минимальное смещение между точками маршрута (фильтр дрейфа GPS). */
export const MIN_SEGMENT_METERS = 12;
/** Не принимать точки с точностью хуже (метры). */
export const MAX_ACCURACY_METERS = 50;
/** Скачок координат за короткий интервал — артефакт GPS. */
const MAX_JUMP_METERS = 80;
const MAX_JUMP_SECONDS = 4;

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
    /* опционально: пользователь может включить «Всегда» вручную */
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
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  });
}

/**
 * @returns {Promise<() => void>} stop
 */
export async function startBackgroundTracking(onPosition) {
  if (isNative()) {
    const watchId = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
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
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
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

/**
 * Стоит ли добавить точку в маршрут (отсекает дрейф на месте).
 */
export function shouldRecordGpsPoint(last, pos) {
  if (pos.accuracy != null && pos.accuracy > MAX_ACCURACY_METERS) {
    return { record: false, reason: 'accuracy' };
  }
  if (!last) {
    return { record: true, segmentMeters: 0 };
  }

  const distM = haversineMeters(last.latitude, last.longitude, pos.latitude, pos.longitude);

  if (distM < MIN_SEGMENT_METERS) {
    return { record: false, reason: 'drift', distM };
  }

  if (isGpsJump(last, pos, distM)) {
    return { record: false, reason: 'jump', distM };
  }

  return { record: true, segmentMeters: distM };
}

/** Дистанция только по значимым сегментам маршрута. */
export function haversineKm(points) {
  if (!points?.length) return 0;
  let distM = 0;
  let prev = points[0];
  for (let i = 1; i < points.length; i++) {
    const next = points[i];
    const seg = haversineMeters(prev.latitude, prev.longitude, next.latitude, next.longitude);
    if (seg >= MIN_SEGMENT_METERS) {
      distM += seg;
      prev = next;
    }
  }
  return distM / 1000;
}

/** Пересчитать маршрут: оставить только точки с реальным смещением. */
export function filterTrackPoints(points) {
  if (!points?.length) return [];
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const pos = points[i];
    const last = out[out.length - 1];
    const { record } = shouldRecordGpsPoint(last, pos);
    if (record) out.push(pos);
  }
  return out;
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
