export const PERIOD_OPTIONS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'yesterday', label: 'Вчера' },
  { id: '7d', label: '7 дней' },
  { id: '30d', label: '30 дней' },
  { id: 'month', label: 'Этот месяц' },
  { id: 'last_month', label: 'Прошлый месяц' },
  { id: 'year', label: 'Год' },
];

export function periodQuery(period, customFrom, customTo) {
  const q = new URLSearchParams({ period });
  if (period === 'custom' && customFrom) q.set('from', customFrom);
  if (period === 'custom' && customTo) q.set('to', customTo);
  return q.toString();
}

export function downloadCsv(filename, rows, columns) {
  const header = columns.map((c) => c.label).join(';');
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const v = row[c.key];
          const s = v == null ? '' : String(v);
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(';')
    )
    .join('\n');
  const blob = new Blob(['\uFEFF' + header + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function SimpleLineChart({ data, valueKey, label = '' }) {
  if (!data?.length) return <p className="hint">Нет данных для графика</p>;
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  const w = 600;
  const h = 160;
  const pad = 16;
  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const toY = (v) => h - pad - ((Number(v) || 0) / max) * (h - pad * 2);
  const toX = (i) => pad + i * step;
  const path = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i)} ${toY(d[valueKey])}`)
    .join(' ');
  return (
    <div className="chart-card__canvas chart-gradient">
      {label && <p className="hint" style={{ margin: '0 0 8px' }}>{label}</p>}
      <svg viewBox={`0 0 ${w} ${h}`} className="chart-card__svg" preserveAspectRatio="none">
        <path d={path} fill="none" stroke="var(--primary-fixed-dim)" strokeWidth={3} strokeLinecap="round" />
      </svg>
    </div>
  );
}
