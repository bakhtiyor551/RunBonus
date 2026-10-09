import { Fragment, useMemo, useState } from 'react';
import {
  CLAIM_FILTER_PRESETS,
  CLAIM_STATUSES,
  claimTone,
  formatDateTime,
  isOpenClaim,
} from './challengeUtils';

export default function ChallengeClaimsPanel({ claims, onStatusChange }) {
  const [filter, setFilter] = useState('open');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const filtered = useMemo(() => {
    return claims.filter((c) => {
      if (filter === 'open' && !isOpenClaim(c.status)) return false;
      if (filter && filter !== 'open' && c.status !== filter) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const hay = [
          c.first_name,
          c.user_name,
          c.user_phone,
          c.level_name,
          c.reward_name,
          c.promo_code,
          c.city,
          c.address,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [claims, filter, query]);

  const toggleExpanded = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const hasDelivery = (c) =>
    !!(c.address || c.city || c.phone || c.color || c.admin_comment);

  return (
    <div className="glass-card challenges-claims">
      <div className="challenges-claims__head">
        <div>
          <h2>Заявки на награды</h2>
          <p className="muted">Обработка выдачи после выполнения задания</p>
        </div>
        <span className="challenges-claims__count chip">
          {filtered.length} из {claims.length}
        </span>
      </div>

      <div className="challenges-claims__toolbar">
        <label className="challenges-claims__search">
          <span className="material-symbols-outlined" aria-hidden>
            search
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Клиент, телефон, награда…"
          />
        </label>
        <div className="challenges-claims__filters" role="group" aria-label="Фильтр по статусу">
          {CLAIM_FILTER_PRESETS.map((p) => (
            <button
              key={p.id || 'all'}
              type="button"
              className={`chip chip--pill${filter === p.id ? ' chip--accent' : ''}`}
              onClick={() => setFilter(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!filtered.length ? (
        <div className="challenges-empty">
          <span className="material-symbols-outlined challenges-empty__icon" aria-hidden>
            inbox
          </span>
          <p>Заявок по выбранному фильтру нет</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table challenges-claims-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Клиент</th>
                <th>Уровень</th>
                <th>Награда</th>
                <th>Дата</th>
                <th>Статус</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const expanded = expandedId === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr className={expanded ? 'is-expanded' : ''}>
                      <td className="mono">
                        <button
                          type="button"
                          className="challenges-claims__id-btn"
                          onClick={() => hasDelivery(c) && toggleExpanded(c.id)}
                          title={hasDelivery(c) ? 'Доставка и комментарий' : undefined}
                        >
                          #{c.id}
                          {hasDelivery(c) ? (
                            <span className="material-symbols-outlined" aria-hidden>
                              {expanded ? 'expand_less' : 'expand_more'}
                            </span>
                          ) : null}
                        </button>
                      </td>
                      <td>
                        <strong>{c.first_name || c.user_name || '—'}</strong>
                        <div className="muted">{c.user_phone || '—'}</div>
                      </td>
                      <td>
                        <span className="chip chip--accent">L{c.level_num}</span>
                        <div className="muted challenges-claims__sub">{c.level_name}</div>
                      </td>
                      <td>
                        <strong>{c.reward_name}</strong>
                        {c.size ? <div className="muted">Размер: {c.size}</div> : null}
                        {c.promo_code ? <div className="muted">Промо: {c.promo_code}</div> : null}
                      </td>
                      <td className="challenges-claims__date">
                        <div>{formatDateTime(c.claimed_at)}</div>
                        {c.delivered_at ? (
                          <div className="muted">Выдано: {formatDateTime(c.delivered_at)}</div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`challenges-status challenges-status--${claimTone(c.status)}`}>
                          {CLAIM_STATUSES.find((s) => s.id === c.status)?.label || c.status}
                        </span>
                      </td>
                      <td>
                        <select
                          className="challenges-claims-select"
                          value={c.status}
                          onChange={(e) => onStatusChange(c.id, e.target.value)}
                          aria-label="Сменить статус заявки"
                        >
                          {CLAIM_STATUSES.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    {expanded && hasDelivery(c) ? (
                      <tr className="challenges-claims-detail-row">
                        <td colSpan={7}>
                          <div className="challenges-claims-detail">
                            {c.phone ? (
                              <div>
                                <span className="challenges-claims-detail__label">Телефон</span>
                                {c.phone}
                              </div>
                            ) : null}
                            {c.city ? (
                              <div>
                                <span className="challenges-claims-detail__label">Город</span>
                                {c.city}
                              </div>
                            ) : null}
                            {c.address ? (
                              <div className="challenges-claims-detail__wide">
                                <span className="challenges-claims-detail__label">Адрес</span>
                                {c.address}
                              </div>
                            ) : null}
                            {c.color ? (
                              <div>
                                <span className="challenges-claims-detail__label">Цвет</span>
                                {c.color}
                              </div>
                            ) : null}
                            {c.admin_comment ? (
                              <div className="challenges-claims-detail__wide">
                                <span className="challenges-claims-detail__label">Комментарий</span>
                                {c.admin_comment}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
