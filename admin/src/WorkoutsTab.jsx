import { useEffect, useMemo, useState } from 'react';
import { adminApi } from './api';
import WorkoutDetail from './WorkoutDetail';
import WorkoutsLivePanel from './components/WorkoutsLivePanel';
import Icon from './components/Icon';
import { formatMoney, timeAgo } from './utils/format';

const STATUS = {
  in_progress: { label: 'В процессе', className: 'workout-card__status--live' },
  approved: { label: 'Одобрено', className: 'workout-card__status--ok' },
  rejected: { label: 'Отклонено', className: 'workout-card__status--bad' },
  suspicious: { label: 'Подозрительно', className: 'workout-card__status--bad' },
  rejected_no_fund: { label: 'Нет фонда', className: 'workout-card__status--bad' },
};

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'in_progress', label: 'В процессе' },
  { value: 'approved', label: 'Одобрено' },
  { value: 'rejected', label: 'Отклонено' },
  { value: 'suspicious', label: 'Подозрительно' },
  { value: 'rejected_no_fund', label: 'Нет фонда' },
];

function filterWorkouts(workouts, { status, search }) {
  const q = search.trim().toLowerCase();
  return workouts.filter((w) => {
    if (status && w.status !== status) return false;
    if (q) {
      const name = (w.client_name || '').toLowerCase();
      const phone = (w.phone || '').toLowerCase();
      if (!name.includes(q) && !phone.includes(q)) return false;
    }
    return true;
  });
}

function clientKey(c) {
  return c.user_id ?? c.phone;
}

