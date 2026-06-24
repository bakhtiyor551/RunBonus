import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { App } from '@capacitor/app';
import { API_URL } from '../api';

const PROBE_TIMEOUT_MS = 5000;
const PROBE_INTERVAL_MS = 30000;
const OFFLINE_STREAK = 2;
const ONLINE_STREAK = 1;

let deviceHasLink = true;
let workoutMode = false;
let stableOnline = true;
let failStreak = 0;
let okStreak = 0;
let intervalId = null;
let setupDone = false;
let probeInFlight = false;
/** @type {Set<(online: boolean) => void>} */
const subscribers = new Set();

/** Во время тренировки не делаем HTTP /api/health — только Network + WebSocket. */
export function setConnectivityWorkoutMode(active) {
  workoutMode = Boolean(active);
  if (workoutMode) {
    if (deviceHasLink && !stableOnline) {
      stableOnline = true;
      notifySubscribers(true);
    }
  } else {
    publish().catch(() => {});
  }
}

function notifySubscribers(online) {
  subscribers.forEach((fn) => {
    try {
      fn(online);
    } catch {
      /* ignore */
    }
  });
}

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

async function publish() {
  if (probeInFlight) return;
  probeInFlight = true;
  try {
    let online;
    if (!deviceHasLink) {
      online = false;
    } else if (workoutMode) {
      online = true;
    } else {
      online = await probeServerReachable();
    }

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
      notifySubscribers(online);
    }
  } finally {
    probeInFlight = false;
  }
}

function onLinkChange(connected) {
  deviceHasLink = connected;
  if (!connected) {
    okStreak = 0;
    failStreak = OFFLINE_STREAK;
    if (stableOnline) {
      stableOnline = false;
      notifySubscribers(false);
    }
    return;
  }
  publish().catch(() => {});
}

async function ensureSetup() {
  if (setupDone) return;
  setupDone = true;

  if (Capacitor.isNativePlatform()) {
    try {
      const status = await Network.getStatus();
      deviceHasLink = status.connected;
    } catch {
      deviceHasLink = navigator.onLine;
    }
    Network.addListener('networkStatusChange', (s) => onLinkChange(s.connected));
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) publish().catch(() => {});
    });
  } else {
    deviceHasLink = navigator.onLine;
    const syncNav = () => onLinkChange(navigator.onLine);
    window.addEventListener('online', syncNav);
    window.addEventListener('offline', syncNav);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !workoutMode) {
      publish().catch(() => {});
    }
  });

  await publish();
  intervalId = setInterval(() => {
    if (!workoutMode) publish().catch(() => {});
  }, PROBE_INTERVAL_MS);
}

/**
 * @param {(online: boolean) => void} onChange
 * @returns {() => void} unsubscribe
 */
export function subscribeConnectivity(onChange) {
  subscribers.add(onChange);
  onChange(stableOnline);
  ensureSetup().catch(() => {});

  return () => {
    subscribers.delete(onChange);
  };
}

export function getConnectivityOnline() {
  return stableOnline;
}

export function subscribeNetworkReconnect(onReconnect) {
  if (!Capacitor.isNativePlatform()) {
    const handler = () => {
      if (navigator.onLine) onReconnect();
    };
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }

  let handle;
  Network.addListener('networkStatusChange', (s) => {
    if (s.connected) onReconnect();
  }).then((h) => {
    handle = h;
  });

  return () => handle?.remove?.();
}
