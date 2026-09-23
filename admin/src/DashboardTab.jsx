import { useEffect, useState } from 'react';
import { adminApi } from './api';
import Icon from './components/Icon';
import { formatNumber, timeAgo } from './utils/format';

function StatCard({ icon, label, value, badge, live, wide, highlight }) {
  return (
    <div className={`glass-card stat-card${wide ? ' stat-card--wide' : ''}${highlight ? ' stat-card--highlight' : ''}`}>
      <div className="stat-card__head">
        <div className="stat-card__icon-wrap">
          <Icon name={icon} />
        </div>
        {badge && <span className="chip chip--accent">{badge}</span>}
        {live && (
          <span className="stat-card__live">
            <span className="stat-card__live-dot" />
            Live
          </span>
        )}
      </div>
      <div>
        <p className="stat-card__label">{label}</p>
        <h3 className={`stat-card__value${highlight ? ' stat-card__value--accent' : ''}`}>{value}</h3>
      </div>
    </div>
  );
}

function GrowthChart({ users, workouts }) {
  const weeks = 8;
  const now = Date.now();
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const end = now - (weeks - 1 - i) * 7 * 86400000;
    const start = end - 7 * 86400000;
    const newUsers = users.filter((u) => {
      const t = new Date(u.created_at).getTime();
      return t >= start && t < end;
    }).length;
    return { newUsers };
  });
  const max = Math.max(1, ...buckets.map((b) => b.newUsers));
  const w = 800;
  const h = 280;
  const pad = 20;
  const step = (w - pad * 2) / (weeks - 1);

  const toY = (v) => h - pad - (v / max) * (h - pad * 2);
  const toX = (i) => pad + i * step;

  const linePath = buckets
    .map((b, i) => `${i === 0 ? 'M' : 'L'}${toX(i)} ${toY(b.newUsers)}`)
    .join(' ');

  return (
    <div className="glass-card chart-card">
      <div className="chart-card__header">
        <div>
          <h4 className="chart-card__title">Рост платформы</h4>
          <p className="chart-card__subtitle">Новые клиенты по неделям</p>
        </div>
      </div>
      <div className="chart-card__canvas chart-gradient">
        <svg viewBox={`0 0 ${w} ${h}`} className="chart-card__svg" preserveAspectRatio="none">
          {[0.25, 0.5, 0.75].map((p) => (
            <line
              key={p}
              x1={0}
              x2={w}
              y1={h * p}
              y2={h * p}
              stroke="var(--outline-variant)"
              strokeOpacity={0.15}
            />
          ))}
          <path d={linePath} fill="none" stroke="var(--primary-fixed-dim)" strokeWidth={4} strokeLinecap="round" />
        </svg>
      </div>
      <div className="chart-card__footer">
        <div className="chart-card__legend">
          <span className="chart-card__legend-item">
            <span className="chart-card__legend-dot chart-card__legend-dot--accent" />
            Новые клиенты
          </span>
        </div>
        <span className="chart-card__total">Всего тренировок: {formatNumber(workouts.length)}</span>
      </div>
    </div>
  );
}

