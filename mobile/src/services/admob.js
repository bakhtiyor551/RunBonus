import { Capacitor } from '@capacitor/core';
import { admobAppId, adsEnabled } from '../config/mobileAds';

let initialized = false;
let initPromise = null;
let currentAdId = null;
let AdMobModule = null;

async function loadAdMob() {
  if (AdMobModule) return AdMobModule;
  AdMobModule = await import('@capacitor-community/admob');
  return AdMobModule;
}

export async function initAdMob() {
  if (!adsEnabled()) return false;
  if (initialized) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const { AdMob } = await loadAdMob();
      await AdMob.initialize({
        initializeForTesting: import.meta.env.VITE_ADMOB_TEST === 'true',
      });
      initialized = true;
      return true;
    } catch (err) {
      console.warn('[AdMob] init failed', err);
      return false;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export async function showBannerAd(adUnitId) {
  if (!adsEnabled() || !adUnitId) return false;
  if (!(await initAdMob())) return false;
  if (currentAdId === adUnitId) return true;

  const { AdMob, BannerAdSize, BannerAdPosition } = await loadAdMob();

  try {
    if (currentAdId) {
      await AdMob.hideBanner().catch(() => {});
      await AdMob.removeBanner().catch(() => {});
    }

    await AdMob.showBanner({
      adId: adUnitId,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: Capacitor.getPlatform() === 'ios' ? 72 : 64,
      isTesting: import.meta.env.VITE_ADMOB_TEST === 'true',
    });

    currentAdId = adUnitId;
    return true;
  } catch (err) {
    console.warn('[AdMob] showBanner failed', err);
    return false;
  }
}

export async function hideBannerAd() {
  if (!adsEnabled() || !currentAdId) return;
  try {
    const { AdMob } = await loadAdMob();
    await AdMob.hideBanner();
    await AdMob.removeBanner();
  } catch {
    /* ignore */
  }
  currentAdId = null;
}

export function getAdMobAppIdForNative() {
  return admobAppId();
}
