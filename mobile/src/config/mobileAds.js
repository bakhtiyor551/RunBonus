import { Capacitor } from '@capacitor/core';
import { isGoogleAdsAllowedByServer } from '../services/adSettings';

/** Тестовые ID Google AdMob (замените на свои в .env.production). */
const TEST = {
  appId: 'ca-app-pub-3940255089942544~3347511713',
  google: {
    ios: 'ca-app-pub-3940255089942544/2934735716',
    android: 'ca-app-pub-3940255089942544/6300978111',
  },
  play: {
    ios: 'ca-app-pub-3940255089942544/2934735716',
    android: 'ca-app-pub-3940255089942544/6300978111',
  },
};

function platformKey() {
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
}

function envOrTest(envKey, testKey) {
  const fromEnv = import.meta.env[envKey];
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  return TEST[testKey]?.[platformKey()] || '';
}

export function admobAppId() {
  const fromEnv = import.meta.env.VITE_ADMOB_APP_ID;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  return TEST.appId;
}

/** @param {'google' | 'play'} network @param {'home' | 'workout' | 'shop'} page */
export function adUnitId(network, page) {
  const key = `VITE_ADMOB_${network.toUpperCase()}_${page.toUpperCase()}`;
  return envOrTest(key, network);
}

export function adsEnabled() {
  if (import.meta.env.VITE_ADMOB_ENABLED === 'false') return false;
  if (!Capacitor.isNativePlatform()) return false;
  return isGoogleAdsAllowedByServer();
}

export const AD_SLOT_HEIGHT = {
  banner: 50,
  play: 60,
};
