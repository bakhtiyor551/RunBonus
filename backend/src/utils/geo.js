const EARTH_RADIUS_KM = 6371;

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

/** Как в мобильном приложении — не считать дрейф GPS на месте. */
const MIN_SEGMENT_KM = 0.012;

export function calcDistanceFromPoints(points) {
  if (!points?.length) return 0;
  let total = 0;
  let prev = points[0];
  for (let i = 1; i < points.length; i++) {
    const next = points[i];
    const seg = haversineKm(prev.latitude, prev.longitude, next.latitude, next.longitude);
    if (seg >= MIN_SEGMENT_KM) {
      total += seg;
      prev = next;
    }
  }
  return total;
}
