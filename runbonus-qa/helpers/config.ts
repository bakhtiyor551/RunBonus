import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function env(key: string, fallback = ''): string {
  return String(process.env[key] ?? fallback).trim();
}

function envNum(key: string, fallback: number): number {
  const v = Number(env(key, String(fallback)));
  return Number.isFinite(v) ? v : fallback;
}

export const config = {
  baseApiUrl: env('BASE_API_URL', 'http://localhost:3001').replace(/\/$/, ''),
  appPackage: env('ANDROID_APP_PACKAGE', 'com.runbonus.app'),
  appActivity: env('ANDROID_APP_ACTIVITY', 'com.runbonus.app.MainActivity'),
  apkPath: env('APK_PATH', '../mobile/android/app/build/outputs/apk/debug/app-debug.apk'),
  deviceName: env('ANDROID_DEVICE_NAME', 'emulator-5554'),
  platformVersion: env('ANDROID_PLATFORM_VERSION'),
  phone: env('TEST_USER_PHONE'),
  smsCode: env('TEST_SMS_CODE'),
  userToken: env('TEST_USER_TOKEN'),
  deviceId: env('TEST_DEVICE_ID', '00000000-0000-4000-8000-000000000001'),
  shoeCode: env('TEST_SHOE_CODE', 'SHOE-DEMO-001'),
  appVersion: env('APP_VERSION', '1.0.0'),
  startLat: envNum('START_LAT', 38.5598),
  startLng: envNum('START_LNG', 68.7738),
};

export function androidCapabilities(overrides: Record<string, unknown> = {}) {
  const caps: Record<string, unknown> = {
    platformName: 'Android',
    'appium:deviceName': config.deviceName,
    'appium:udid': config.deviceName,
    'appium:automationName': 'UiAutomator2',
    'appium:appPackage': config.appPackage,
    'appium:appActivity': config.appActivity,
    'appium:autoGrantPermissions': true,
    'appium:newCommandTimeout': 300,
    'appium:chromedriverAutodownload': true,
    'appium:ensureWebviewsHavePages': true,
    'appium:webviewConnectTimeout': 90000,
    ...overrides,
  };

  if (config.platformVersion) {
    caps['appium:platformVersion'] = config.platformVersion;
  }

  if (process.env.APK_PATH || config.apkPath) {
    caps['appium:app'] = path.resolve(__dirname, '..', config.apkPath);
  }

  return caps;
}
