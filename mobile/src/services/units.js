const UNITS_KEY = 'runbonus_distance_units';

/** @typedef {'metric' | 'imperial'} DistanceUnits */

/** @returns {DistanceUnits} */
export function getDistanceUnits() {
  const raw = localStorage.getItem(UNITS_KEY);
  return raw === 'imperial' ? 'imperial' : 'metric';
}

/** @param {DistanceUnits} units */
export function setDistanceUnits(units) {
  localStorage.setItem(UNITS_KEY, units === 'imperial' ? 'imperial' : 'metric');
}

export function kmToDisplay(km, units = getDistanceUnits()) {
  const value = Number(km) || 0;
  if (units === 'imperial') {
    return { value: value * 0.621371, unit: 'mi', label: 'мили' };
  }
  if (value < 1) {
    return { value: value * 1000, unit: 'm', label: 'метры' };
  }
  return { value, unit: 'km', label: 'км' };
}

export function speedKmhToDisplay(kmh, units = getDistanceUnits()) {
  const value = Number(kmh) || 0;
  if (units === 'imperial') {
    return { value: value * 0.621371, unit: 'mph', label: 'мили/ч' };
  }
  return { value, unit: 'km/h', label: 'км/ч' };
}

export function formatDistance(km, units = getDistanceUnits()) {
  const d = kmToDisplay(km, units);
  if (d.unit === 'm') return `${Math.round(d.value)} м`;
  if (d.unit === 'mi') return `${d.value.toFixed(2)} ${d.unit}`;
  return `${d.value.toFixed(2)} ${d.unit}`;
}

export function formatSpeed(kmh, units = getDistanceUnits()) {
  const s = speedKmhToDisplay(kmh, units);
  return `${s.value.toFixed(1)} ${s.unit}`;
}

export function formatPace(kmh, units = getDistanceUnits()) {
  const speed = Number(kmh) || 0;
  if (speed <= 0) return '—';
  const secPerKm = 3600 / speed;
  if (units === 'imperial') {
    const secPerMi = secPerKm * 1.60934;
    const m = Math.floor(secPerMi / 60);
    const s = Math.round(secPerMi % 60);
    return `${m}:${String(s).padStart(2, '0')} /mi`;
  }
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')} /km`;
}
