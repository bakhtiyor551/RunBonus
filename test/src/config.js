import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function httpToWs(base) {
  if (/^wss:\/\//i.test(base)) return base;
  if (/^ws:\/\//i.test(base)) return base;
  if (/^https:\/\//i.test(base)) return base.replace(/^https/i, 'wss');
  return base.replace(/^http/i, 'ws');
}

const fastMode = env('FAST_MODE', 'false').toLowerCase() === 'true';
const baseApiUrl = env('BASE_API_URL', 'http://localhost:3001').replace(/\/$/, '');

export const config = {
  baseApiUrl,
  wsUrl: env('WS_URL') || `${httpToWs(baseApiUrl)}/app/workout`,
  token: env('TEST_USER_TOKEN'),
  phone: env('TEST_USER_PHONE'),
  password: env('TEST_USER_PASSWORD'),
  smsCode: env('TEST_SMS_CODE'),
  noShoePhone: env('TEST_USER_NO_SHOE_PHONE'),
  noShoePassword: env('TEST_USER_NO_SHOE_PASSWORD'),
  deviceId: env('TEST_DEVICE_ID', '00000000-0000-4000-8000-000000000001'),
  shoeCode: env('TEST_SHOE_CODE', 'SHOE-DEMO-001'),
  startLat: Number(env('START_LAT', '38.560000')),
  startLng: Number(env('START_LNG', '68.780000')),
  coordStep: Number(env('COORD_STEP', '0.000100')),
  cycleIntervalMs: fastMode ? 100 : Number(env('CYCLE_INTERVAL_MS', '4000')),
  finishDurationSeconds: Number(env('FINISH_DURATION_SECONDS', '300')),
  runSpeedKmh: 10,
  stepsPerCycle: 6,
  fastMode,
  appVersion: env('APP_VERSION', '1.0.0'),
  /** Душанбе / Худжанд для FRAUD-003 */
  dushanbe: { lat: 38.5598, lng: 68.7738 },
  khujand: { lat: 40.2828, lng: 69.6222 },
  maxGpsAccuracyM: 20,
  forceStopSpeedKmh: 60,
};

export function assertConfig() {
  if (!config.deviceId) throw new Error('Заполните TEST_DEVICE_ID в test/.env');
  if (config.token) return;
  if (!config.phone) {
    throw new Error('Укажите TEST_USER_TOKEN или TEST_USER_PHONE в test/.env');
  }
  if (!config.password && !config.smsCode) {
    throw new Error('Укажите TEST_USER_PASSWORD или TEST_SMS_CODE в test/.env');
  }
}

/** Метров за один шаг координаты (по широте). */
export function metersPerCoordStep() {
  return 111_000 * config.coordStep;
}

/** Число циклов для заданной дистанции в метрах. */
export function metersToCycles(meters) {
  return Math.max(2, Math.ceil(meters / metersPerCoordStep()));
}

/** Минимум циклов для approved (0.5 км на бэкенде). */
export function minApprovedCycles() {
  return metersToCycles(500);
}
