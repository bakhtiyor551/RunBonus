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
import { PageAdSlots } from '../components/MobileAdSlot';

export default function HomePage({ user, setUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [starting, setStarting] = useState(false);
  const [workouts, setWorkouts] = useState([]);
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
    const history = await api('/api/workouts/history').catch(() => []);
    setWorkouts(Array.isArray(history) ? history : []);
    refreshActiveWorkout();
  }, []);

  useEffect(() => {
    loadHome().catch(() => {});
  }, [loadHome]);

  useEffect(() => {
    if (location.pathname === '/') loadHome().catch(() => {});
  }, [location.pathname, location.state?.refreshHome, loadHome]);

  const finishedWorkouts = useMemo(
    () => (workouts || []).filter((w) => w.status && w.status !== 'in_progress'),
    [workouts]
  );
  const lastWorkout = finishedWorkouts[0] || null;

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
