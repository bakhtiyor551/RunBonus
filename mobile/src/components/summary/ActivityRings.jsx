const RING_META = [
  { key: 'move', color: '#fa114f', label: 'Движение', unit: 'ккал' },
  { key: 'exercise', color: '#c3f400', label: 'Тренировка', unit: 'мин' },
  { key: 'distance', color: '#00d4ff', label: 'Дистанция', unit: 'км' },
];

function formatRingValue(key, ring) {
  const v = Number(ring?.current ?? 0);
  const g = Number(ring?.goal ?? 0);
  if (key === 'distance') return `${v.toFixed(1)} / ${g.toFixed(1)} км`;
  if (key === 'move') return `${Math.round(v)} / ${Math.round(g)} ккал`;
  return `${Math.round(v)} / ${Math.round(g)} мин`;
}

export default function ActivityRings({ rings }) {
  const size = 168;
  const stroke = 12;
  const gap = 16;
  const cx = size / 2;

  return (
    <div className="rb-activity-rings">
      <div className="rb-activity-rings__canvas">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`rotate(-90 ${cx} ${cx})`}>
            {RING_META.map((meta, index) => {
              const ringSize = size - index * gap * 2;
              const r = (ringSize - stroke) / 2;
              const pct = Math.min(100, Math.max(0, rings?.[meta.key]?.percent ?? 0));
              const circumference = 2 * Math.PI * r;
              const offset = circumference - (pct / 100) * circumference;
              const ringCx = size / 2;
              return (
                <g key={meta.key}>
                  <circle
                    cx={ringCx}
                    cy={ringCx}
                    r={r}
                    fill="transparent"
                    stroke="rgba(255,255,255,0.07)"
                    strokeWidth={stroke}
                  />
                  <circle
                    cx={ringCx}
                    cy={ringCx}
                    r={r}
                    fill="transparent"
                    stroke={meta.color}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                  />
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="rb-activity-rings__legend">
        {RING_META.map((meta) => (
          <div key={meta.key} className="rb-activity-rings__item">
            <span className="rb-activity-rings__dot" style={{ background: meta.color }} />
            <div>
              <span className="rb-label">{meta.label}</span>
              <strong>{formatRingValue(meta.key, rings?.[meta.key])}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
