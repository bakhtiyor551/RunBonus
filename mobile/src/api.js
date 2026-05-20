import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * Продакшен: домен. На нативном приложении запросы идут через CapacitorHttp
 * (без CORS). В браузере runbonus.online может давать 302 → ошибка CORS;
 * для dev в браузере не задавайте VITE_API_URL (прокси Vite).
 */
export const PRODUCTION_API_URL = 'http://runbonus.online';

/** Прямой IP — без редиректа Namecheap (запасной вариант в .env) */
export const FALLBACK_API_URL = 'http://161.129.67.147';

function resolveApiUrl() {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  if (import.meta.env.PROD) {
    return PRODUCTION_API_URL;
  }

  if (!Capacitor.isNativePlatform()) {
    return '';
  }

  if (Capacitor.getPlatform() === 'android') {
    return 'http://10.0.2.2:3001';
  }

  return 'http://localhost:3001';
}

export const API_URL = resolveApiUrl();

function getToken() {
  return localStorage.getItem('token');
}

function buildHeaders(extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function parseBody(data) {
  if (data == null || data === '') return {};
  if (typeof data === 'object') return data;
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function requestNative(url, options = {}) {
  const method = options.method || 'GET';
  const headers = buildHeaders(options.headers || {});

  const req = {
    url,
    method,
    headers,
    connectTimeout: 30000,
    readTimeout: 30000,
  };

  if (options.body && method !== 'GET' && method !== 'HEAD') {
    req.data = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
  }

  const response = await CapacitorHttp.request(req);
  const data = parseBody(response.data);

  if (response.status < 200 || response.status >= 300) {
    const err = new Error(data.error || 'Ошибка запроса');
    err.status = response.status;
    throw err;
  }

  return data;
}

async function requestFetch(url, options = {}) {
  const headers = buildHeaders(options.headers || {});
  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (e) {
    if (e?.message?.includes('CORS') || e?.name === 'TypeError') {
      throw new Error(
        'Ошибка CORS: домен перенаправляет запрос (302). В .env.production укажите VITE_API_URL=http://161.129.67.147 или откройте приложение как APK, не в браузере.'
      );
    }
    throw new Error('Нет связи с сервером. Проверьте интернет и настройки API.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

export async function api(path, options = {}) {
  const url = `${API_URL}${path}`;

  if (Capacitor.isNativePlatform()) {
    try {
      return await requestNative(url, options);
    } catch (e) {
      if (e?.message && !e.message.includes('Ошибка')) {
        throw new Error(e.message);
      }
      throw e;
    }
  }

  return requestFetch(url, options);
}

export function setToken(token) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}
