import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

const HOLD_MS = 2000;
const TICK_MS = 50;

export default function HoldToStopButton({
  onStop,
  disabled,
  label = 'Удерживайте для остановки',
  variant = 'default',
}) {
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
    holdingRef.current = false;
    setHolding(false);
    clearTimers();
    setProgress(100);
    onStopRef.current?.();
    setTimeout(() => setProgress(0), 200);
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

    const onPointerDown = (e) => {
      if (disabledRef.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      startHold();
    };

    const onPointerUp = (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        el.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      if (holdingRef.current) cancelHold();
    };

    el.addEventListener('pointerdown', onPointerDown, { passive: false });
    el.addEventListener('pointerup', onPointerUp, { passive: false });
    el.addEventListener('pointercancel', onPointerUp, { passive: false });
    el.addEventListener('lostpointercapture', onPointerUp);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('lostpointercapture', onPointerUp);
      cancelHold();
    };
  }, []);

  useEffect(() => {
    if (!disabled) return;
    cancelHold();
  }, [disabled]);

  const inactive = disabled;
  const isFab = variant === 'fab';

  return (
    <div
      ref={elRef}
      role="button"
      tabIndex={inactive ? -1 : 0}
      aria-disabled={inactive || undefined}
      aria-label={label}
      className={[
        isFab ? 'rb-hold-fab' : 'rb-hold-stop',
        holding ? (isFab ? 'rb-hold-fab--active' : 'rb-hold-stop--active') : '',
        inactive ? (isFab ? 'rb-hold-fab--disabled' : 'rb-hold-stop--disabled') : '',
      ]
        .filter(Boolean)
        .join(' ')}
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
      {isFab ? (
        <>
          <span
            className="rb-hold-fab__ring"
            aria-hidden
            style={{
              background: `conic-gradient(#111 ${progress}%, transparent 0)`,
            }}
          />
          <span className="rb-hold-fab__inner">
            <Icon name="close" />
          </span>
        </>
      ) : (
        <>
          <span
            className="rb-hold-stop__ring"
            aria-hidden
            style={{
              background: `conic-gradient(var(--rb-neon) ${progress}%, rgba(255,255,255,0.08) 0)`,
            }}
          />
          <span className="rb-hold-stop__inner">
            <Icon name="stop_circle" filled />
            <span>{holding ? 'Удерживайте…' : label}</span>
          </span>
        </>
      )}
    </div>
  );
}
