import { execSync } from 'child_process';
import { config } from './config';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** adb emu geo fix <longitude> <latitude> */
export function setGeoFix(longitude: number, latitude: number): void {
  execSync(
    `adb -s ${config.deviceName} emu geo fix ${longitude} ${latitude}`,
    { stdio: 'pipe' }
  );
}

/** Генерация маршрута: шаг на север ~11 м за точку. */
export function generateRoute(
  startLat: number,
  startLng: number,
  distanceMeters: number,
  stepMeters = 11
): GeoPoint[] {
  const steps = Math.max(2, Math.ceil(distanceMeters / stepMeters));
  const dLat = stepMeters / 111_000;
  const points: GeoPoint[] = [];

  for (let i = 0; i < steps; i++) {
    points.push({
      latitude: startLat + dLat * i,
      longitude: startLng,
    });
  }
  return points;
}

/** Проиграть маршрут с интервалом. */
export async function playRoute(
  points: GeoPoint[],
  intervalMs = 2000
): Promise<void> {
  for (const p of points) {
    setGeoFix(p.longitude, p.latitude);
    await driver.pause(intervalMs);
  }
}

export async function playRouteKm(km: number, intervalMs = 2000): Promise<GeoPoint[]> {
  const points = generateRoute(config.startLat, config.startLng, km * 1000);
  await playRoute(points, intervalMs);
  return points;
}

/** Телепорт (антифрод): Душанбе → Худжанд. */
export function teleportDushanbeToKhujand(): void {
  setGeoFix(68.7738, 38.5598);
  setGeoFix(69.6222, 40.2828);
}

/** Имитация скорости автомобиля: большой скачок за короткое время. */
export async function simulateCarSpeed(): Promise<void> {
  setGeoFix(config.startLng, config.startLat);
  await driver.pause(500);
  setGeoFix(config.startLng + 0.02, config.startLat + 0.01);
}
