import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import {
  GPS_MAX_ACCURACY_M,
  GPS_MIN_SEGMENT_M,
  haversineKm,
  haversineMeters,
  isSameCoordinates,
  isValidTrackPoint,
  normalizeSpeedMps,
  prepareTrackPoints,
  shouldRecordGpsPoint,
  speedMpsToKmh,
} from './gpsFilter';

export {
  GPS_MAX_ACCURACY_M as MAX_ACCURACY_METERS,
  GPS_MIN_SEGMENT_M as MIN_SEGMENT_METERS,
  haversineKm,
  isSameCoordinates,
  shouldRecordGpsPoint,
};

/** Интервал опроса в браузере / fallback (мс). */
const GPS_INTERVAL_MS = 8000;

function isNative() {
  return Capacitor.isNativePlatform();
}

function isAndroid() {
  return Capacitor.getPlatform() === 'android';
}

async function ensureLocationEnabled() {
  try {
    const status = await Geolocation.checkPermissions();
    if (status.location === 'denied') {
      throw new Error('Включите геолокацию для начала тренировки');
    }
  } catch (err) {
    if (err.message?.includes('геолокацию') || err.message?.includes('Location services')) {
      throw new Error(
        err.message.includes('геолокацию')
          ? err.message
          : 'Включите GPS в настройках телефона'
      );
    }
    throw err;
  }
}

export async function requestLocationPermission() {
  if (isNative()) {
    await ensureLocationEnabled();

    let status = await Geolocation.checkPermissions();
    if (status.location !== 'granted') {
      status = await Geolocation.requestPermissions();
    }
    if (status.location !== 'granted') {
      throw new Error('Включите геолокацию для начала тренировки');
    }

    await warmUpGpsFix();
    return true;
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

async function warmUpGpsFix() {
  try {
    await getCurrentPosition();
  } catch {
    /* Первый фикс может прийти позже через watchPosition */
  }
}

function normalizePosition(pos) {
  const c = pos.coords || pos;
  const lat = Number(c.latitude);
  const lng = Number(c.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const speedMps = normalizeSpeedMps(c.speed);
  return {
    latitude: lat,
    longitude: lng,
    speedMps,
    speed: speedMpsToKmh(speedMps),
    accuracy: c.accuracy,
    recorded_at: new Date().toISOString(),
  };
}

export async function getCurrentPosition() {
  if (isNative()) {
    const attempts = isAndroid()
      ? [
          { enableHighAccuracy: true, timeout: 25000, maximumAge: 5000 },
          { enableHighAccuracy: true, timeout: 25000, maximumAge: 30000 },
          { enableHighAccuracy: false, timeout: 20000, maximumAge: 120000 },
        ]
      : [{ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }];

    let lastErr;
    for (const options of attempts) {
      try {
        const pos = await Geolocation.getCurrentPosition(options);
        const normalized = normalizePosition(pos);
        if (normalized) return normalized;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('GPS сигнал недоступен');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const normalized = normalizePosition(p);
        if (normalized) resolve(normalized);
        else reject(new Error('GPS сигнал недоступен'));
      },
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
        timeout: 30000,
        maximumAge: isAndroid() ? 5000 : 2000,
        minimumUpdateInterval: 1000,
      },
      (pos, err) => {
        if (err) return;
        if (!pos) return;
        const normalized = normalizePosition(pos);
        if (normalized) onPosition(normalized);
      }
    );

    getCurrentPosition()
      .then((pos) => onPosition(pos))
      .catch(() => {});

    return () => Geolocation.clearWatch({ id: watchId });
  }

  if (navigator.geolocation) {
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        const normalized = normalizePosition(p);
        if (normalized) onPosition(normalized);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }

  const intervalId = setInterval(async () => {
    try {
      const position = await getCurrentPosition();
      onPosition(position);
    } catch {
      /* retry */
    }
  }, GPS_INTERVAL_MS);

  return () => clearInterval(intervalId);
}

/** Подготовка маршрута для отображения / отправки. */
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

// Re-export for tests / map utilities
export { haversineMeters, isValidTrackPoint };