function formatDuration(seconds) {
  if (seconds == null) return '—';
  const s = Number(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин ${sec > 0 ? `${sec} с` : ''}`.trim();
  return `${sec} с`;
}

function groupByClient(workouts) {
  const map = new Map();
  for (const w of workouts) {
    const key = w.user_id ?? w.phone ?? w.client_name;
    if (!map.has(key)) {
      map.set(key, {
        user_id: w.user_id,
        client_name: w.client_name,
        phone: w.phone,
        workouts: [],
        total_km: 0,
        total_bonus: 0,
        active_count: 0,
      });
    }
    const g = map.get(key);
    g.workouts.push(w);
    g.total_km += Number(w.distance_km) || 0;
    g.total_bonus += Number(w.bonus) || 0;
    if (w.status === 'in_progress') g.active_count += 1;
  }
  for (const g of map.values()) {
    g.workouts.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  }
  return [...map.values()].sort((a, b) => {
    const ta = a.workouts[0]?.started_at;
    const tb = b.workouts[0]?.started_at;
    return new Date(tb) - new Date(ta);
  });
}

function WorkoutHistoryCard({ workout, onOpen }) {
  const meta = STATUS[workout.status] ?? { label: workout.status, className: '' };
  const isLive = workout.status === 'in_progress';

  return (
    <article
      className={`workout-history-card entity-card glass-card${isLive ? ' workout-history-card--live' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(workout.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(workout.id)}
    >
      <div className="entity-card__head">
        <div className="entity-card__icon">
          <Icon name="directions_run" />
        </div>
        <span className={`chip ${meta.className}`}>
          {isLive && <span className="stat-card__live-dot" />}
          {meta.label}
        </span>
      </div>

      <p className="entity-card__sub entity-card__sub--muted">#{workout.id}</p>

      <div className="entity-card__highlight">
        <span className="entity-card__highlight-label">Дистанция</span>
        <span className="entity-card__highlight-value">
          {Number(workout.distance_km).toFixed(2)} км
        </span>
      </div>

      <div className="workout-history-card__stats">
        <div className="workout-history-card__stat">
          <span className="workout-history-card__stat-label">Время</span>
          <strong>{formatDuration(workout.duration_seconds)}</strong>
        </div>
        <div className="workout-history-card__stat">
          <span className="workout-history-card__stat-label">Бонус</span>
          <strong className="workout-history-card__stat-bonus">
            {workout.bonus > 0 ? `+${formatMoney(workout.bonus)}` : '—'}
          </strong>
        </div>
      </div>

      <p className="entity-card__meta">
        <Icon name="schedule" />
        {new Date(workout.started_at).toLocaleString('ru')}
      </p>
      <p className="entity-card__meta entity-card__meta--muted">{timeAgo(workout.started_at)}</p>

      {workout.reject_reason && (
        <p className="workout-history-card__reject">{workout.reject_reason}</p>
      )}

      <span className="entity-card__link">
        Подробнее <Icon name="arrow_forward" />
      </span>
    </article>
  );
}

function ClientWorkoutsDetail({ client, onClose, onOpenWorkout }) {
  return (
    <div className="glass-card card client-workouts-detail">
      <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
        <Icon name="arrow_back" />
        Назад к списку
      </button>

      <div className="client-workouts-card__head" style={{ marginTop: 16 }}>
        <div className="entity-card__icon">
          <Icon name="person" />
        </div>
        <div className="client-workouts-card__title-wrap">
          <h3>{client.client_name || 'Без имени'}</h3>
          <p className="client-workouts-card__phone">
            <Icon name="call" />
            {client.phone}
          </p>
        </div>
        {client.active_count > 0 && (
          <span className="workout-card__status chip workout-card__status--live">
            <span className="stat-card__live-dot" />
            {client.active_count} в процессе
          </span>
        )}
      </div>

      <div className="client-workouts-card__summary">
        <div>
          <span className="workout-card__metric-label">Тренировок</span>
          <strong>{client.workouts.length}</strong>
        </div>
        <div>
          <span className="workout-card__metric-label">Всего км</span>
          <strong>{client.total_km.toFixed(2)}</strong>
        </div>
        <div>
          <span className="workout-card__metric-label">Бонусов</span>
          <strong className="client-workouts-card__bonus">+{formatMoney(client.total_bonus)}</strong>
        </div>
      </div>

      <h4 className="client-workouts-card__history-title">История тренировок</h4>
      {client.workouts.length === 0 ? (
        <p className="hint">Нет тренировок</p>
      ) : (
        <div className="workout-history-grid">
          {client.workouts.map((w) => (
            <WorkoutHistoryCard key={w.id} workout={w} onOpen={onOpenWorkout} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClientWorkoutsCard({ client, selected, onOpenDetails }) {
  const last = client.workouts[0];

  return (
    <article
      className={`client-workouts-card glass-card client-workouts-card--compact${selected ? ' entity-card--selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails(client)}
      onKeyDown={(e) => e.key === 'Enter' && onOpenDetails(client)}
    >
      <div className="client-workouts-card__head">
        <div className="entity-card__icon">
          <Icon name="person" />
        </div>
        <div className="client-workouts-card__title-wrap">
          <h3 className="client-workouts-card__name">{client.client_name || 'Без имени'}</h3>
          <p className="client-workouts-card__phone">
            <Icon name="call" />
            {client.phone}
          </p>
        </div>
        {client.active_count > 0 && (
          <span className="workout-card__status chip workout-card__status--live">
            <span className="stat-card__live-dot" />
            {client.active_count}
          </span>
        )}
      </div>

      <div className="client-workouts-card__summary">
        <div>
          <span className="workout-card__metric-label">Тренировок</span>
          <strong>{client.workouts.length}</strong>
        </div>
        <div>
          <span className="workout-card__metric-label">Всего км</span>
          <strong>{client.total_km.toFixed(2)}</strong>
        </div>
        <div>
          <span className="workout-card__metric-label">Бонусов</span>
          <strong className="client-workouts-card__bonus">+{formatMoney(client.total_bonus)}</strong>
        </div>
      </div>

      {last && (
        <p className="client-workouts-card__last hint">
          Последняя: {new Date(last.started_at).toLocaleString('ru')} ·{' '}
          {Number(last.distance_km).toFixed(2)} км
        </p>
      )}

      <span className="entity-card__link">
        Тренировки <Icon name="arrow_forward" />
      </span>
    </article>
  );
}

export default function WorkoutsTab() {
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [workoutDetailId, setWorkoutDetailId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredWorkouts = useMemo(
    () => filterWorkouts(workouts, { status: filterStatus, search: searchQuery }),
    [workouts, filterStatus, searchQuery]
  );

  const clients = useMemo(() => groupByClient(filteredWorkouts), [filteredWorkouts]);

  const selectedClientView = useMemo(() => {
    if (!selectedClient) return null;
    return clients.find((c) => clientKey(c) === clientKey(selectedClient)) ?? null;
  }, [clients, selectedClient]);

  const active = workouts.filter((w) => w.status === 'in_progress').length;
  const hasFilters = filterStatus || searchQuery.trim();

  const load = async () => {
    setError('');
    try {
      const rows = await adminApi('/api/admin/workouts');
      setWorkouts(rows);
      if (selectedClient) {
        const filtered = filterWorkouts(rows, { status: filterStatus, search: searchQuery });
        const fresh = groupByClient(filtered).find((c) => clientKey(c) === clientKey(selectedClient));
        if (fresh) setSelectedClient(fresh);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openClientDetails = (client) => {
    setWorkoutDetailId(null);
    setSelectedClient(client);
  };

  const resetFilters = () => {
    setFilterStatus('');
    setSearchQuery('');
  };

  return (
    <div className="workouts-page">
      <div className="workouts-page__header glass-card">
        <div>
          <h2>Тренировки</h2>
          <p className="hint workouts-page__hint">
            {loading
              ? 'Загрузка…'
              : hasFilters
                ? `${clients.length} клиентов · ${filteredWorkouts.length} из ${workouts.length} тренировок`
                : `${clients.length} клиентов · ${workouts.length} тренировок`}
            {!loading && active > 0 && (
              <span className="workouts-page__live">
                <span className="stat-card__live-dot" />
                {active} в процессе
              </span>
            )}
          </p>
        </div>
        {!workoutDetailId && (
          <button type="button" className="btn btn--outline" onClick={load} disabled={loading}>
            <Icon name="refresh" />
            Обновить
          </button>
        )}
      </div>

      {!workoutDetailId && (
        <div className="glass-card card workouts-filters">
          <div className="workouts-filters__row">
            <label className="workouts-filters__field">
              <span className="workouts-filters__label">Статус</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                {STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="workouts-filters__field workouts-filters__field--grow">
              <span className="workouts-filters__label">Клиент</span>
              <input
                type="search"
                placeholder="Имя или телефон"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
            {hasFilters && (
              <button type="button" className="btn btn--ghost" onClick={resetFilters}>
                Сбросить
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {!workoutDetailId && !selectedClient && (
        <WorkoutsLivePanel onOpenWorkout={setWorkoutDetailId} />
      )}

      {workoutDetailId ? (
        <div className="glass-card card">
          <WorkoutDetail
            workoutId={workoutDetailId}
            onClose={() => setWorkoutDetailId(null)}
          />
        </div>
      ) : selectedClient ? (
        selectedClientView ? (
          <ClientWorkoutsDetail
            client={selectedClientView}
            onClose={() => setSelectedClient(null)}
            onOpenWorkout={setWorkoutDetailId}
          />
        ) : (
          <div className="glass-card card">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedClient(null)}>
              <Icon name="arrow_back" />
              Назад к клиентам
            </button>
            <p className="hint" style={{ marginTop: 16 }}>
              Нет тренировок по выбранному фильтру. Измените фильтр или{' '}
              <button type="button" className="btn btn--ghost btn--sm" onClick={resetFilters}>
                сбросьте его
              </button>
              .
            </p>
          </div>
        )
      ) : loading ? (
        <p className="hint">Загрузка тренировок…</p>
      ) : clients.length === 0 ? (
        <div className="glass-card workouts-empty">
          <Icon name="directions_run" />
          <p>{hasFilters ? 'Ничего не найдено по фильтру' : 'Тренировок пока нет'}</p>
          {hasFilters && (
            <button type="button" className="btn btn--outline" onClick={resetFilters}>
              Сбросить фильтр
            </button>
          )}
        </div>
      ) : (
        <div className="entity-cards-grid client-workouts-grid">
          {clients.map((c) => (
            <ClientWorkoutsCard
              key={c.user_id ?? c.phone}
              client={c}
              selected={false}
              onOpenDetails={openClientDetails}
            />
          ))}
        </div>
      )}
    </div>
  );
}
