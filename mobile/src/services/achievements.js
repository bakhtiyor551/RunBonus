import { api } from '../api';

export async function fetchMyLevel() {
  return api('/api/levels/me');
}

export async function fetchMyAchievements() {
  return api('/api/achievements/me');
}

export async function fetchAchievementsCatalog() {
  return api('/api/achievements');
}
