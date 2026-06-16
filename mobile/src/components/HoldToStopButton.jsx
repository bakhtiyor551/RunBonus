import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

const HOLD_MS = 2000;

export default function HoldToStopButton({ onStop, disabled, label = 'Удерживайте для остановки' }) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const rafRef = useRef(null);
  const startRef = useRef(0);

  const cancelHold = () => {
    setHolding(false);
    setProgress(0);
    startRef.current = 0;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const tick = (now) => {
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

  const startHold = () => {
    if (disabled) return;
    setHolding(true);
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelHold(), []);

  return (
    <button
      type="button"
      className={`rb-hold-stop ${holding ? 'rb-hold-stop--active' : ''}`}
      disabled={disabled}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      aria-label={label}
    >
      <span
        className="rb-hold-stop__ring"
        style={{ background: `conic-gradient(var(--rb-neon) ${progress}%, rgba(255,255,255,0.08) 0)` }}
      />
      <span className="rb-hold-stop__inner">
        <Icon name="stop_circle" filled />
        <span>{holding ? `${Math.ceil((HOLD_MS - (progress / 100) * HOLD_MS) / 1000)}…` : label}</span>
      </span>
    </button>
  );
}
