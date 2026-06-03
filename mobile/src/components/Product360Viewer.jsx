import { useRef, useState } from 'react';
import Icon from './Icon';
import BoltIcon from './BoltIcon';
import { URBAN_SPRINT_360_ANGLES } from '../data/urbanSprint360';

const FRAME_COUNT = URBAN_SPRINT_360_ANGLES.length;

/**
 * 360° просмотр по фото-ракурсам (как в макете): перетаскивание + миниатюры.
 */
export default function Product360Viewer({ onBuy }) {
  const [frame, setFrame] = useState(0);
  const dragRef = useRef({ active: false, startX: 0, startFrame: 0 });

  const setFrameClamped = (n) => {
    const i = ((n % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT;
    setFrame(i);
  };

  const onPointerDown = (e) => {
    dragRef.current = { active: true, startX: e.clientX, startFrame: frame };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const step = Math.round(dx / 45);
    setFrameClamped(dragRef.current.startFrame - step);
  };

  const onPointerUp = (e) => {
    dragRef.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const current = URBAN_SPRINT_360_ANGLES[frame];

  return (
    <div className="rb-360-viewer">
      <div className="rb-360-viewer__badge">
        <Icon name="360" />
      </div>

      <header className="rb-360-viewer__brand">
        <h1 className="rb-360-viewer__title font-display">
          URBAN <span className="rb-360-viewer__accent">SPRINT</span>
          <BoltIcon size="sm" />
        </h1>
        <p className="rb-360-viewer__subtitle">360° ПРОСМОТР</p>
      </header>

      <div
        className="rb-360-viewer__stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label={`Urban Sprint, ${current.label}`}
      >
        <img
          key={current.id}
          src={current.src}
          alt={current.label}
          className="rb-360-viewer__product"
          draggable={false}
        />
      </div>

      <div className="rb-360-viewer__dots" aria-hidden>
        {URBAN_SPRINT_360_ANGLES.map((_, i) => (
          <span key={i} className={i === frame ? 'active' : undefined} />
        ))}
      </div>

      <div className="rb-360-viewer__thumbs">
        {URBAN_SPRINT_360_ANGLES.map((a, i) => (
          <button
            key={a.id}
            type="button"
            className={`rb-360-viewer__thumb${i === frame ? ' rb-360-viewer__thumb--active' : ''}`}
            onClick={() => setFrame(i)}
          >
            <img src={a.src} alt="" />
            <span>{a.label}</span>
          </button>
        ))}
      </div>

      <p className="rb-360-viewer__hint">
        <Icon name="swipe" />
        Перетащите, чтобы повернуть
      </p>

      {onBuy && (
        <div className="rb-360-viewer__cta">
          <button type="button" className="rb-btn-primary" onClick={onBuy}>
            <Icon name="shopping_cart" />
            Купить
          </button>
        </div>
      )}
    </div>
  );
}
