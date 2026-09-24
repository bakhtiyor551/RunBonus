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
import { fetchChallengeState, startChallenge } from '../services/challenges';
import { PageAdSlots } from '../components/MobileAdSlot';

function km(value) {
  return (Number(value) || 0).toLocaleString('ru', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function HomePage({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [starting, setStarting] = useState(false);
  const [workouts, setWorkouts] = useState([]);
  const [challengeState, setChallengeState] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [activeWorkoutId, setActiveWorkoutIdState] = useState(null);
  const [challengeBusy, setChallengeBusy] = useState(false);

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
    const [history, challenges] = await Promise.all([
      api('/api/workouts/history').catch(() => []),
      fetchChallengeState().catch(() => null),
    ]);
    setWorkouts(Array.isArray(history) ? history : []);
    if (challenges) setChallengeState(challenges);
    refreshActiveWorkout();
  }, []);

  useEffect(() => {
    loadHome().catch(() => {});
  }, [loadHome]);

  useEffect(() => {
    if (location.pathname === '/') loadHome().catch(() => {});
  }, [location.pathname, loadHome]);

  const challenge = challengeState?.challenge;
  const nextLevel = challengeState?.nextLevel;

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

  const onStartChallenge = async (levelId) => {
    setChallengeBusy(true);
    try {
      const data = await startChallenge(levelId);
      setChallengeState(data);
      navigate('/rewards');
    } catch (err) {
      alert(err.message || 'Не удалось начать задание');
    } finally {
      setChallengeBusy(false);
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
              {greetingName ? `Привет, ${greetingName}!` : 'Добро пожаловать!'}
            </h1>
          </section>

          {challenge?.status === 'COMPLETED' && !challenge.rewardClaimed && (
            <button type="button" className="glass-card rb-home-claim" onClick={() => navigate('/rewards')}>
              <div className="rb-home-claim__icon" aria-hidden>
                <Icon name="redeem" filled />
              </div>
              <div className="rb-home-claim__body">
                <strong>Задание выполнено!</strong>
                <span>
                  {km(challenge.currentKm)} / {km(challenge.targetKm)} KM — заберите награду
                </span>
              </div>
              <Icon name="chevron_right" />
            </button>
          )}

          {challenge?.status === 'EXPIRED' && (
            <button type="button" className="glass-card rb-home-claim" onClick={() => navigate('/rewards')}>
              <div className="rb-home-claim__icon" aria-hidden>
                <Icon name="timer_off" filled />
              </div>
              <div className="rb-home-claim__body">
                <strong>Время истекло</strong>
                <span>
                  {km(challenge.currentKm)} / {km(challenge.targetKm)} KM — начать заново
                </span>
              </div>
              <Icon name="chevron_right" />
            </button>
          )}

          {challenge?.status === 'ACTIVE' && (
            <section className="glass-card neon-glow rb-progress-hero">
              <div className="rb-progress-hero__head">
                <Icon name="flag" />
                <span className="rb-label">{challenge.name}</span>
              </div>
              <div className="rb-progress-hero__distance font-display font-tabular">
                <span className="rb-progress-hero__value">{km(challenge.currentKm)}</span>
                <span className="rb-progress-hero__unit">/ {km(challenge.targetKm)} км</span>
              </div>
              <div className="rb-progress-bar" aria-label="Прогресс задания">
                <span style={{ width: `${challenge.progressPercent}%` }} />
              </div>
              <div className="rb-progress-hero__row" style={{ marginTop: 12 }}>
                <span>Осталось</span>
                <strong>{challenge.remaining?.label || '—'}</strong>
              </div>
              <button type="button" className="rb-btn-pill rb-btn-pill--sm" style={{ marginTop: 12 }} onClick={() => navigate('/rewards')}>
                Подробнее
              </button>
            </section>
          )}

          {!challenge && nextLevel && (
            <section className="glass-card" style={{ padding: 20 }}>
              <span className="rb-label">🔓 Следующее задание</span>
              <h2 className="font-display" style={{ margin: '8px 0' }}>
                🎯 {km(nextLevel.targetKm)} KM
              </h2>
              <p className="rb-text-muted" style={{ margin: 0 }}>
                ⏱️ {nextLevel.deadlineDays} дней
                {nextLevel.exampleReward ? ` · 🎁 ${nextLevel.exampleReward}` : ''}
              </p>
              <button
                type="button"
                className="rb-btn-primary"
                style={{ width: '100%', marginTop: 16 }}
                disabled={challengeBusy}
                onClick={() => onStartChallenge(nextLevel.levelId)}
              >
                {challengeBusy ? 'Старт…' : 'Начать задание'}
              </button>
            </section>
          )}

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
