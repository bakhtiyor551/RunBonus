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

export async function fetchNutritionProfile() {
  return api('/api/nutrition/profile');
}

export async function updateNutritionEntry(id, data) {
  return api(`/api/nutrition/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function fetchRecentFoods() {
  return api('/api/nutrition/recent');
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

export async function fetchWeightHistory(period = '30d') {
  return api(`/api/nutrition/weight?period=${encodeURIComponent(period)}`);
}

export async function addWeightLog(data) {
  return api('/api/nutrition/weight', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteWeightLog(id) {
  return api(`/api/nutrition/weight/${id}`, { method: 'DELETE' });
}

export async function fetchWaterToday() {
  return api('/api/nutrition/water/today');
}

export async function fetchWaterStats(period = '7d') {
  return api(`/api/nutrition/water/stats?period=${encodeURIComponent(period)}`);
}

export async function addWaterLog(amountMl) {
  return api('/api/nutrition/water', {
    method: 'POST',
    body: JSON.stringify({ amount_ml: amountMl }),
  });
}

export async function deleteWaterLog(id) {
  return api(`/api/nutrition/water/${id}`, { method: 'DELETE' });
}

export async function fetchCoachToday() {
  return api('/api/nutrition/coach/today');
}

export async function fetchCoachHistory(limit = 14) {
  return api(`/api/nutrition/coach/history?limit=${limit}`);
}

export async function generateCoachReport() {
  return api('/api/nutrition/coach/generate', { method: 'POST' });
}

export async function copyNutritionDiary(from = 'yesterday', mealType = null) {
  const params = new URLSearchParams({ from });
  if (mealType) params.set('meal_type', mealType);
  return api(`/api/nutrition/copy?${params}`, { method: 'POST' });
}

export async function fetchFoodByBarcode(code) {
  return api(`/api/nutrition/foods/barcode/${encodeURIComponent(code)}`);
}

export async function fetchAchievements() {
  return api('/api/nutrition/achievements');
}
