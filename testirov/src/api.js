import { config } from './config.js';

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${config.token}`,
    'X-Device-Id': config.deviceId,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function parseResponse(res) {
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || res.statusText);
    err.status = res.status;
    err.code = data?.code;
    err.body = data;
    throw err;
  }
  return data;
}

export async function apiRequest(path, options = {}) {
  const url = `${config.baseApiUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    headers: authHeaders(options.headers),
  });
  return parseResponse(res);
}

export async function getBonusBalance() {
  const data = await apiRequest('/api/bonus/balance');
  return Number(data.balance) || 0;
}

export async function getActiveWorkout() {
  return apiRequest('/api/workouts/active');
}

export async function startWorkout() {
  return apiRequest('/api/workouts/start', { method: 'POST', body: '{}' });
}

export async function finishWorkout(workoutId, body) {
  return apiRequest(`/api/workouts/${workoutId}/finish`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getWorkoutFromHistory(workoutId) {
  const rows = await apiRequest('/api/workouts/history');
  const list = Array.isArray(rows) ? rows : [];
  return list.find((w) => Number(w.id) === Number(workoutId)) || null;
}

export async function getWorkoutPoints(workoutId) {
  const data = await apiRequest(`/api/workouts/${workoutId}/points`);
  return data.points || [];
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
