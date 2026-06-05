import { api } from '../api';

let cached = null;
let loadPromise = null;

const DEFAULT = {
  admob_enabled: true,
  admob_test_mode: false,
  admob_app_id: '',
  partner_ads_enabled: true,
  units: { google: {}, play: {} },
};

export async function loadAdConfig() {
  if (cached) return cached;
  if (loadPromise) return loadPromise;

  loadPromise = api('/api/mobile/ads/config')
    .then((data) => {
      cached = { ...DEFAULT, ...data, units: { ...DEFAULT.units, ...data?.units } };
      return cached;
    })
    .catch(() => {
      cached = { ...DEFAULT };
      return cached;
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

export function getAdConfig() {
  return cached || DEFAULT;
}
