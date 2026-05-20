import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import ProgressRing from '../components/ProgressRing';
import Icon from '../components/Icon';
import { formatBalance, formatWorkoutDate } from '../utils/format';
import { getActiveWorkoutId, setActiveWorkoutId } from '../services/geolocation';
import { getWorkoutSession } from '../services/workoutTracker';

function ActivityRow({ workout }) {
  const bonus = workout.calculated_bonus != null ? Number(workout.calculated_bonus) : null;
  return (
    <div className="glass-card rb-activity-card">
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
    </div>
  );
}

export default function HomePage({ user, setUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [starting, setStarting] = useState(false);
  const [workouts, setWorkouts] = useState([]);
  const [activeWorkoutId, setActiveWorkoutIdState] = useState(() => getActiveWorkoutId());

  useEffect(() => {
    api('/api/workouts/history').then(setWorkouts).catch(() => {});
  }, []);

  useEffect(() => {
    setActiveWorkoutIdState(getActiveWorkoutId() || getWorkoutSession()?.workoutId || null);
  }, [location.pathname]);

  const totalKm = workouts.reduce((s, w) => s + (Number(w.distance_km) || 0), 0);
  const totalRuns = workouts.filter((w) => w.status === 'approved' || w.finished_at).length;
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
              <span className="rb-label">Баланс бонусов</span>
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
              <div className="glass-card" style={{ padding: 'var(--rb-gutter)' }}>
                <ProgressRing value={totalKm} max={kmGoal} label="Всего км" />
              </div>
              <div className="glass-card" style={{ padding: 'var(--rb-gutter)' }}>
                <ProgressRing value={totalRuns} max={runsGoal} label="Тренировок" />
              </div>
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
                <ActivityRow key={w.id} workout={w} />
              ))}
              {!workouts.length && <p className="rb-text-muted">Пока нет тренировок</p>}
            </div>
          </section>
        </main>
        <BottomNav />
      </IonContent>
    </IonPage>
  );
}
