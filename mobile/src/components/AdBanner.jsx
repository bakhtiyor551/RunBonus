import { useEffect, useRef, useState } from 'react';
import { fetchAdBanners, trackAdEvent } from '../services/ads';

function openTargetUrl(url) {
  if (!url?.trim()) return;
  const href = url.trim();
  if (/^https?:\/\//i.test(href)) {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
}

/**
 * @param {'banner_home' | 'banner_workout'} placement
 * @param {object} [user] — для таргетинга (город, уровень)
 */
export default function AdBanner({ placement, user, className = '', style }) {
  const [banner, setBanner] = useState(null);
  const impressed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchAdBanners(placement, user).then((list) => {
      if (!cancelled) setBanner(list[0] || null);
    });
    return () => {
      cancelled = true;
    };
  }, [placement, user?.city, user?.levelCode, user?.level?.code]);

  useEffect(() => {
    if (!banner?.id || impressed.current) return;
    impressed.current = true;
    trackAdEvent(banner.id, 'impression');
  }, [banner?.id]);

  if (!banner?.banner_url) return null;

  const handleClick = () => {
    trackAdEvent(banner.id, 'click');
    if (banner.target_url) {
      trackAdEvent(banner.id, 'open');
      openTargetUrl(banner.target_url);
    }
  };

  return (
    <section className={`rb-ad-banner-wrap ${className}`.trim()} style={style} aria-label="Реклама">
      <span className="rb-ad-banner__label">Реклама</span>
      <button type="button" className="rb-ad-banner glass-card" onClick={handleClick}>
        <img
          src={banner.banner_url}
          alt={banner.title || 'Реклама'}
          loading={placement === 'banner_workout' ? 'eager' : 'lazy'}
        />
        {banner.title && <span className="rb-ad-banner__title">{banner.title}</span>}
      </button>
    </section>
  );
}
