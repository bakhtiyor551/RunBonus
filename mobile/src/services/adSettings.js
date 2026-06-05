import { api } from '../api';

const STORAGE_KEY = 'rb_google_ads_enabled';

let googleAdsEnabled = readCache() ?? true;
const listeners = new Set();

function readCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch {
    /* ignore */
  }
  return null;
}

function persist(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function emit() {
  listeners.forEach((fn) => fn(googleAdsEnabled));
}

export function isGoogleAdsAllowedByServer() {
  return googleAdsEnabled;
}

export function subscribeGoogleAdsSetting(fn) {
  listeners.add(fn);
  fn(googleAdsEnabled);
  return () => listeners.delete(fn);
}

/** Загрузить флаг Google AdMob с сервера (админ может отключить). */
export async function refreshAdSettings() {
  try {
    const data = await api('/api/mobile/ads/config');
    googleAdsEnabled = data?.google_ads_enabled !== false;
    persist(googleAdsEnabled);
    emit();
  } catch {
    const cached = readCache();
    if (cached != null) googleAdsEnabled = cached;
  }
  return googleAdsEnabled;
}
