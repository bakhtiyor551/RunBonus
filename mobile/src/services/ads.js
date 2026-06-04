import { api } from '../api';

export async function fetchAdBanners(placement, user = null) {
  const params = new URLSearchParams({ placement });
  if (user?.city?.trim()) params.set('city', user.city.trim());
  const levelCode = user?.levelCode || user?.level?.code || user?.level_info?.current?.code;
  if (levelCode) params.set('level', String(levelCode));
  try {
    const data = await api(`/api/mobile/ads/banners?${params}`);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function trackAdEvent(campaignId, eventType) {
  if (!campaignId) return Promise.resolve();
  return api('/api/mobile/ads/event', {
    method: 'POST',
    body: JSON.stringify({ campaign_id: campaignId, event_type: eventType }),
  }).catch(() => {});
}
