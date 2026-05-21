const PRODUCTION_API_URL = 'https://runbonus.online';

function resolveApiUrl() {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  if (import.meta.env.PROD) {
    return PRODUCTION_API_URL;
  }

  // Dev/preview: относительный /api → прокси Vite
  if (typeof window !== 'undefined') {
    const port = window.location.port;
    if (port === '5174' || port === '4174') {
      return '';
    }
  }

  return PRODUCTION_API_URL;
}

const API = resolveApiUrl();

export async function adminApi(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = localStorage.getItem('adminToken');
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API}${path}`, { ...options, headers });
  } catch {
    throw new Error('Нет связи с сервером. Запустите backend или проверьте VITE_API_URL.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка');
  return data;
}
