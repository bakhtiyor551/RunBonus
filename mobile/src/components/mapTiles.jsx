import { useEffect, useRef, useState } from 'react';
import { useMap, TileLayer } from 'react-leaflet';

/**
 * Carto basemaps больше требуют API key (watermark «API KEY REQUIRED»).
 * Используем бесплатные тайлы без ключа.
 */

/** Светлая карта (iOS / ближе к Apple Maps). Esri World Street. */
export const LIGHT_MAP_TILES = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Esri',
  maxZoom: 19,
};

/** Тёмная карта. Esri Dark Gray. */
export const DARK_MAP_TILES = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Esri',
  maxZoom: 16,
};

/** Fallback OSM. */
export const OSM_MAP_TILES = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap',
  maxZoom: 19,
};

/**
 * Ionic / Capacitor монтирует карту в контейнер нулевого размера —
 * без invalidateSize тайлы остаются серыми.
 */
export function MapSizeFix() {
  const map = useMap();

  useEffect(() => {
    if (!map) return undefined;

    const fix = () => {
      try {
        map.invalidateSize({ animate: false });
      } catch {
        /* ignore */
      }
    };

    fix();
    const timers = [50, 150, 400, 800, 1600].map((ms) => setTimeout(fix, ms));

    const el = map.getContainer();
    let ro;
    if (typeof ResizeObserver !== 'undefined' && el) {
      ro = new ResizeObserver(() => fix());
      ro.observe(el);
      if (el.parentElement) ro.observe(el.parentElement);
    }

    const onVis = () => {
      if (document.visibilityState === 'visible') fix();
    };
    window.addEventListener('resize', fix);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('orientationchange', fix);

    return () => {
      timers.forEach(clearTimeout);
      ro?.disconnect();
      window.removeEventListener('resize', fix);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('orientationchange', fix);
    };
  }, [map]);

  return null;
}

/** TileLayer с fallback OSM при ошибках Esri. */
export function RobustTileLayer({ variant = 'dark' }) {
  const [cfg, setCfg] = useState(() => (variant === 'light' ? LIGHT_MAP_TILES : DARK_MAP_TILES));
  const errorsRef = useRef(0);
  const switchedRef = useRef(false);

  useEffect(() => {
    setCfg(variant === 'light' ? LIGHT_MAP_TILES : DARK_MAP_TILES);
    errorsRef.current = 0;
    switchedRef.current = false;
  }, [variant]);

  return (
    <TileLayer
      key={cfg.url}
      url={cfg.url}
      attribution={cfg.attribution}
      subdomains={cfg.subdomains}
      maxZoom={cfg.maxZoom}
      eventHandlers={{
        tileerror: () => {
          if (switchedRef.current) return;
          errorsRef.current += 1;
          if (errorsRef.current >= 2) {
            switchedRef.current = true;
            setCfg(OSM_MAP_TILES);
          }
        },
      }}
    />
  );
}
