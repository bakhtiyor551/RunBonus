import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { getDeviceId } from './services/deviceId';

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
  headers['X-Device-Id'] = getDeviceId();
  return headers;
}

/** device_id в теле — надёжнее заголовка в Capacitor/WebView и nginx. */
function withDevicePayload(body) {
  const deviceId = getDeviceId();
  if (!body) return JSON.stringify({ device_id: deviceId });
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : { ...body };
    return JSON.stringify({ ...data, device_id: deviceId });
  } catch {
    return JSON.stringify({ device_id: deviceId });
  }
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

function throwApiError(data, status) {
  const err = new Error(apiErrorMessage(data, status));
  err.code = data?.code;
  err.status = status;
  throw err;
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
    req.data = JSON.parse(options.body);
  }

  const response = await CapacitorHttp.request(req);
  const data = parseBody(response.data);

  if (response.status < 200 || response.status >= 300) {
    throwApiError(data, response.status);
  }

  return data;
}

async function requestFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = buildHeaders(options.headers || {});
  const fetchOptions = { ...options, headers };
  let res;
  try {
    res = await fetch(fetchOptions);
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
  if (!res.ok) throwApiError(data, res.status);
  return data;
}

function appendDeviceQuery(url) {
  const id = encodeURIComponent(getDeviceId());
  return url.includes('?') ? `${url}&device_id=${id}` : `${url}?device_id=${id}`;
}

export async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  let url = `${API_URL}${path}`;
  const apiOptions = { ...options };

  if (method === 'GET' || method === 'HEAD') {
    url = appendDeviceQuery(url);
  } else if (options.body) {
    apiOptions.body = withDevicePayload(options.body);
  }

  if (Capacitor.isNativePlatform()) {
    return requestNative(url, apiOptions);
  }

  return requestFetch(url, apiOptions);
}

export function setToken(token) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

/** Выход: снимает привязку, если выход с основного телефона. */
export async function logoutApi() {
  if (!getToken()) return;
  try {
    await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
  } catch {
    /* с «чужого» телефона logout может не пройти — локально всё равно выходим */
  }
  setToken(null);
}
