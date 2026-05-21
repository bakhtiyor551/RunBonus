const EARTH_RADIUS_KM = 6371;

/** ~0.1 м — считать координаты одинаковыми */
const COORD_EPS = 1e-6;

export const MAX_GPS_ACCURACY_M = 50;
export const MAX_GPS_SPEED_KMH = 25;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function normalizeGpsPoint(p) {
  const lat = Number(p.latitude ?? p.lat);
  const lng = Number(p.longitude ?? p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    latitude: lat,
    longitude: lng,
    speed: p.speed != null && p.speed !== '' ? Number(p.speed) : null,
    accuracy: p.accuracy != null && p.accuracy !== '' ? Number(p.accuracy) : null,
    recorded_at: p.recorded_at,
  };
}

export function isSameCoordinates(a, b) {
  if (!a || !b) return false;
  return (
    Math.abs(Number(a.latitude) - Number(b.latitude)) < COORD_EPS &&
    Math.abs(Number(a.longitude) - Number(b.longitude)) < COORD_EPS
  );
}

/** Точка не участвует в маршруте (плохой GPS или слишком быстро). */
export function isValidTrackPoint(p) {
  if (!p) return false;
  if (p.accuracy != null && Number(p.accuracy) > MAX_GPS_ACCURACY_M) return false;
  if (p.speed != null && Number(p.speed) > MAX_GPS_SPEED_KMH) return false;
  return true;
}

/**
 * Сортировка, отсев плохих точек, удаление подряд идущих дублей координат.
 */
export function prepareTrackPoints(points) {
  if (!points?.length) return [];

  const sorted = points
    .map(normalizeGpsPoint)
    .filter(Boolean)
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));

  const out = [];
  for (const p of sorted) {
    if (!isValidTrackPoint(p)) continue;
    const last = out[out.length - 1];
    if (last && isSameCoordinates(last, p)) continue;
    out.push(p);
  }
  return out;
}

/** Сумма расстояний Haversine между соседними точками маршрута. */
export function calcDistanceFromPoints(points) {
  const track = prepareTrackPoints(points);
  if (track.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < track.length; i++) {
    total += haversineKm(
      track[i - 1].latitude,
      track[i - 1].longitude,
      track[i].latitude,
      track[i].longitude
    );
  }
  return Math.round(total * 1000) / 1000;
}

/** Нужно ли сохранять точку в БД (не дубль последней). */
export function shouldSaveGpsPoint(last, point) {
  const p = normalizeGpsPoint(point);
  if (!p || !isValidTrackPoint(p)) return false;
  if (last && isSameCoordinates(last, p)) return false;
  return true;
}
