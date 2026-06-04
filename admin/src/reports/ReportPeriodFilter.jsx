import { PERIOD_OPTIONS } from './reportUtils';

export default function ReportPeriodFilter({ period, onPeriodChange, onRefresh }) {
  return (
    <div className="report-toolbar glass-card">
      <div className="report-toolbar__filters">
        {PERIOD_OPTIONS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`chip chip--pill${period === p.id ? ' chip--accent' : ''}`}
            onClick={() => onPeriodChange(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="report-toolbar__actions">
        <button type="button" className="btn btn--sm" onClick={onRefresh}>
          Обновить
        </button>
      </div>
    </div>
  );
}
