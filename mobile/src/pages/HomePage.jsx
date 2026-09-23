import { useNavigate, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import ShoeBindBanner from '../components/ShoeBindBanner';
import WorkoutDetailModal from '../components/WorkoutDetailModal';
import Icon from '../components/Icon';
import { formatWorkoutDate } from '../utils/format';
import { formatDuration } from '../services/geolocation';
import { setActiveWorkoutId } from '../services/geolocation';
import { syncActiveWorkoutWithServer } from '../services/activeWorkout';
import { getWorkoutSession } from '../services/workoutTracker';
import { fetchRewardsProgress } from '../services/rewards';
import { PageAdSlots } from '../components/MobileAdSlot';

function km(value) {
  return (Number(value) || 0).toLocaleString('ru', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function nextRewardTitle(progress) {
  const next = progress?.nextMilestone;
  if (!next) return 'Все награды открыты';
  if (typeof next === 'object') {
    return next.name || next.rewardName || `Награда за ${km(next.distance)} км`;
  }
  return `Награда за ${km(next)} км`;
}

function nextRewardDistance(progress) {
  const next = progress?.nextMilestone;
  if (!next) return null;
  if (typeof next === 'object') return Number(next.distance) || null;
  return Number(next) || null;
}

export default function HomePage({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [starting, setStarting] = useState(false);
  const [workouts, setWorkouts] = useState([]);
  const [progress, setProgress] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [activeWorkoutId, setActiveWorkoutIdState] = useState(null);

  const refreshActiveWorkout = () => {
    syncActiveWorkoutWithServer()
      .then(({ workoutId, offline }) => {
        const sessionId = getWorkoutSession()?.workoutId ?? null;
        const next = workoutId ?? sessionId;
        if (offline && next == null) return;
        setActiveWorkoutIdState(next);
      })
      .catch(() => {
        const fallback = getWorkoutSession()?.workoutId ?? null;
        if (fallback != null) setActiveWorkoutIdState(fallback);
      });
  };

  const loadHome = useCallback(async () => {
    const [history, rewardProgress] = await Promise.all([
      api('/api/workouts/history').catch(() => []),
      fetchRewardsProgress().catch(() => null),
    ]);
    setWorkouts(Array.isArray(history) ? history : []);
    if (rewardProgress) setProgress(rewardProgress);
    refreshActiveWorkout();
  }, []);

  useEffect(() => {
    loadHome().catch(() => {});
  }, [loadHome]);

  useEffect(() => {
    if (location.pathname === '/') loadHome().catch(() => {});
  }, [location.pathname, loadHome]);

  const totalDistance = Number(progress?.totalDistance ?? 0);
  const remainingDistance = Number(progress?.remainingDistance ?? 0);
  const nextDist = nextRewardDistance(progress);
  const progressPercent = useMemo(() => {
    if (!nextDist) return 100;
    return Math.max(0, Math.min(100, Math.round((totalDistance / nextDist) * 100)));
  }, [nextDist, totalDistance]);

  const claimable = useMemo(
    () =>
      (progress?.milestones || []).filter(
        (m) => m.status === 'AVAILABLE' || m.status === 'CHOOSING'
      ),
    [progress]
  );

  const lastWorkout = useMemo(() => {
    return (workouts || []).find((w) => w.status !== 'in_progress') || null;
  }, [workouts]);

  const startWorkout = async () => {
    if (starting) return;
    setStarting(true);
    try {
      if (!navigator.onLine) {
        alert('Нужно подключение к интернету');
        return;
      }
      if (!user.activeShoe || user.needsActivation) {
        alert('Привяжите кроссовки RunBonus по QR, чтобы накапливать километры.');
        navigate('/activate');
        return;
      }
      const data = await api('/api/workouts/start', { method: 'POST', body: '{}' });
      const id = data.workoutId ?? data.id;
      if (!id) throw new Error('Сервер не вернул id тренировки');
      setActiveWorkoutId(id);
      setActiveWorkoutIdState(id);
      navigate('/workout', { state: { workoutId: id } });
    } catch (err) {
      alert(err.message || 'Не удалось начать тренировку');
    } finally {
      setStarting(false);
    }
  };

  const greetingName = (user?.first_name || user?.name || '').split(' ')[0];

  return (
    <IonPage>
      <AppHeader />
      <IonContent>
        <IonRefresher
          slot="fixed"
          onIonRefresh={async (e) => {
            await loadHome().catch(() => {});
            e.detail.complete();
          }}
        >
          <IonRefresherContent />
        </IonRefresher>

        <main className="rb-main rb-home-progress">
          <ShoeBindBanner user={user} />

          <section className="rb-home-welcome">
            <p className="rb-label" style={{ margin: 0 }}>
              RunBonus
            </p>
            <h1 className="rb-headline font-display" style={{ margin: '6px 0 0' }}>
              {greetingName ? `Привет, ${greetingName}` : 'Добро пожаловать'}
            </h1>
          </section>

          {claimable.length > 0 && (
            <button
              type="button"
              className="glass-card rb-home-claim"
              onClick={() =>
                navigate(`/rewards?milestone=${claimable[0].id}`)
              }
            >
              <div className="rb-home-claim__icon" aria-hidden>
                <Icon name="redeem" filled />
              </div>
              <div className="rb-home-claim__body">
                <strong>Награда доступна</strong>
                <span>
                  {claimable[0].name || `${km(claimable[0].distance)} км`} — выберите подарок
                </span>
              </div>
              <Icon name="chevron_right" />
            </button>
          )}

          <section className="glass-card neon-glow rb-progress-hero">
            <div className="rb-progress-hero__head">
              <Icon name="directions_run" />
              <span className="rb-label">Ваш прогресс</span>
            </div>
            <div className="rb-progress-hero__distance font-display font-tabular">
              {km(totalDistance)}
              <span>км</span>
            </div>

            {nextDist != null ? (
              <>
                <p className="rb-text-muted rb-progress-hero__hint">
                  До следующей награды · {km(nextDist)} км
                </p>
                <div className="rb-progress-bar" aria-label="Прогресс до следующей награды">
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
                <div className="rb-progress-hero__foot">
                  <span>Осталось</span>
                  <strong>{km(remainingDistance)} км</strong>
                </div>
              </>
            ) : (
              <p className="rb-text-muted rb-progress-hero__hint">
                Вы достигли всех контрольных точек
              </p>
            )}
          </section>

          <section className="glass-card rb-home-next-reward">
            <div className="rb-home-next-reward__icon" aria-hidden>
              <Icon name="card_giftcard" />
            </div>
            <div className="rb-home-next-reward__body">
              <span className="rb-label">Следующая награда</span>
              <h2 className="font-display">{nextRewardTitle(progress)}</h2>
            </div>
            <button type="button" className="rb-btn-pill" onClick={() => navigate('/rewards')}>
              Подробнее
            </button>
          </section>

          <PageAdSlots
            page="home"
            user={user}
            runBonusPlacement="banner_home"
            className="rb-ad-banner--home"
            style={{ marginBottom: 24 }}
          />

          <section className="rb-home-cta">
            {activeWorkoutId ? (
              <button
                type="button"
                className="rb-btn-primary"
                onClick={() => navigate('/workout', { state: { workoutId: activeWorkoutId } })}
              >
                <Icon name="directions_run" filled style={{ fontSize: 32 }} />
                Продолжить тренировку
              </button>
            ) : (
              <button type="button" className="rb-btn-primary" disabled={starting} onClick={startWorkout}>
                <Icon name="play_arrow" filled style={{ fontSize: 32 }} />
                {starting ? 'Запуск…' : 'Начать тренировку'}
              </button>
            )}
          </section>

          <section className="rb-home-last">
            <div className="rb-section-head">
              <h2 className="rb-headline font-display">Последняя тренировка</h2>
              <button type="button" className="rb-link rb-section-head__link" onClick={() => navigate('/workouts')}>
                Все
              </button>
            </div>

            {lastWorkout ? (
              <button
                type="button"
                className="glass-card rb-activity-card"
                onClick={() => setSelectedWorkout(lastWorkout)}
              >
                <div className="rb-activity-card__icon">
                  <Icon name="directions_run" />
                </div>
                <div className="rb-activity-card__text">
                  <h3>Бег</h3>
                  <p className="rb-label rb-activity-card__meta">
                    {formatWorkoutDate(lastWorkout.started_at)}
                    {lastWorkout.distance_km != null
                      ? ` · ${Number(lastWorkout.distance_km).toFixed(2)} км`
                      : ''}
                    {lastWorkout.duration_seconds
                      ? ` · ${formatDuration(Number(lastWorkout.duration_seconds) || 0)}`
                      : ''}
                  </p>
                </div>
                <Icon name="chevron_right" />
              </button>
            ) : (
              <p className="rb-text-muted">Пока нет тренировок</p>
            )}
          </section>
        </main>
      </IonContent>
      <BottomNav />
      <WorkoutDetailModal workout={selectedWorkout} onClose={() => setSelectedWorkout(null)} />
    </IonPage>
  );
}
