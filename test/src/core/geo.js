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

export function haversineMeters(lat1, lon1, lat2, lon2) {
  return haversineKm(lat1, lon1, lat2, lon2) * 1000;
}

export function calcTrackDistanceKm(points) {
  if (!points?.length || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude
    );
  }
  return Math.round(total * 1000) / 1000;
}

export function offsetNorthMeters(lat, lng, meters) {
  const dLat = meters / 111_000;
  return { latitude: lat + dLat, longitude: lng };
}

export function offsetEastMeters(lat, lng, meters) {
  const dLng = meters / (111_000 * Math.cos((lat * Math.PI) / 180));
  return { latitude: lat, longitude: lng + dLng };
}
