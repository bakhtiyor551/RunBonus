import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

function requireEnv(name, fallback = '') {
  const v = process.env[name] ?? fallback;
  return String(v).trim();
}

function httpToWs(base) {
  if (/^wss:\/\//i.test(base)) return base;
  if (/^ws:\/\//i.test(base)) return base;
  if (/^https:\/\//i.test(base)) return base.replace(/^https/i, 'wss');
  return base.replace(/^http/i, 'ws');
}

const baseApiUrl = requireEnv('BASE_API_URL', 'http://localhost:3001').replace(/\/$/, '');
const wsUrlExplicit = requireEnv('WS_URL');

export const config = {
  baseApiUrl,
  wsUrl: wsUrlExplicit || `${httpToWs(baseApiUrl)}/app/workout`,
  token: requireEnv('TEST_USER_TOKEN'),
  phone: requireEnv('TEST_USER_PHONE'),
  password: requireEnv('TEST_USER_PASSWORD'),
  smsCode: requireEnv('TEST_SMS_CODE'),
  deviceId: requireEnv('TEST_DEVICE_ID', '00000000-0000-4000-8000-000000000001'),
  shoeCode: requireEnv('TEST_SHOE_CODE', 'SHOE-DEMO-001'),
  startLat: Number(requireEnv('START_LAT', '38.560000')),
  startLng: Number(requireEnv('START_LNG', '68.780000')),
  cycleIntervalMs: Number(requireEnv('CYCLE_INTERVAL_MS', '4000')),
  coordStep: Number(requireEnv('COORD_STEP', '0.000100')),
  scenarioACycles: Number(requireEnv('SCENARIO_A_CYCLES', '45')),
  finishDurationSeconds: Number(requireEnv('FINISH_DURATION_SECONDS', '300')),
  runSpeedKmh: 10,
  stepsPerCycle: 6,
};

export function assertConfig() {
  if (!config.deviceId) {
    throw new Error('Заполните TEST_DEVICE_ID в testirov/.env');
  }
  if (config.token) return;

  if (!config.phone) {
    throw new Error(
      'Укажите в testirov/.env один из вариантов:\n' +
        '  • TEST_USER_TOKEN — JWT из приложения (localStorage → token)\n' +
        '  • TEST_USER_PHONE + TEST_USER_PASSWORD — вход по паролю\n' +
        '  • TEST_USER_PHONE + TEST_SMS_CODE — вход по SMS (npm run auth:sms-send)'
    );
  }

  if (!config.password && !config.smsCode) {
    throw new Error(
      `Для ${config.phone} не задан способ входа:\n` +
        '  • TEST_USER_PASSWORD=ваш_пароль\n' +
        '  • TEST_SMS_CODE=код_из_SMS (сначала: npm run auth:sms-send)\n' +
        '  • TEST_USER_TOKEN=eyJ... (скопировать из приложения)'
    );
  }
}
