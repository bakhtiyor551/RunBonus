export default function WeeklyChart({ days = [], totals }) {
  const maxKm = Math.max(0.1, ...days.map((d) => Number(d.distance) || 0));

  return (
    <div className="rb-weekly-chart">
      <div className="rb-weekly-chart__bars">
        {days.map((day) => {
          const h = Math.max(8, ((Number(day.distance) || 0) / maxKm) * 100);
          return (
            <div key={day.date || day.day} className="rb-weekly-chart__col">
              <div className="rb-weekly-chart__bar-wrap">
                <div className="rb-weekly-chart__bar" style={{ height: `${h}%` }} title={`${day.distance} км`} />
              </div>
              <span className="rb-weekly-chart__day">{day.day}</span>
              <span className="rb-weekly-chart__km">{(Number(day.distance) || 0).toFixed(1)}</span>
            </div>
          );
        })}
      </div>
      {totals && (
        <div className="rb-weekly-chart__totals">
          <div>
            <span className="rb-label">Всего км</span>
            <strong className="font-display">{(totals.distance ?? 0).toFixed(1)}</strong>
          </div>
          <div>
            <span className="rb-label">Шаги</span>
            <strong className="font-display">{(totals.steps ?? 0).toLocaleString('ru')}</strong>
          </div>
          <div>
            <span className="rb-label">Бонусы</span>
            <strong className="font-display">{(totals.bonus ?? 0).toFixed(1)}</strong>
          </div>
          <div>
            <span className="rb-label">Среднее/день</span>
            <strong className="font-display">{(totals.avg_distance_per_day ?? 0).toFixed(1)} км</strong>
          </div>
        </div>
      )}
    </div>
  );
}
