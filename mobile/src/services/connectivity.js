import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { App } from '@capacitor/app';
import { API_URL } from '../api';

const PROBE_TIMEOUT_MS = 5000;
const PROBE_INTERVAL_MS = 8000;
/** Сколько проверок подряд нужно, чтобы сменить статус (убирает мигание). */
const OFFLINE_STREAK = 2;
const ONLINE_STREAK = 1;

let deviceHasLink = true;

/** Реальная доступность API (navigator.onLine на Android часто врёт). */
export async function probeServerReachable() {
  const url = `${API_URL}/api/health`;
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.request({
        url,
        method: 'GET',
        connectTimeout: PROBE_TIMEOUT_MS,
        readTimeout: PROBE_TIMEOUT_MS,
      });
      return res.status >= 200 && res.status < 300;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function isOnline() {
  if (!deviceHasLink) return false;
  return probeServerReachable();
}

/**
 * @param {(online: boolean) => void} onChange
 * @returns {() => void} unsubscribe
 */
export function subscribeConnectivity(onChange) {
  let cancelled = false;
  let intervalId;
  let removeNetworkListener;
  let removeAppListener;
  let stableOnline = true;
  let failStreak = 0;
  let okStreak = 0;

  const publish = async () => {
    const online = await isOnline();
    if (cancelled) return;

    if (online) {
      failStreak = 0;
      okStreak += 1;
      if (!stableOnline && okStreak < ONLINE_STREAK) return;
    } else {
      okStreak = 0;
      failStreak += 1;
      if (stableOnline && failStreak < OFFLINE_STREAK) return;
    }

    if (online !== stableOnline) {
      stableOnline = online;
      onChange(stableOnline);
    }
  };

  const onLinkChange = (connected) => {
    deviceHasLink = connected;
    if (!connected) {
      okStreak = 0;
      failStreak = OFFLINE_STREAK;
      if (!cancelled && stableOnline) {
        stableOnline = false;
        onChange(false);
      }
      return;
    }
    publish();
  };

  const setup = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const status = await Network.getStatus();
        deviceHasLink = status.connected;
      } catch {
        deviceHasLink = navigator.onLine;
      }
      const handle = await Network.addListener('networkStatusChange', (s) => onLinkChange(s.connected));
      removeNetworkListener = () => handle.remove();

      const appHandle = await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) publish();
      });
      removeAppListener = () => appHandle.remove();
    } else {
      deviceHasLink = navigator.onLine;
      const syncNav = () => onLinkChange(navigator.onLine);
      window.addEventListener('online', syncNav);
      window.addEventListener('offline', syncNav);
      removeNetworkListener = () => {
        window.removeEventListener('online', syncNav);
        window.removeEventListener('offline', syncNav);
      };
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') publish();
    };
    document.addEventListener('visibilitychange', onVisible);
    const prevRemove = removeNetworkListener;
    removeNetworkListener = () => {
      prevRemove?.();
      document.removeEventListener('visibilitychange', onVisible);
    };

    await publish();
    intervalId = setInterval(publish, PROBE_INTERVAL_MS);
  };

  setup();

  return () => {
    cancelled = true;
    clearInterval(intervalId);
    removeNetworkListener?.();
    removeAppListener?.();
  };
}
