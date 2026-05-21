import Icon from './Icon';
import { formatBalance } from '../utils/format';
import { formatOperationDateShort, getOperationMeta } from '../utils/bonusHistory';

export default function OperationRow({ item, onPress }) {
  const meta = getOperationMeta(item.type);
  const color = meta.positive ? 'var(--rb-neon)' : 'var(--rb-on-surface)';

  return (
    <button type="button" className="glass-card rb-activity-card" onClick={() => onPress(item)}>
      <div className="rb-activity-card__icon">
        <Icon name={meta.icon} />
      </div>
      <div className="rb-detail-sheet__list-text">
        <p className="rb-detail-sheet__list-title">{formatOperationDateShort(item.date)}</p>
        <p className="rb-text-muted rb-detail-sheet__list-meta">
          {item.status}
          {item.km != null ? ` • ${item.km} км` : ''}
        </p>
      </div>
      <span className="rb-headline font-display" style={{ color, fontSize: 18, flexShrink: 0 }}>
        {meta.sign}
        {formatBalance(item.amount)}
      </span>
    </button>
  );
}
