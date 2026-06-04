import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';

function uniqueUrls(urls) {
  const seen = new Set();
  const out = [];
  for (const u of urls) {
    const s = String(u || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function buildProductImages(product, selectedColor) {
  if (selectedColor?.image_url) {
    return uniqueUrls([selectedColor.image_url]);
  }
  const urls = [];
  if (Array.isArray(product?.images)) urls.push(...product.images);
  if (product?.image_url) urls.push(product.image_url);
  return uniqueUrls(urls);
}

export default function ProductImageGallery({ product, selectedColor, className = '' }) {
  const images = useMemo(() => buildProductImages(product, selectedColor), [product, selectedColor]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [selectedColor?.id, selectedColor?.label, images.join('|')]);

  const current = images[index] || null;

  return (
    <div className={`rb-product-gallery ${className}`.trim()}>
      <div className="rb-shop-detail-hero glass-card rb-product-gallery__hero">
        {current ? (
          <img key={current} src={current} alt="" />
        ) : (
          <Icon name="directions_run" filled style={{ fontSize: 72, color: 'var(--rb-neon)' }} />
        )}
      </div>
      {images.length > 1 && (
        <div className="rb-product-gallery__thumbs">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              className={`rb-product-gallery__thumb${i === index ? ' rb-product-gallery__thumb--active' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`Фото ${i + 1}`}
            >
              <img src={url} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
