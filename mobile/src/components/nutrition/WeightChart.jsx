function formatDay(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

export default function WeightChart({ items = [], targetWeight }) {
  if (!items.length) {
    return <p className="rb-text-muted">Нет записей за период</p>;
  }

  const weights = items.map((i) => Number(i.weight_kg));
  const allValues = targetWeight != null ? [...weights, Number(targetWeight)] : weights;
  const minW = Math.min(...allValues);
  const maxW = Math.max(...allValues);
  const range = Math.max(maxW - minW, 0.5);

  return (
    <div className="rb-weight-chart">
      {targetWeight != null && (
        <div className="rb-weight-chart__target">
          <span className="rb-label">Цель</span>
          <span className="font-tabular">{targetWeight} кг</span>
        </div>
      )}
      <div className="rb-weight-chart__cols">
        {items.map((item) => {
          const w = Number(item.weight_kg);
          const pct = ((w - minW) / range) * 100;
          const h = Math.max(8, pct);
          return (
            <div key={item.id || item.date} className="rb-weight-chart__col">
              <span className="rb-weight-chart__val font-tabular">{w}</span>
              <div className="rb-weight-chart__bar-wrap">
                <div className="rb-weight-chart__bar" style={{ height: `${h}%` }} title={`${w} кг`} />
              </div>
              <span className="rb-weight-chart__day">{formatDay(item.logged_at || item.date)}</span>
            </div>
          );
        })}
      </div>
      <div className="rb-weight-chart__scale">
        <span>{maxW.toFixed(1)} кг</span>
        <span>{minW.toFixed(1)} кг</span>
      </div>
    </div>
  );
}
