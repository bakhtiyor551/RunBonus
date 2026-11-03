import { useEffect, useMemo, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import WorkoutDetailModal from '../components/WorkoutDetailModal';
import Icon from '../components/Icon';
import { formatWorkoutDate } from '../utils/format';
import { formatDuration } from '../services/geolocation';
import { formatDistance, formatSpeed, getDistanceUnits } from '../services/units';
import { formatWorkoutStatus } from '../utils/workoutStats';

function dayLabel(iso) {
  if (!iso) return 'Тренировка';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Сегодня';
  if (sameDay(d, yesterday)) return 'Вчера';
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' });
}

function WorkoutRow({ workout, onPress, units }) {
  const km = workout.distance_km != null ? Number(workout.distance_km) : 0;
  const duration = Number(workout.duration_seconds) || 0;
  const avg = workout.avg_speed != null ? Number(workout.avg_speed) : null;
  const status = workout.status;
  return (
    <button type="button" className="glass-card rb-activity-card" onClick={() => onPress(workout)}>
      <div className="rb-activity-card__icon">
        <Icon name="directions_run" />
      </div>
      <div className="rb-activity-card__text">
        <div className="rb-activity-card__title-row">
          <h3>{dayLabel(workout.started_at)}</h3>
          <span className={`rb-progress-status rb-progress-status--${status === 'approved' ? 'delivered' : status === 'rejected' || status === 'rejected_no_fund' ? 'cancelled' : 'processing'}`}>
            {formatWorkoutStatus(status)}
          </span>
        </div>
        <p className="rb-label rb-activity-card__meta">
          {formatWorkoutDate(workout.started_at)}
          {km > 0 ? ` · ${formatDistance(km, units)}` : ''}
          {duration > 0 ? ` · ${formatDuration(duration)}` : ''}
          {avg != null && avg > 0 ? ` · ${formatSpeed(avg, units)}` : ''}
        </p>
      </div>
      <Icon name="chevron_right" />
    </button>
  );
}

export default function WorkoutHistoryPage() {
  const [workouts, setWorkouts] = useState([]);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [loading, setLoading] = useState(true);
  const units = getDistanceUnits();

  const load = async () => {
    const rows = await api('/api/workouts/history');
    setWorkouts((rows || []).filter((w) => w.status !== 'in_progress'));
  };

  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => workouts, [workouts]);

  return (
    <IonPage>
      <AppHeader showAvatar={false} />
      <IonContent>
        <IonRefresher
          slot="fixed"
          onIonRefresh={async (e) => {
            await load().catch(() => {});
            e.detail.complete();
          }}
        >
          <IonRefresherContent />
        </IonRefresher>
        <main className="rb-main rb-workouts-page">
          <header className="rb-workouts-page__head">
            <h1 className="rb-headline font-display">Тренировки</h1>
            <p className="rb-text-muted">Дистанция, время и статус проверки</p>
          </header>
          <div className="rb-workouts-list">
            {grouped.map((w) => (
              <WorkoutRow key={w.id} workout={w} onPress={setSelectedWorkout} units={units} />
            ))}
            {!loading && !workouts.length && (
              <section className="glass-card rb-progress-empty">
                <Icon name="directions_run" />
                <p>Пока нет завершённых тренировок. Начните бег с главной — километры появятся здесь.</p>
              </section>
            )}
            {loading && <p className="rb-text-muted">Загрузка…</p>}
          </div>
        </main>
      </IonContent>
      <BottomNav />
      <WorkoutDetailModal workout={selectedWorkout} onClose={() => setSelectedWorkout(null)} />
    </IonPage>
  );
}
