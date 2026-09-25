import { useNavigate, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import { api, cacheUser } from '../api';
import BottomNav from '../components/BottomNav';
import WorkoutDetailModal from '../components/WorkoutDetailModal';
import Icon from '../components/Icon';
import { setActiveWorkoutId } from '../services/geolocation';
import { syncActiveWorkoutWithServer } from '../services/activeWorkout';
import { getWorkoutSession } from '../services/workoutTracker';
import { fetchChallengeState, startChallenge } from '../services/challenges';
import { getDeviceId } from '../services/deviceId';

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

function kmNum(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('ru', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function HomePage({ user, setUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [starting, setStarting] = useState(false);
  const [workouts, setWorkouts] = useState([]);
  const [challenge, setChallenge] = useState(() => readCachedChallenge());
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

    if (state?.challenge) {
      cacheChallenge(state.challenge);
      setChallenge(state.challenge);
    }
    refreshActiveWorkout();
  }, []);

  useEffect(() => {
    loadHome().catch(() => {});
  }, [loadHome]);

  useEffect(() => {
    if (location.pathname === '/') loadHome().catch(() => {});
  }, [location.pathname, location.state?.refreshHome, loadHome]);

  useEffect(() => {
    const fromResult = location.state?.challenge;
    if (fromResult) {
      cacheChallenge(fromResult);
      setChallenge(fromResult);
      try {
        localStorage.setItem(FINISHED_FLAG_KEY, '1');
      } catch {
        /* ignore */
      }
    }
  }, [location.state?.challenge]);

  const finishedWorkouts = useMemo(
    () => (workouts || []).filter((w) => w.status && w.status !== 'in_progress'),
    [workouts]
  );
  const lastWorkout = finishedWorkouts[0] || null;
  const hasFinished =
    finishedWorkouts.length > 0 ||
    (typeof localStorage !== 'undefined' && localStorage.getItem(FINISHED_FLAG_KEY) === '1') ||
    Boolean(location.state?.challenge);
  const showProgress =
    hasFinished &&
    challenge &&
    ['ACTIVE', 'COMPLETED', 'EXPIRED'].includes(challenge.status);

  const totalKm = useMemo(
    () => finishedWorkouts.reduce((sum, w) => sum + (Number(w.distance_km) || 0), 0),
    [finishedWorkouts]
  );
  const heroKm =
    showProgress && challenge?.currentKm != null
      ? Number(challenge.currentKm)
      : lastWorkout?.distance_km != null
        ? Number(lastWorkout.distance_km)
        : totalKm;

  const shoesLocked = !user?.activeShoe || user?.needsActivation;

  const startWorkout = async () => {
    if (starting) return;
    if (shoesLocked) {
      navigate('/orders');
      return;
    }
    setStarting(true);
    try {
      if (!navigator.onLine) {
        alert('Нужно подключение к интернету');
        return;
      }
      let profile = user;
      try {
        profile = await api('/api/auth/me');
        cacheUser(profile);
        setUser?.(profile);
      } catch {
        /* use cached user */
      }
      if (!profile?.activeShoe || profile?.needsActivation) {
        alert(
          '🔒 Тренировки недоступны\n\nДля начала тренировки необходимо активировать RunBonus-кроссовки.'
        );
        navigate('/orders');
        return;
      }
      const data = await api('/api/workouts/start', {
        method: 'POST',
        body: JSON.stringify({
          shoeId: profile.activeShoe?.id ?? profile.activeShoeId,
          deviceId: getDeviceId(),
        }),
      });
      const id = data.workoutId ?? data.id;
      if (!id) throw new Error('Сервер не вернул id тренировки');
      setActiveWorkoutId(id);
      setActiveWorkoutIdState(id);
      navigate('/workout', { state: { workoutId: id } });
    } catch (err) {
      if (err.code === 'ACTIVE_WORKOUT_EXISTS' || err.status === 409) {
        const id = err.workoutId ?? err.data?.workoutId ?? err.data?.id;
        if (id) {
          setActiveWorkoutId(id);
          setActiveWorkoutIdState(id);
          navigate('/workout', { state: { workoutId: id } });
          return;
        }
      }
      alert(err.message || 'Не удалось начать тренировку');
    } finally {
      setStarting(false);
    }
  };

  const onPrimary = () => {
    if (activeWorkoutId) {
      navigate('/workout', { state: { workoutId: activeWorkoutId } });
      return;
    }
    startWorkout();
  };

  return (
    <IonPage className="rb-home-exercise-page">
      <IonContent fullscreen scrollY={false} className="rb-home-exercise-content">
        <IonRefresher
          slot="fixed"
          onIonRefresh={async (e) => {
            await loadHome().catch(() => {});
            e.detail.complete();
          }}
        >
          <IonRefresherContent />
        </IonRefresher>

        <div className="rb-home-exercise">
          <div className="rb-home-exercise__bg" aria-hidden>
            <div className="rb-home-exercise__grid" />
            <div className="rb-home-exercise__glow" />
            <div className="rb-home-exercise__route" />
          </div>

          <div className="rb-home-exercise__ui">
            <header className="rb-home-exercise__head">
              <h1 className="rb-home-exercise__title font-display">Exercise</h1>
              <button
                type="button"
                className="rb-home-exercise__bonus"
                onClick={() => navigate('/rewards')}
              >
                <Icon name="star" filled />
                BONUS
              </button>
            </header>

            <div className="rb-home-exercise__tabs" role="tablist">
              <button type="button" role="tab" aria-selected className="rb-home-exercise__tab is-active">
                Exercise
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={false}
                className="rb-home-exercise__tab"
                onClick={() => navigate('/rewards')}
              >
                Training
              </button>
            </div>
            <div className="rb-home-exercise__rule" />

            <div className="rb-home-exercise__metric">
              <span className="rb-home-exercise__value font-display font-tabular">
                {kmNum(heroKm)}
              </span>
              <span className="rb-home-exercise__accent-line" aria-hidden />
              <span className="rb-home-exercise__unit">KM</span>
              {shoesLocked && !activeWorkoutId ? (
                <div className="rb-home-exercise__lock">
                  <p className="rb-home-exercise__lock-title">🔒 Тренировки недоступны</p>
                  <p className="rb-home-exercise__lock-text">
                    Для начала тренировки необходимо активировать RunBonus-кроссовки.
                  </p>
                  <button
                    type="button"
                    className="rb-home-exercise__lock-cta"
                    onClick={() => navigate('/orders')}
                  >
                    МОИ КРОССОВКИ
                  </button>
                </div>
              ) : showProgress ? (
                <button
                  type="button"
                  className="rb-home-exercise__progress-link"
                  onClick={() => navigate('/rewards')}
                >
                  {kmNum(challenge.currentKm)} / {kmNum(challenge.targetKm)} ·{' '}
                  {challenge.remaining?.label || challenge.name}
                </button>
              ) : (
                <p className="rb-home-exercise__metric-hint">
                  {activeWorkoutId
                    ? 'Тренировка идёт'
                    : lastWorkout
                      ? 'Последняя тренировка'
                      : 'Нажмите ▶ чтобы начать'}
                </p>
              )}
            </div>

            <div className="rb-home-exercise__fabs">
              <button
                type="button"
                className="rb-home-exercise__fab"
                onClick={() => navigate('/profile')}
                aria-label="Настройки"
              >
                <Icon name="settings" />
              </button>

              <button
                type="button"
                className="rb-home-exercise__fab rb-home-exercise__fab--primary"
                disabled={starting}
                onClick={onPrimary}
                aria-label={activeWorkoutId ? 'Продолжить' : 'Начать тренировку'}
              >
                {starting ? (
                  <Icon name="hourglass_empty" />
                ) : activeWorkoutId ? (
                  <Icon name="play_arrow" filled />
                ) : (
                  <span className="rb-home-exercise__fab-mark" aria-hidden>
                    <span className="rb-home-exercise__fab-dots">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="rb-home-exercise__fab-inf">∞</span>
                  </span>
                )}
              </button>

              <button
                type="button"
                className="rb-home-exercise__fab"
                onClick={() =>
                  lastWorkout ? setSelectedWorkout(lastWorkout) : navigate('/workouts')
                }
                aria-label="История"
              >
                <Icon name="description" />
              </button>
            </div>
          </div>
        </div>
      </IonContent>
      <BottomNav />
      <WorkoutDetailModal workout={selectedWorkout} onClose={() => setSelectedWorkout(null)} />
    </IonPage>
  );
}
