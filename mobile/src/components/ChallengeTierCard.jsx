import Icon from './Icon';

function km(v) {
  return (Number(v) || 0).toLocaleString('ru', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function statusMeta(status) {
  switch (status) {
    case 'ACTIVE':
      return { label: 'KM ACTIVE', tone: 'active' };
    case 'COMPLETED':
      return { label: 'KM DONE', tone: 'done' };
    case 'EXPIRED':
      return { label: 'KM EXPIRED', tone: 'expired' };
    default:
      return { label: 'KM LOCKED', tone: 'locked' };
  }
}

/**
 * Карточка уровня задания в стиле L1 · 50 / KM ACTIVE · награда
 */
export default function ChallengeTierCard({
  levelNum,
  targetKm,
  name,
  deadlineDays,
  exampleReward,
  status = 'LOCKED',
  currentKm,
  progressPercent,
  remainingLabel,
  description,
  onClick,
  actionLabel,
  onAction,
  compact = false,
}) {
  const meta = statusMeta(status);
  const isActive = status === 'ACTIVE';
  const showProgress = isActive && currentKm != null;
  const Tag = onClick ? 'button' : 'article';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`rb-tier-card rb-tier-card--${meta.tone}${compact ? ' rb-tier-card--compact' : ''}${
        onClick ? ' rb-tier-card--clickable' : ''
      }`}
      onClick={onClick}
    >
      <div className="rb-tier-card__row">
        <div className="rb-tier-card__level">
          <strong className="rb-tier-card__code font-display font-tabular">
            L{levelNum} · {km(targetKm)}
          </strong>
          <span className={`rb-tier-card__status rb-tier-card__status--${meta.tone}`}>
            {meta.label}
          </span>
        </div>

        <div className="rb-tier-card__mid">
          <span className="rb-tier-card__title">
            {name || `Задание ${km(targetKm)} км`}
            {deadlineDays != null ? (
              <>
                <span className="rb-tier-card__dot" aria-hidden>
                  ·
                </span>
                <span className="font-tabular">{deadlineDays} дн.</span>
              </>
            ) : null}
          </span>
          {description && !compact ? (
            <span className="rb-tier-card__desc">{description}</span>
          ) : null}
        </div>

        <div className="rb-tier-card__reward">
          <span className="rb-tier-card__reward-text">
            {exampleReward || 'Награда RunBonus'}
          </span>
        </div>
      </div>

      {showProgress && (
        <div className="rb-tier-card__progress">
          <div className="rb-tier-card__progress-head">
            <span className="font-display font-tabular">
              {km(currentKm)}
              <span className="rb-tier-card__progress-unit"> / {km(targetKm)} км</span>
            </span>
            {remainingLabel ? (
              <span className="rb-tier-card__remaining">
                <Icon name="schedule" />
                {remainingLabel}
              </span>
            ) : null}
          </div>
          <div className="rb-progress-bar" aria-label="Прогресс задания">
            <span style={{ width: `${Math.min(100, Math.max(0, Number(progressPercent) || 0))}%` }} />
          </div>
        </div>
      )}

      {onAction && actionLabel ? (
        <button
          type="button"
          className="rb-btn-pill rb-btn-pill--sm rb-tier-card__cta"
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
        >
          {actionLabel}
          <Icon name="arrow_forward" />
        </button>
      ) : null}
    </Tag>
  );
}
