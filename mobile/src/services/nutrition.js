import { api } from '../api';

export async function fetchNutritionStatus() {
  return api('/api/nutrition/status');
}

export async function fetchNutritionToday() {
  return api('/api/nutrition/today');
}

export async function fetchNutritionWeek() {
  return api('/api/nutrition/week');
}

export async function fetchNutritionChart(period = 'week') {
  return api(`/api/nutrition/chart?period=${period}`);
}

export async function fetchNutritionHistory(date) {
  const q = date ? `?date=${encodeURIComponent(date)}` : '';
  return api(`/api/nutrition/history${q}`);
}

export async function searchNutritionFoods(q, country) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (country) params.set('country', country);
  return api(`/api/nutrition/foods/search?${params}`);
}

export async function fetchNutritionFavorites() {
  return api('/api/nutrition/favorites');
}

export async function toggleNutritionFavorite(foodId) {
  return api(`/api/nutrition/favorites/${foodId}`, { method: 'POST' });
}

export async function analyzeNutritionPhoto(photoBase64) {
  return api('/api/nutrition/photo', {
    method: 'POST',
    body: JSON.stringify({ photo_base64: photoBase64 }),
  });
}

export async function addNutritionEntry(data) {
  return api('/api/nutrition', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteNutritionEntry(id) {
  return api(`/api/nutrition/${id}`, { method: 'DELETE' });
}

export async function fetchNutritionRecommendations() {
  return api('/api/nutrition/recommendations');
}

export async function fetchNutritionAnalytics() {
  return api('/api/nutrition/analytics');
}

export async function updateNutritionProfile(data) {
  return api('/api/nutrition/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
