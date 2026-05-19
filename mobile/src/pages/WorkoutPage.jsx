import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton,
} from '@ionic/react';
import { api } from '../api';
import {
  startBackgroundTracking,
  haversineKm,
  formatDuration,
  saveWorkoutLocal,
  loadWorkoutLocal,
  clearWorkoutLocal,
} from '../services/geolocation';

const SYNC_INTERVAL_MS = 7000;

export default function WorkoutPage({ user, setUser }) {
  const { state } = useLocation();
  const navigate = useNavigate();
  const workoutId = state?.workoutId;
  const pointsRef = useRef([]);
  const [distance, setDistance] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState(null);
  const [finishing, setFinishing] = useState(false);
  const timerRef = useRef(null);
  const syncRef = useRef(null);
  const stopGpsRef = useRef(null);
  const secondsRef = useRef(0);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    if (!workoutId) {
      navigate('/');
      return;
    }

    const saved = loadWorkoutLocal(workoutId);
    if (saved?.points?.length) {
      pointsRef.current = saved.points;
      setDistance(haversineKm(saved.points));
      if (saved.startedAt) startedAtRef.current = saved.startedAt;
      if (saved.seconds) {
        secondsRef.current = saved.seconds;
        setSeconds(saved.seconds);
      }
    }

    timerRef.current = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      persistLocal();
    }, 1000);

    const onPosition = (pos) => {
      const last = pointsRef.current[pointsRef.current.length - 1];
      if (
        last &&
        Math.abs(last.latitude - pos.latitude) < 0.00001 &&
        Math.abs(last.longitude - pos.longitude) < 0.00001
      ) {
        return;
      }
      pointsRef.current = [...pointsRef.current, pos];
      const dist = haversineKm(pointsRef.current);
      setDistance(dist);
      persistLocal(pointsRef.current);
    };

    stopGpsRef.current = startBackgroundTracking(onPosition);

    syncRef.current = setInterval(() => {
      flushPointsToServer();
    }, SYNC_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        flushPointsToServer();
      } else {
        persistLocal();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(timerRef.current);
      clearInterval(syncRef.current);
      stopGpsRef.current?.();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [workoutId, navigate]);

  const persistLocal = (pts) => {
    saveWorkoutLocal(workoutId, {
      points: pts ?? pointsRef.current,
      startedAt: startedAtRef.current,
      seconds: secondsRef.current,
    });
  };

  const flushPointsToServer = async () => {
    if (!pointsRef.current.length || !navigator.onLine) return;
    const last = pointsRef.current[pointsRef.current.length - 1];
    try {
      await api(`/api/workouts/${workoutId}/points`, {
        method: 'POST',
        body: JSON.stringify(last),
      });
    } catch {
      /* offline — отправим при завершении */
    }
  };

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    clearInterval(timerRef.current);
    clearInterval(syncRef.current);
    stopGpsRef.current?.();

    try {
      const data = await api(`/api/workouts/${workoutId}/finish`, {
        method: 'POST',
        body: JSON.stringify({ points: pointsRef.current }),
      });
      clearWorkoutLocal(workoutId);
      setResult(data);
      if (setUser && data.balance_after != null) {
        setUser({ ...user, balance: data.balance_after });
      } else if (setUser) {
        const profile = await api('/api/auth/me');
        setUser(profile);
      }
    } catch (err) {
      alert(err.message);
      setFinishing(false);
    }
  };

  if (result) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar color="primary">
            <IonTitle>Результат</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding workout-result">
          <h2>{result.title || 'Тренировка завершена'}</h2>
          <p className="stat">Расстояние: <strong>{Number(result.distance_km).toFixed(1)} км</strong></p>
          {result.bonus_credited ? (
            <p className="stat bonus">Начислено: <strong>{Number(result.bonus_earned).toFixed(1)} сомони</strong></p>
          ) : (
            <p className="stat muted">{result.message || 'Бонус не начислен по правилам программы'}</p>
          )}
          <IonButton expand="block" className="ion-margin-top" onClick={() => navigate('/')}>
            На главную
          </IonButton>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>Тренировка</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding workout-active">
        <p className="status-label">Тренировка идёт</p>
        <p className="stat">Время: <strong>{formatDuration(seconds)}</strong></p>
        <p className="stat">Расстояние: <strong>{distance.toFixed(1)} км</strong></p>
        <p className="hint">Можно свернуть приложение — GPS продолжит работать</p>
        <IonButton
          expand="block"
          color="danger"
          size="large"
          className="ion-margin-top"
          disabled={finishing}
          onClick={finish}
        >
          {finishing ? 'Завершение…' : 'Завершить'}
        </IonButton>
      </IonContent>
    </IonPage>
  );
}