export default function DashboardTab({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [shoes, setShoes] = useState([]);
  const [rewardStats, setRewardStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [u, w, s, rs] = await Promise.all([
          adminApi('/api/admin/users'),
          adminApi('/api/admin/workouts'),
          adminApi('/api/admin/shoes'),
          adminApi('/api/admin/rewards/stats').catch(() => null),
        ]);
        if (!cancelled) {
          setUsers(u);
          setWorkouts(w);
          setShoes(s);
          setRewardStats(rs);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="page-content">
        <p className="hint">Загрузка аналитики…</p>
      </div>
    );
  }

  const activeWorkouts = workouts.filter((w) => w.status === 'in_progress').length;
  const approvedKm = workouts
    .filter((w) => w.status === 'approved')
    .reduce((s, w) => s + (Number(w.distance_km) || 0), 0);
  const activatedShoes = shoes.filter((s) => s.status === 'activated').length;
  const shoePct = shoes.length ? Math.round((activatedShoes / shoes.length) * 100) : 0;

  const recentApproved = workouts
    .filter((w) => w.status === 'approved')
    .slice(0, 5);

  const topRunners = [...users]
    .sort((a, b) => (Number(b.total_km) || Number(b.total_distance_km) || 0) - (Number(a.total_km) || Number(a.total_distance_km) || 0))
    .slice(0, 3);

  const models = shoes.reduce((acc, s) => {
    acc[s.model_name] = (acc[s.model_name] || 0) + 1;
    return acc;
  }, {});
  const modelBars = Object.entries(models)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxBar = Math.max(1, ...modelBars.map(([, c]) => c));

  return (
    <div className="page-content dashboard">
      <section className="bento-grid bento-grid--stats">
        <StatCard icon="group" label="Всего клиентов" value={formatNumber(users.length)} />
        <StatCard
          icon="directions_run"
          label="Активные тренировки"
          value={formatNumber(activeWorkouts)}
          live
        />
        <StatCard
          icon="straighten"
          label="Подтверждённые км"
          value={`${approvedKm.toFixed(1)} км`}
          wide
          highlight
        />
        <StatCard
          icon="redeem"
          label="Выбрано наград"
          value={formatNumber(rewardStats?.selectedCount || 0)}
        />
        <StatCard icon="qr_code_2" label="Кодов кроссовок" value={formatNumber(shoes.length)} />
      </section>

      <section className="bento-grid bento-grid--main">
        <GrowthChart users={users} workouts={workouts} />
        <div className="glass-card payouts-card">
          <div className="payouts-card__header">
            <h4 className="chart-card__title">Последние тренировки</h4>
            <Icon name="more_horiz" className="text-muted" />
          </div>
          <div className="payouts-card__list custom-scrollbar">
            {recentApproved.length === 0 && <p className="hint">Пока нет одобренных тренировок</p>}
            {recentApproved.map((w) => (
              <div key={w.id} className="payout-item">
                <div className="payout-item__icon">
                  <Icon name="directions_run" />
                </div>
                <div className="payout-item__body">
                  <p className="payout-item__name">{w.client_name}</p>
                  <p className="payout-item__meta">
                    {w.phone}
                  </p>
                </div>
                <div className="payout-item__amount">
                  <p>{Number(w.distance_km || 0).toFixed(2)} км</p>
                  <p className="payout-item__time">{timeAgo(w.started_at)}</p>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn--outline btn--block" onClick={() => onNavigate(2)}>
            Все тренировки
          </button>
          <button
            type="button"
            className="btn btn--primary btn--block"
            style={{ marginTop: 8 }}
            onClick={() => onNavigate('rewards')}
          >
            Награды
          </button>
        </div>
      </section>

      {(rewardStats?.milestones || []).length > 0 && (
        <section className="glass-card card" style={{ marginBottom: 16 }}>
          <h5 className="section-label">Достижения milestones</h5>
          <div className="entity-cards-grid" style={{ marginTop: 12 }}>
            {rewardStats.milestones.map((m) => (
              <div key={m.id} className="glass-card card">
                <div className="muted">{m.name}</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{m.reached}</div>
                <div className="muted">{m.distanceKm} км</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bento-grid bento-grid--bottom">
        <div className="glass-card">
          <h5 className="section-label">Модели кроссовок</h5>
          <div className="bar-chart">
            {modelBars.map(([name, count]) => (
              <div
                key={name}
                className="bar-chart__bar"
                style={{ height: `${(count / maxBar) * 100}%` }}
                title={`${name}: ${count}`}
              />
            ))}
            {modelBars.length === 0 && <p className="hint">Нет данных</p>}
          </div>
          <div className="bar-chart__footer">
            <span className="stat-card__value">{formatNumber(shoes.length)}</span>
            <span className="chip chip--accent">активировано {activatedShoes}</span>
          </div>
        </div>

        <div className="glass-card health-card">
          <div className="health-ring">
            <svg viewBox="0 0 96 96">
              <circle cx="48" cy="48" r="40" className="health-ring__track" />
              <circle
                cx="48"
                cy="48"
                r="40"
                className="health-ring__progress"
                strokeDasharray={251.2}
                strokeDashoffset={251.2 * (1 - shoePct / 100)}
              />
            </svg>
            <span className="health-ring__label">{shoePct}%</span>
          </div>
          <h5 className="section-label">Активация QR</h5>
          <p className="health-card__status">OPTIMIZED</p>
        </div>

        <div className="glass-card ranking-card">
          <div className="ranking-card__header">
            <h5 className="section-label">Топ по километрам</h5>
            <button type="button" className="chip chip--pill" onClick={() => onNavigate(0)}>
              Клиенты
            </button>
          </div>
          <div className="ranking-list">
            {topRunners.map((u, i) => (
              <div key={u.id} className="ranking-item">
                <div className="ranking-item__left">
                  <span className={`ranking-item__bar${i === 0 ? ' ranking-item__bar--active' : ''}`} />
                  <span className="ranking-item__name">
                    {i + 1}. {u.name || u.phone}
                  </span>
                </div>
                <span
                  className={
                    i === 0 ? 'ranking-item__score ranking-item__score--accent' : 'ranking-item__score'
                  }
                >
                  {(Number(u.total_km) || Number(u.total_distance_km) || 0).toFixed(1)} км
                </span>
              </div>
            ))}
            {topRunners.length === 0 && <p className="hint">Нет клиентов</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
