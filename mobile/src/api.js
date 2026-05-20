import { Capacitor } from '@capacitor/core';

/**
 * Продакшен API (прямой IP сервера).
 * runbonus.online через Namecheap URL Forward отдаёт 302 — ломает CORS в браузере.
 * После A-записи на IP см. deploy/DNS.md — можно снова http://runbonus.online
 */
export const PRODUCTION_API_URL = 'http://161.129.67.147';

/**
 * URL API:
 * - production: VITE_API_URL / PRODUCTION_API_URL
 * - dev в браузере: прокси Vite (/api → сервер), без CORS
 * - dev на эмуляторе: 10.0.2.2:3001 или .env
 */
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

export async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error('Нет связи с сервером. Проверьте интернет и настройки API.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

export function setToken(token) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}
