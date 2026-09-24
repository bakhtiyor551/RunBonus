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
    // После первой тренировки задание стартует само — карточка прогресса на главной
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
  const showProgressCard = Boolean(
    hasFinished &&
      challenge &&
      ['ACTIVE', 'COMPLETED', 'EXPIRED'].includes(challenge.status)
  );

  const startWorkout = async () => {
    if (starting) return;
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
        alert('Кроссовки ещё не активированы. После статуса «Доставлен» тренировки откроются автоматически.');
        navigate('/shop');
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

          {showProgressCard && (
            <section
              className="rb-workout-challenge glass-card neon-glow"
              style={{ marginBottom: 20 }}
              role="button"
              tabIndex={0}
              onClick={() => navigate('/rewards')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate('/rewards');
                }
              }}
            >
              <div className="rb-workout-challenge__head">
                <Icon name="flag" filled />
                <div>
                  <span className="rb-label">
                    {challenge.status === 'COMPLETED'
                      ? 'Задание выполнено'
                      : challenge.status === 'EXPIRED'
                        ? 'Время истекло'
                        : 'Ваше задание'}
                  </span>
                  <strong className="font-display">{challenge.name}</strong>
                </div>
              </div>
              <div className="rb-workout-challenge__km font-display font-tabular">
                <span className="rb-workout-challenge__value">{km(challenge.currentKm)}</span>
                <span className="rb-workout-challenge__unit">/ {km(challenge.targetKm)} км</span>
              </div>
              <div className="rb-progress-bar" aria-label="Прогресс задания">
                <span
                  style={{
                    width: `${Math.min(100, Math.max(0, Number(challenge.progressPercent) || 0))}%`,
                  }}
                />
              </div>
              <div className="rb-workout-challenge__meta">
                <span>
                  {challenge.status === 'COMPLETED'
                    ? 'Награда'
                    : challenge.status === 'EXPIRED'
                      ? 'Статус'
                      : 'Осталось времени'}
                </span>
                <strong>
                  {challenge.status === 'COMPLETED'
                    ? challenge.exampleReward || 'Заберите награду'
                    : challenge.status === 'EXPIRED'
                      ? 'Начать заново'
                      : challenge.remaining?.label || '—'}
                </strong>
              </div>
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
