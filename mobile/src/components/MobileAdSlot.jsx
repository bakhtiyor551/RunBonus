import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import AdBanner from './AdBanner';
import { adUnitId, AD_SLOT_HEIGHT, adsEnabled } from '../config/mobileAds';
import { hideBannerAd, showBannerAd } from '../services/admob';
import { subscribeGoogleAdsSetting } from '../services/adSettings';

const LABELS = {
  google: 'Google Ads',
  play: 'Google Play',
};

/**
 * Слот для Google Ads / Google Play (AdMob).
 * @param {'google' | 'play'} network
 * @param {'home' | 'workout' | 'shop'} page
 * @param {boolean} [active] — показывать нативный баннер, когда слот активен
 */
export default function MobileAdSlot({ network, page, active = false, className = '', style }) {
  const unitId = adUnitId(network, page);
  const [nativeShown, setNativeShown] = useState(false);
  const [googleAllowed, setGoogleAllowed] = useState(adsEnabled());

  useEffect(() => subscribeGoogleAdsSetting(() => setGoogleAllowed(adsEnabled())), []);

  const isNative = googleAllowed;

  useEffect(() => {
    if (!isNative || !active || !unitId) {
      if (!active) setNativeShown(false);
      return undefined;
    }

    let cancelled = false;
    showBannerAd(unitId).then((ok) => {
      if (!cancelled) setNativeShown(ok);
    });

    return () => {
      cancelled = true;
    };
  }, [isNative, active, unitId]);

  useEffect(() => {
    if (!active || !isNative) return undefined;
    return () => {
      hideBannerAd().catch(() => {});
    };
  }, [active, isNative]);

  const minHeight = network === 'play' ? AD_SLOT_HEIGHT.play : AD_SLOT_HEIGHT.banner;
  const showPlaceholder = !isNative || !nativeShown;

  return (
    <section
      className={`rb-mobile-ad-slot rb-mobile-ad-slot--${network} ${className}`.trim()}
      style={style}
      aria-label={LABELS[network]}
    >
      <span className="rb-mobile-ad-slot__label">{LABELS[network]}</span>
      <div
        className={`rb-mobile-ad-slot__frame${showPlaceholder ? ' rb-mobile-ad-slot__frame--placeholder' : ''}`}
        style={{ minHeight }}
      >
        {showPlaceholder && (
          <div className="rb-mobile-ad-slot__placeholder">
            <span className="rb-mobile-ad-slot__brand">{network === 'google' ? 'Google' : 'Play Market'}</span>
            <span className="rb-mobile-ad-slot__hint">
              {isNative && unitId ? 'Загрузка рекламы…' : 'Баннер в приложении на телефоне'}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

/** RunBonus (админка) + Google Ads + Google Play. */
export function PageAdSlots({ page, user, runBonusPlacement, className = '', style }) {
  const [activeNetwork, setActiveNetwork] = useState('google');
  const [googleAllowed, setGoogleAllowed] = useState(adsEnabled());
  const wrapRef = useRef(null);

  useEffect(() => subscribeGoogleAdsSetting(() => setGoogleAllowed(adsEnabled())), []);

  useEffect(() => {
    if (!googleAllowed) hideBannerAd().catch(() => {});
  }, [googleAllowed]);

  useEffect(() => {
    return () => {
      hideBannerAd().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!googleAllowed) return undefined;
    const root = wrapRef.current;
    if (!root) return undefined;

    const slots = root.querySelectorAll('[data-ad-network]');
    if (!slots.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0]?.target?.getAttribute('data-ad-network');
        if (top) setActiveNetwork(top);
      },
      { root: null, threshold: [0.25, 0.5, 0.75], rootMargin: '-20% 0px -30% 0px' }
    );

    slots.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [page, googleAllowed]);

  return (
    <div ref={wrapRef} className={`rb-page-ads ${className}`.trim()} style={style}>
      {runBonusPlacement && (
        <AdBanner placement={runBonusPlacement} user={user} className="rb-ad-banner--partner" />
      )}
      {googleAllowed && (
        <>
          <div data-ad-network="google">
            <MobileAdSlot network="google" page={page} active={activeNetwork === 'google'} />
          </div>
          <div data-ad-network="play">
            <MobileAdSlot network="play" page={page} active={activeNetwork === 'play'} />
          </div>
        </>
      )}
    </div>
  );
}
