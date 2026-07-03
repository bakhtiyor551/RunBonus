import { config } from '../config.js';

export function createTrackGenerator(options = {}) {
  const step = options.coordStep ?? config.coordStep;
  const startLat = options.startLat ?? config.startLat;
  const startLng = options.startLng ?? config.startLng;
  const intervalMs = options.intervalMs ?? config.cycleIntervalMs;
  const speedKmh = options.speedKmh ?? config.runSpeedKmh;
  const stepsPerCycle = options.stepsPerCycle ?? config.stepsPerCycle;

  let lat = startLat;
  let lng = startLng;
  let totalSteps = 0;
  let cycle = 0;
  const startedAt = Date.now();
  const allPoints = [];

  return {
    get cycle() {
      return cycle;
    },
    get totalSteps() {
      return totalSteps;
    },
    get allPoints() {
      return allPoints;
    },

    next(overrides = {}) {
      cycle += 1;
      if (overrides.latitude != null && overrides.longitude != null) {
        lat = overrides.latitude;
        lng = overrides.longitude;
      } else {
        lat += overrides.latDelta ?? step;
        lng += overrides.lngDelta ?? 0;
      }
      totalSteps += stepsPerCycle;

      const point = {
        latitude: lat,
        longitude: lng,
        speed: overrides.speed ?? speedKmh,
        accuracy: overrides.accuracy ?? 5,
        recorded_at: new Date(
          startedAt + cycle * intervalMs
        ).toISOString(),
      };
      allPoints.push(point);
      return { point, steps: totalSteps, cycle };
    },

    /** Генерировать N точек без ожидания. */
    generate(count) {
      const batch = [];
      for (let i = 0; i < count; i++) batch.push(this.next());
      return batch;
    },
  };
}

export async function waitCycle(intervalMs = config.cycleIntervalMs) {
  await new Promise((r) => setTimeout(r, intervalMs));
}
