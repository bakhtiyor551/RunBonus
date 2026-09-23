import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import { fetchMyAchievements, fetchMyLevel } from '../services/achievements';

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'DISTANCE', label: 'Дистанция' },
  { id: 'STREAK', label: 'Серии' },
  { id: 'WORKOUT_COUNT', label: 'Тренировки' },
  { id: 'EVENT', label: 'События' },
];

function km(value) {
  return (Number(value) || 0).toLocaleString('ru', { maximumFractionDigits: 2 });
}

function medalStatus(item) {
  if (item.unlocked) return 'Получено';
  if (item.type === 'DISTANCE') return `${km(item.remaining)} км`;
  if (item.type === 'WORKOUT_COUNT') return `${item.remaining} тр.`;
  if (item.type === 'STREAK') return `${item.remaining} дн.`;
  return `${Math.round(item.progress || 0)}%`;
}

export default function AchievementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'level' ? 'level' : 'medals';
  const [filter, setFilter] = useState('all');
  const [level, setLevel] = useState(null);
  const [achievements, setAchievements] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const [lv, ach] = await Promise.all([fetchMyLevel(), fetchMyAchievements()]);
    setLevel(lv);
    setAchievements(ach);
    return { lv, ach };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Не удалось загрузить');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const setTab = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'level') params.set('tab', 'level');
    else params.delete('tab');
    setSearchParams(params, { replace: true });
  };

  const medals = useMemo(() => {
    const list = achievements?.achievements || [];
    if (filter === 'all') return list;
    if (filter === 'EVENT') {
      return list.filter((a) => a.type === 'EVENT' || a.type === 'SPECIAL');
    }
    return list.filter((a) => a.type === filter);
  }, [achievements, filter]);

  const onRefresh = async (e) => {
    try {
      await load();
    } finally {
      e.detail.complete();
    }
  };

  return (
    <IonPage>
      <AppHeader title="Достижения" />
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={onRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div className="rb-page rb-achievements-page">
          <div className="rb-segment" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'medals'}
              className={`rb-segment__btn${tab === 'medals' ? ' rb-segment__btn--active' : ''}`}
              onClick={() => setTab('medals')}
            >
              Достижения
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'level'}
              className={`rb-segment__btn${tab === 'level' ? ' rb-segment__btn--active' : ''}`}
              onClick={() => setTab('level')}
            >
              Уровень
            </button>
          </div>

          {error ? <p className="rb-text-muted">{error}</p> : null}
          {loading && !level && !achievements ? (
            <p className="rb-text-muted">Загрузка…</p>
          ) : null}

          {tab === 'level' && level ? <LevelPanel level={level} /> : null}

          {tab === 'medals' ? (
            <>
              <div className="rb-filter-chips" role="tablist" aria-label="Фильтр медалей">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`rb-filter-chip${filter === f.id ? ' rb-filter-chip--active' : ''}`}
                    onClick={() => setFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {achievements ? (
                <p className="rb-text-muted rb-achievements-summary">
                  {achievements.unlockedCount} из {achievements.totalCount} · {km(achievements.totalDistance)} км
                </p>
              ) : null}

              <div className="rb-medal-grid">
                {medals.map((item) => (
                  <article
                    key={item.id}
                    className={`glass-card rb-medal-card${item.unlocked ? '' : ' rb-medal-card--locked'}`}
                  >
                    <div className="rb-medal-card__icon" aria-hidden>
                      {item.unlocked ? item.icon || '🏅' : '🔒'}
                    </div>
                    <h3 className="rb-medal-card__title font-display">{item.name}</h3>
                    <p className="rb-medal-card__status">{medalStatus(item)}</p>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </IonContent>
      <BottomNav />
    </IonPage>
  );
}

function LevelPanel({ level }) {
  return (
    <section className="rb-level-panel">
      <div className="glass-card rb-level-hero">
        <div className="rb-level-hero__icon" style={{ color: level.color || 'var(--rb-neon)' }}>
          {level.icon || <Icon name="military_tech" />}
        </div>
        <h2 className="font-display rb-level-hero__name">{level.name}</h2>
        <p className="rb-level-hero__km font-tabular">{km(level.totalDistance)} KM</p>

        <div className="rb-level-progress">
          <div className="rb-level-progress__track">
            <div
              className="rb-level-progress__fill"
              style={{ width: `${Math.min(100, Math.max(0, level.progress || 0))}%` }}
            />
          </div>
          {level.nextDistance != null ? (
            <div className="rb-level-progress__meta">
              <span>До следующего уровня</span>
              <strong className="font-tabular">{km(level.nextDistance)} KM</strong>
              <span className="rb-text-muted">Осталось {km(level.remainingDistance)} KM</span>
            </div>
          ) : (
            <p className="rb-text-muted" style={{ marginTop: 12, textAlign: 'center' }}>
              Максимальный уровень достигнут
            </p>
          )}
        </div>
      </div>

      <div className="rb-level-list">
        {(level.levels || []).map((lv) => (
          <div
            key={lv.id}
            className={`glass-card rb-level-row${lv.isCurrent ? ' rb-level-row--current' : ''}${
              lv.unlocked ? '' : ' rb-level-row--locked'
            }`}
          >
            <span className="rb-level-row__icon" style={{ color: lv.color || undefined }}>
              {lv.icon || '◆'}
            </span>
            <div className="rb-level-row__body">
              <strong>
                Level {lv.level} · {lv.name}
              </strong>
              <span className="rb-text-muted">
                {lv.maxDistance == null
                  ? `${km(lv.minDistance)}+ км`
                  : `${km(lv.minDistance)}–${km(lv.maxDistance)} км`}
              </span>
            </div>
            {lv.isCurrent ? <span className="rb-level-row__badge">Сейчас</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
