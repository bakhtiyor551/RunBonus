import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

const GPS_INTERVAL_MS = 7000;

function isNative() {
  return Capacitor.isNativePlatform();
}

function permissionOk(status) {
  return status.location === 'granted' || status.location === 'prompt';
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
  return {
    latitude: c.latitude,
    longitude: c.longitude,
    speed: (c.speed != null ? c.speed : 0) * 3.6,
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
      { enableHighAccuracy: true, timeout: 20000 },
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

export function haversineKm(points) {
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const R = 6371;
    const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
    const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a.latitude * Math.PI) / 180) *
        Math.cos((b.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    dist += R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  return dist;
}

export function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export const WORKOUT_STORAGE_KEY = (id) => `runbonus_workout_${id}`;

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
