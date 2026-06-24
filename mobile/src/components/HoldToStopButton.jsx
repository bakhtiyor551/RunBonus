import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import Icon from './Icon';

const HOLD_MS = 2000;
const TICK_MS = 50;

export default function HoldToStopButton({ onStop, disabled, label = 'Удерживайте для остановки' }) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const elRef = useRef(null);
  const holdingRef = useRef(false);
  const startedAtRef = useRef(0);
  const tickIdRef = useRef(null);
  const completeIdRef = useRef(null);
  const onStopRef = useRef(onStop);
  const disabledRef = useRef(disabled);

  onStopRef.current = onStop;
  disabledRef.current = disabled;

  const clearTimers = () => {
    if (tickIdRef.current != null) {
      clearInterval(tickIdRef.current);
      tickIdRef.current = null;
    }
    if (completeIdRef.current != null) {
      clearTimeout(completeIdRef.current);
      completeIdRef.current = null;
    }
  };

  const cancelHold = () => {
    holdingRef.current = false;
    setHolding(false);
    setProgress(0);
    startedAtRef.current = 0;
    clearTimers();
  };

  const completeHold = () => {
    if (!holdingRef.current) return;
    cancelHold();
    onStopRef.current?.();
  };

  const startHold = () => {
    if (disabledRef.current || holdingRef.current) return;
    holdingRef.current = true;
    setHolding(true);
    startedAtRef.current = Date.now();
    setProgress(0);

    tickIdRef.current = setInterval(() => {
      if (!holdingRef.current) return;
      const elapsed = Date.now() - startedAtRef.current;
      setProgress(Math.min(100, (elapsed / HOLD_MS) * 100));
    }, TICK_MS);

    completeIdRef.current = setTimeout(completeHold, HOLD_MS);
  };

  useEffect(() => {
    const el = elRef.current;
    if (!el) return undefined;

    const isTouchLike = () => Capacitor.isNativePlatform() || 'ontouchstart' in window;

    const onTouchStart = (e) => {
      if (disabledRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      startHold();
    };

    const onTouchEnd = (e) => {
      e.preventDefault();
      e.stopPropagation();
      cancelHold();
    };

    const onMouseDown = (e) => {
      if (isTouchLike()) return;
      if (disabledRef.current || e.button !== 0) return;
      e.preventDefault();
      startHold();
    };

    const onMouseUp = () => {
      if (isTouchLike()) return;
      cancelHold();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', onTouchEnd, { passive: false });
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      cancelHold();
    };
  }, []);

  useEffect(() => {
    if (!disabled) return;
    cancelHold();
  }, [disabled]);

  const inactive = disabled;

  return (
    <div
      ref={elRef}
      role="button"
      tabIndex={inactive ? -1 : 0}
      aria-disabled={inactive || undefined}
      aria-label={label}
      className={`rb-hold-stop ${holding ? 'rb-hold-stop--active' : ''}${inactive ? ' rb-hold-stop--disabled' : ''}`}
      onKeyDown={(e) => {
        if (inactive) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startHold();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') cancelHold();
      }}
      onContextMenu={(e) => e.preventDefault()}
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
    </div>
  );
}
