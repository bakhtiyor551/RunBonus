import { Capacitor, CapacitorHttp } from '@capacitor/core';

/** Продакшен API (HTTPS). HTTP/IP nginx перенаправляет на этот домен. */
export const PRODUCTION_API_URL = 'https://runbonus.online';

function normalizeApiUrl(url) {
  const clean = String(url || '').replace(/\/$/, '');
  if (!clean) return PRODUCTION_API_URL;
  if (/^http:\/\/161\.129\.67\.147/i.test(clean)) {
    return PRODUCTION_API_URL;
  }
  if (/^http:\/\/runbonus\.online/i.test(clean)) {
    return PRODUCTION_API_URL;
  }
  return clean;
}

function resolveApiUrl() {
  if (import.meta.env.PROD) {
    return normalizeApiUrl(import.meta.env.VITE_API_URL);
  }

  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv) return normalizeApiUrl(fromEnv);

  if (!Capacitor.isNativePlatform()) {
    return '';
  }

  if (Capacitor.getPlatform() === 'android') {
    return 'http://10.0.2.2:3001';
  }

  if (Capacitor.getPlatform() === 'ios') {
    // Симулятор: localhost. На iPhone в .env укажите IP ПК: http://192.168.x.x:3001
    return 'http://localhost:3001';
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
  if (typeof data === 'string' && data.trimStart().startsWith('<')) {
    throw new Error(
      'Ошибка связи с сервером. Переустановите приложение или обратитесь в поддержку.'
    );
  }
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function apiErrorMessage(data, status) {
  if (data?.error) return data.error;
  if (typeof data === 'string' && data.includes('Cannot GET')) {
    return 'Ошибка API: запрос ушёл как GET вместо POST (редирект домена). Пересоберите приложение с IP в настройках.';
  }
  return status === 401 ? 'Неверный телефон или пароль' : 'Ошибка запроса';
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
    throw new Error(apiErrorMessage(data, response.status));
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
        'Ошибка CORS. В dev не задавайте VITE_API_URL (прокси Vite) или укажите http://161.129.67.147'
      );
    }
    throw new Error('Нет связи с сервером. Проверьте интернет и настройки API.');
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (text.trimStart().startsWith('<')) {
      throw new Error('Сервер вернул HTML — проверьте URL API (без редиректа runbonus.online).');
    }
  }
  if (!res.ok) throw new Error(apiErrorMessage(data, res.status));
  return data;
}

export async function api(path, options = {}) {
  const url = `${API_URL}${path}`;

  if (Capacitor.isNativePlatform()) {
    return requestNative(url, options);
  }

  return requestFetch(url, options);
}

export function setToken(token) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}
