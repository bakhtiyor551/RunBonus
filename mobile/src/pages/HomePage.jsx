import { useNavigate, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import { api, cacheUser } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import WorkoutDetailModal from '../components/WorkoutDetailModal';
import Icon from '../components/Icon';
import { formatWorkoutDate } from '../utils/format';
import { formatDuration } from '../services/geolocation';
import { setActiveWorkoutId } from '../services/geolocation';
import { syncActiveWorkoutWithServer } from '../services/activeWorkout';
import { getWorkoutSession } from '../services/workoutTracker';
import { fetchChallengeState, startChallenge } from '../services/challenges';
import { PageAdSlots } from '../components/MobileAdSlot';

const CHALLENGE_CACHE_KEY = 'rb_home_challenge';
const FINISHED_FLAG_KEY = 'rb_has_finished_workout';

function readCachedChallenge() {
  try {
    const raw = localStorage.getItem(CHALLENGE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cacheChallenge(challenge) {
  try {
    if (challenge) localStorage.setItem(CHALLENGE_CACHE_KEY, JSON.stringify(challenge));
  } catch {
    /* ignore */
  }
}

function km(value) {
  return (Number(value) || 0).toLocaleString('ru', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function HomePage({ user, setUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [starting, setStarting] = useState(false);
  const [workouts, setWorkouts] = useState([]);
  const [challengeState, setChallengeState] = useState(null);
  const [cachedChallenge, setCachedChallenge] = useState(() => readCachedChallenge());
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
    const [history, challenges] = await Promise.all([
      api('/api/workouts/history').catch(() => []),
      fetchChallengeState().catch(() => null),
    ]);
    const list = Array.isArray(history) ? history : [];
    setWorkouts(list);
    const finished = list.filter((w) => w.status && w.status !== 'in_progress');
    if (finished.length) {
      try {
        localStorage.setItem(FINISHED_FLAG_KEY, '1');
      } catch {
        /* ignore */
      }
    }

    let state = challenges;
    // После первой тренировки, если задания ещё нет — стартуем автоматически
    if (finished.length > 0 && state && !state.challenge && state.nextLevel?.canStart) {
      try {
        state = await startChallenge(state.nextLevel.levelId);
      } catch {
        /* ignore */
      }
    }
    if (finished.length > 0 && !state?.challenge) {
      try {
        state = await startChallenge();
      } catch {
        /* ignore */
      }
    }

    if (state) {
      setChallengeState(state);
      if (state.challenge) {
        cacheChallenge(state.challenge);
        setCachedChallenge(state.challenge);
      }
    }
    refreshActiveWorkout();
  }, []);

  useEffect(() => {
    loadHome().catch(() => {});
  }, [loadHome]);

  useEffect(() => {
    if (location.pathname === '/') loadHome().catch(() => {});
  }, [location.pathname, location.state?.refreshHome, loadHome]);

  // Подхват задания с экрана результата тренировки
  useEffect(() => {
    const fromResult = location.state?.challenge;
    if (fromResult) {
      cacheChallenge(fromResult);
      setCachedChallenge(fromResult);
      setChallengeState((prev) => ({ ...(prev || {}), challenge: fromResult }));
    }
  }, [location.state?.challenge]);

  const challenge = challengeState?.challenge || cachedChallenge;

  const finishedWorkouts = useMemo(
    () => (workouts || []).filter((w) => w.status && w.status !== 'in_progress'),
    [workouts]
  );
  const lastWorkout = finishedWorkouts[0] || null;
  const hasFinishedFlag =
    finishedWorkouts.length > 0 ||
    (typeof localStorage !== 'undefined' && localStorage.getItem(FINISHED_FLAG_KEY) === '1');
  // Карточка после первой завершённой тренировки (или если задание уже есть в кэше)
  const showChallengeCard = Boolean(challenge && hasFinishedFlag);

  const startWorkout = async () => {
    if (starting) return;
    setStarting(true);
    try {
      if (!navigator.onLine) {
        alert('Нужно подключение к интернету');
        return;
      }
      // После доставки заказа профиль мог устареть — обновим перед стартом
      let profile = user;
      try {
        profile = await api('/api/auth/me');
        cacheUser(profile);
        setUser?.(profile);
      } catch {
        /* use cached user */
      }
      if (!profile?.activeShoe || profile?.needsActivation) {
        alert('Кроссовки ещё не активированы. После статуса «Доставлен» тренировки откроются автоматически.');
        navigate('/orders');
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
          <section className="rb-home-welcome">
            <p className="rb-label" style={{ margin: 0 }}>
              RunBonus
            </p>
            <h1 className="rb-headline font-display" style={{ margin: '6px 0 0' }}>
              {greetingName ? `Привет, ${greetingName}!` : 'Добро пожаловать!'}
            </h1>
          </section>

          {showChallengeCard && challenge?.status === 'COMPLETED' && !challenge.rewardClaimed && (
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

          {showChallengeCard && challenge?.status === 'EXPIRED' && (
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

          {showChallengeCard && challenge?.status === 'ACTIVE' && (
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
