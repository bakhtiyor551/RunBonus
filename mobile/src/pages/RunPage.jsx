import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import ShoeBindBanner from '../components/ShoeBindBanner';
import Icon from '../components/Icon';
import { syncActiveWorkoutWithServer } from '../services/activeWorkout';
import { getWorkoutSession } from '../services/workoutTracker';
import { setActiveWorkoutId } from '../services/geolocation';

export default function RunPage({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [starting, setStarting] = useState(false);
  const [activeWorkoutId, setActiveWorkoutIdState] = useState(null);
  const canEarn = user?.activeShoe && !user?.needsActivation;

  const refreshActiveWorkout = () => {
    syncActiveWorkoutWithServer()
      .then(({ workoutId }) => {
        setActiveWorkoutIdState(workoutId ?? getWorkoutSession()?.workoutId ?? null);
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshActiveWorkout();
  }, [location.pathname]);

  const startWorkout = async () => {
    if (starting) return;
    if (!canEarn) {
      alert('Привяжите кроссовки RunBonus по QR, чтобы получать бонусы за бег.');
      navigate('/activate');
      return;
    }
    setStarting(true);
    try {
      if (!navigator.onLine) {
        alert('Нужно подключение к интернету');
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

  return (
    <IonPage>
      <AppHeader />
      <IonContent>
        <main className="rb-main">
          <h1 className="rb-headline font-display" style={{ marginBottom: 24 }}>
            Бег
          </h1>

          <ShoeBindBanner user={user} />

          <section style={{ marginBottom: 24 }}>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button type="button" className="glass-card rb-activity-card" onClick={() => navigate('/history')}>
              <div className="rb-activity-card__icon">
                <Icon name="history" />
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>История тренировок</h3>
                <p className="rb-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  Все пробежки и начисления
                </p>
              </div>
              <Icon name="chevron_right" />
            </button>
            <button type="button" className="glass-card rb-activity-card" onClick={() => navigate('/level')}>
              <div className="rb-activity-card__icon">
                <Icon name="military_tech" />
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Уровень и тарифы</h3>
                <p className="rb-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  Бонусы за километры по уровню
                </p>
              </div>
              <Icon name="chevron_right" />
            </button>
          </div>
        </main>
        <BottomNav />
      </IonContent>
    </IonPage>
  );
}
