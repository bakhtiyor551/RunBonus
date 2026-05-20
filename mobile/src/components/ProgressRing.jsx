export default function ProgressRing({ value, max, label, size = 96 }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const r = (size - 16) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;
  const cx = size / 2;

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={cx} cy={cx} r={r} fill="transparent" stroke="rgba(195, 244, 0, 0.05)" strokeWidth="8" />
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="transparent"
            stroke="#c3f400"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="rb-headline font-tabular" style={{ color: 'var(--rb-neon)', fontSize: 22 }}>
            {Math.round(value)}
          </span>
        </div>
      </div>
      <span className="rb-label" style={{ display: 'block', marginTop: 12 }}>{label}</span>
    </div>
  );
}
