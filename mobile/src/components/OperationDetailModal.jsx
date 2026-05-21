import Icon from './Icon';
import DetailSheet, { StatRow } from './DetailSheet';
import { formatBalance } from '../utils/format';
import { formatWorkoutStatus } from '../utils/workoutStats';
import { formatOperationDate, getOperationMeta } from '../utils/bonusHistory';

function operationStatusClass(type) {
  if (type === 'earn' || type === 'withdraw_reject') return 'rb-detail-sheet__status--ok';
  if (type === 'withdraw_hold') return 'rb-detail-sheet__status--warn';
  return '';
}

export default function OperationDetailModal({ operation, onClose }) {
  if (!operation) return null;

  const meta = getOperationMeta(operation.type);
  const amount = Number(operation.amount) || 0;
  const balanceAfter = operation.balance_after != null ? Number(operation.balance_after) : null;

  return (
    <DetailSheet open title={meta.title} titleId="operation-detail-title" onClose={onClose}>
      <div className="rb-detail-sheet__status-row">
        <div className="rb-activity-card__icon rb-detail-sheet__list-icon">
          <Icon name={meta.icon} />
        </div>
        <div className="rb-detail-sheet__list-text">
          <p className={`rb-detail-sheet__status ${operationStatusClass(operation.type)}`}>
            {operation.status}
          </p>
          <p className="rb-text-muted rb-detail-sheet__list-meta">№ {operation.id}</p>
        </div>
      </div>

      <div className="rb-detail-sheet__hero">
        <span
          className="rb-detail-sheet__hero-value font-display"
          style={meta.positive ? undefined : { color: 'var(--rb-on-surface)' }}
        >
          {meta.sign}
          {formatBalance(amount)}
        </span>
        <span className="rb-detail-sheet__hero-label">сомони</span>
      </div>

      <div className="rb-detail-sheet__grid">
        <StatRow label="Дата и время" value={formatOperationDate(operation.date)} />
        <StatRow label="Тип операции" value={meta.title} />
        {balanceAfter != null && (
          <StatRow label="Баланс после" value={`${formatBalance(balanceAfter)} сомони`} highlight />
        )}
        {operation.km != null && operation.km > 0 && (
          <StatRow label="Дистанция" value={`${Number(operation.km).toFixed(1)} км`} />
        )}
        {operation.workout_status && (
          <StatRow label="Тренировка" value={formatWorkoutStatus(operation.workout_status)} />
        )}
      </div>

      {operation.comment && (
        <div className="rb-detail-sheet__alert glass-card" style={{ borderColor: 'rgba(195, 244, 0, 0.25)' }}>
          <span className="rb-label rb-detail-sheet__alert-label">Комментарий</span>
          <p className="rb-detail-sheet__alert-text">{operation.comment}</p>
        </div>
      )}

      {operation.reject_reason && (
        <div className="rb-detail-sheet__alert glass-card">
          <span className="rb-label rb-detail-sheet__alert-label">Причина</span>
          <p className="rb-detail-sheet__alert-text">{operation.reject_reason}</p>
        </div>
      )}
    </DetailSheet>
  );
}
