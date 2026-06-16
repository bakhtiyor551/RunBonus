import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import WorkoutDetailModal from '../components/WorkoutDetailModal';
import Icon from '../components/Icon';
import { formatWorkoutDate } from '../utils/format';
import { formatDuration } from '../services/geolocation';
import { formatDistance, getDistanceUnits } from '../services/units';

function WorkoutRow({ workout, onPress, units }) {
  const km = workout.distance_km != null ? Number(workout.distance_km) : 0;
  const duration = Number(workout.duration_seconds) || 0;
  return (
    <button type="button" className="glass-card rb-activity-card" onClick={() => onPress(workout)}>
      <div className="rb-activity-card__icon">
        <Icon name="directions_run" />
      </div>
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Тренировка</h3>
        <p className="rb-label" style={{ margin: '4px 0 0', textTransform: 'none', letterSpacing: 0 }}>
          {formatWorkoutDate(workout.started_at)}
          {km > 0 ? ` · ${formatDistance(km, units)}` : ''}
          {duration > 0 ? ` · ${formatDuration(duration)}` : ''}
        </p>
      </div>
      <Icon name="chevron_right" />
    </button>
  );
}

export default function WorkoutHistoryPage() {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState([]);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [loading, setLoading] = useState(true);
  const units = getDistanceUnits();

  useEffect(() => {
    api('/api/workouts/history')
      .then((rows) => setWorkouts(rows.filter((w) => w.status !== 'in_progress')))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <IonPage>
      <AppHeader onBack={() => navigate(-1)} showAvatar={false} />
      <IonContent>
        <main className="rb-main">
          <h2 className="rb-headline font-display" style={{ marginBottom: 8 }}>
            История тренировок
          </h2>
          <p className="rb-text-muted" style={{ marginBottom: 24 }}>
            Все завершённые сессии с маршрутом и метриками
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {workouts.map((w) => (
              <WorkoutRow key={w.id} workout={w} onPress={setSelectedWorkout} units={units} />
            ))}
            {!loading && !workouts.length && <p className="rb-text-muted">Пока нет завершённых тренировок</p>}
            {loading && <p className="rb-text-muted">Загрузка…</p>}
          </div>
        </main>
      </IonContent>
      <BottomNav />
      <WorkoutDetailModal workout={selectedWorkout} onClose={() => setSelectedWorkout(null)} />
    </IonPage>
  );
}
