import { formatKm } from './challengeUtils';

export default function ChallengeLevelCard({ level, isEditing, onEdit }) {
  const active = level.status === 'active';
  const rewards = level.rewards || [];

  return (
    <article
      className={`challenges-tier glass-card${isEditing ? ' challenges-tier--editing' : ''}${
        !active ? ' challenges-tier--inactive' : ''
      }`}
    >
      <div className="challenges-tier__rail" aria-hidden>
        <span className="challenges-tier__node">L{level.level_num}</span>
      </div>

      <div className="challenges-tier__body">
        <header className="challenges-tier__head">
          <div className="challenges-tier__title-block">
            <p className="challenges-tier__code">
              L{level.level_num} · {formatKm(level.target_km)} км
            </p>
            <h3>{level.name}</h3>
          </div>
          <div className="challenges-tier__actions">
            <span
              className={`challenges-status challenges-status--${active ? 'ok' : 'off'}`}
            >
              {active ? 'Активен' : 'Выключен'}
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(level)}>
              <span className="material-symbols-outlined" aria-hidden>
                edit
              </span>
              Изменить
            </button>
          </div>
        </header>

        <div className="challenges-tier__metrics">
          <span className="challenges-tier__metric">
            <span className="material-symbols-outlined" aria-hidden>
              route
            </span>
            {formatKm(level.target_km)} км
          </span>
          <span className="challenges-tier__metric">
            <span className="material-symbols-outlined" aria-hidden>
              schedule
            </span>
            {level.deadline_days} дн.
          </span>
          {level.example_reward ? (
            <span className="challenges-tier__metric challenges-tier__metric--reward">
              <span className="material-symbols-outlined" aria-hidden>
                redeem
              </span>
              {level.example_reward}
            </span>
          ) : null}
        </div>

        {level.description ? (
          <p className="challenges-tier__desc">{level.description}</p>
        ) : null}

        <footer className="challenges-tier__foot">
          {rewards.length ? (
            <div className="challenges-tier__rewards">
              {rewards.map((r) => (
                <span key={r.id || r.name} className="challenges-reward-chip">
                  {r.name}
                </span>
              ))}
            </div>
          ) : (
            <span className="muted">Награды не привязаны</span>
          )}
        </footer>
      </div>
    </article>
  );
}
