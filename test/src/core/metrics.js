/** Средняя скорость км/ч по дистанции и длительности. */
export function computeAvgSpeedKmh(distanceKm, durationSeconds) {
  if (!durationSeconds || durationSeconds <= 0) return 0;
  return Math.round(((distanceKm / durationSeconds) * 3600) * 10) / 10;
}

export function assertApprox(actual, expected, tolerancePct = 15) {
  const a = Number(actual);
  const e = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(e)) {
    return { ok: false, message: `Нечисловые значения: actual=${actual}, expected=${expected}` };
  }
  if (e === 0) return { ok: a === 0, message: `expected 0, got ${a}` };
  const diff = Math.abs(a - e) / e;
  if (diff > tolerancePct / 100) {
    return {
      ok: false,
      message: `${a} отличается от ${e} более чем на ${tolerancePct}%`,
    };
  }
  return { ok: true };
}

export function assertRange(actual, min, max) {
  const a = Number(actual);
  if (!Number.isFinite(a)) return { ok: false, message: `Нечисловое: ${actual}` };
  if (a < min || a > max) {
    return { ok: false, message: `${a} вне диапазона [${min}, ${max}]` };
  }
  return { ok: true };
}
