import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

const HOLD_MS = 2000;

export default function HoldToStopButton({ onStop, disabled, label = 'Удерживайте для остановки' }) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const rafRef = useRef(null);
  const startRef = useRef(0);
  const holdingRef = useRef(false);
  const buttonRef = useRef(null);

  const cancelHold = () => {
    holdingRef.current = false;
    setHolding(false);
    setProgress(0);
    startRef.current = 0;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const tick = (now) => {
    if (!holdingRef.current) return;
    const elapsed = now - startRef.current;
    const pct = Math.min(100, (elapsed / HOLD_MS) * 100);
    setProgress(pct);
    if (elapsed >= HOLD_MS) {
      cancelHold();
      onStop?.();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const startHold = (e) => {
    if (disabled || holdingRef.current) return;
    e.preventDefault?.();
    const el = buttonRef.current;
    if (el?.setPointerCapture && e.pointerId != null) {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* WebView без pointer capture */
      }
    }
    holdingRef.current = true;
    setHolding(true);
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  };

  const endHold = (e) => {
    const el = buttonRef.current;
    if (el?.releasePointerCapture && e?.pointerId != null && el.hasPointerCapture?.(e.pointerId)) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    cancelHold();
  };

  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return undefined;

    const blockScroll = (e) => {
      if (holdingRef.current) e.preventDefault();
    };

    el.addEventListener('touchmove', blockScroll, { passive: false });
    return () => el.removeEventListener('touchmove', blockScroll);
  }, []);

  useEffect(() => () => cancelHold(), []);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`rb-hold-stop ${holding ? 'rb-hold-stop--active' : ''}`}
      disabled={disabled}
      onPointerDown={startHold}
      onPointerUp={endHold}
      onPointerCancel={endHold}
      onLostPointerCapture={endHold}
      onTouchStart={startHold}
      onTouchEnd={endHold}
      onTouchCancel={endHold}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label}
    >
      <span
        className="rb-hold-stop__ring"
        aria-hidden
        style={{ background: `conic-gradient(var(--rb-neon) ${progress}%, rgba(255,255,255,0.08) 0)` }}
      />
      <span className="rb-hold-stop__inner">
        <Icon name="stop_circle" filled />
        <span>{holding ? `${Math.ceil((HOLD_MS - (progress / 100) * HOLD_MS) / 1000)}…` : label}</span>
      </span>
    </button>
  );
}
