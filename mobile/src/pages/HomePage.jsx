import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import ProgressRing from '../components/ProgressRing';
import StatsDetailModal from '../components/StatsDetailModal';
import WorkoutDetailModal from '../components/WorkoutDetailModal';
import BoltIcon from '../components/BoltIcon';
import Icon from '../components/Icon';
import { countFinishedWorkouts } from '../utils/workoutStats';
import { formatBalance, formatWorkoutDate } from '../utils/format';
import { setActiveWorkoutId } from '../services/geolocation';
import { syncActiveWorkoutWithServer } from '../services/activeWorkout';
import { getWorkoutSession } from '../services/workoutTracker';

function ActivityRow({ workout, onPress }) {
  const bonus = workout.calculated_bonus != null ? Number(workout.calculated_bonus) : null;
  return (
    <button type="button" className="glass-card rb-activity-card" onClick={() => onPress(workout)}>
      <div className="rb-activity-card__icon">
        <Icon name="directions_run" />
      </div>
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Тренировка</h3>
        <p className="rb-label" style={{ margin: '4px 0 0', textTransform: 'none', letterSpacing: 0 }}>
          {formatWorkoutDate(workout.started_at)}
          {workout.distance_km != null ? ` • ${Number(workout.distance_km).toFixed(1)} км` : ''}
        </p>
      </div>
      {bonus != null && bonus > 0 && (
        <div style={{ textAlign: 'right' }}>
          <span className="rb-headline font-display" style={{ color: 'var(--rb-neon)', fontSize: 20 }}>+{bonus.toFixed(0)}</span>
          <span className="rb-label" style={{ display: 'block' }}>сомони</span>
        </div>
      )}
    </button>
  );
}

export default function HomePage({ user, setUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [starting, setStarting] = useState(false);
  const [workouts, setWorkouts] = useState([]);
  const [statsModal, setStatsModal] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [activeWorkoutId, setActiveWorkoutIdState] = useState(null);

  const refreshActiveWorkout = () => {
    syncActiveWorkoutWithServer()
      .then(({ workoutId }) => {
        setActiveWorkoutIdState(workoutId ?? getWorkoutSession()?.workoutId ?? null);
      })
      .catch(() => {});
  };

  useEffect(() => {
    api('/api/workouts/history').then(setWorkouts).catch(() => {});
    refreshActiveWorkout();
  }, []);

  useEffect(() => {
    refreshActiveWorkout();
  }, [location.pathname]);

  const totalKm = workouts.reduce((s, w) => s + (Number(w.distance_km) || 0), 0);
  const totalRuns = countFinishedWorkouts(workouts);
  const kmGoal = Math.max(100, Math.ceil(totalKm / 50) * 50);
  const runsGoal = Math.max(10, Math.ceil(totalRuns / 5) * 5);

  const startWorkout = async () => {
    if (starting) return;
    setStarting(true);
    try {
      if (!navigator.onLine) {
        alert('Нужно подключение к интернету');
        return;
      }
      if (!user.activeShoe) {
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

  const refresh = async () => {
    const profile = await api('/api/auth/me');
    setUser(profile);
  };

  return (
    <IonPage>
      <AppHeader />
      <IonContent>
        <main className="rb-main">
          <section style={{ marginBottom: 32 }}>
            <div className="glass-card" style={{ padding: 'var(--rb-card-padding)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BoltIcon size="sm" glow />
                <span className="rb-label">Баланс бонусов</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span className="rb-display font-display">{formatBalance(user.balance)}</span>
                <span style={{ fontFamily: 'Space Grotesk', fontSize: 20, color: 'var(--rb-neon-dim)' }}>сомони</span>
              </div>
              <button type="button" className="rb-link" style={{ marginTop: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} onClick={refresh}>
                Обновить
              </button>
            </div>
          </section>

          <section style={{ marginBottom: 40 }}>
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

          <section style={{ marginBottom: 40 }}>
            <h2 className="rb-headline font-display" style={{ marginBottom: 24 }}>Статистика</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <button
                type="button"
                className="glass-card rb-stat-card"
                onClick={() => setStatsModal('km')}
                aria-label="Подробная статистика по километрам"
              >
                <ProgressRing value={totalKm} max={kmGoal} label="Всего км" />
              </button>
              <button
                type="button"
                className="glass-card rb-stat-card"
                onClick={() => setStatsModal('workouts')}
                aria-label="Подробная статистика по тренировкам"
              >
                <ProgressRing value={totalRuns} max={runsGoal} label="Тренировок" />
              </button>
            </div>
          </section>

          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 className="rb-headline font-display">Недавние</h2>
              <button type="button" className="rb-link" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }} onClick={() => navigate('/wallet')}>
                Все
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {workouts.slice(0, 5).map((w) => (
                <ActivityRow key={w.id} workout={w} onPress={setSelectedWorkout} />
              ))}
              {!workouts.length && <p className="rb-text-muted">Пока нет тренировок</p>}
            </div>
          </section>
        </main>
        <BottomNav />
        <StatsDetailModal type={statsModal} workouts={workouts} onClose={() => setStatsModal(null)} />
        <WorkoutDetailModal workout={selectedWorkout} onClose={() => setSelectedWorkout(null)} />
      </IonContent>
    </IonPage>
  );
}
