import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { IonPage, IonContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import Icon from '../components/Icon';
import { api } from '../api';
import {
  formatDuration,
  clearWorkoutLocal,
  setActiveWorkoutId,
  getActiveWorkoutId,
  filterTrackPoints,
} from '../services/geolocation';
import {
  startWorkoutSession,
  stopWorkoutSession,
  getWorkoutPoints,
  subscribeWorkoutSession,
} from '../services/workoutTracker';

export default function WorkoutPage({ user, setUser }) {
  const { state } = useLocation();
  const navigate = useNavigate();
  const workoutId = state?.workoutId ?? getActiveWorkoutId();
  const [live, setLive] = useState({
    distance: 0,
    seconds: 0,
    gpsReady: false,
    gpsError: '',
  });
  const [result, setResult] = useState(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!workoutId) {
      navigate('/');
      return;
    }
    setActiveWorkoutId(workoutId);
    startWorkoutSession(workoutId, api).catch(() => {});
    return subscribeWorkoutSession(setLive);
  }, [workoutId, navigate]);

  const minimizeOrHome = () => {
    if (Capacitor.isNativePlatform()) {
      App.minimizeApp();
    } else {
      navigate('/');
    }
  };

  const finish = async () => {
    if (finishing || !workoutId) return;
    setFinishing(true);
    const points = filterTrackPoints(getWorkoutPoints());
    stopWorkoutSession();

    try {
      const data = await api(`/api/workouts/${workoutId}/finish`, {
        method: 'POST',
        body: JSON.stringify({ points }),
      });
      clearWorkoutLocal(workoutId);
      setActiveWorkoutId(null);
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
      startWorkoutSession(workoutId, api).catch(() => {});
    }
  };

  if (result) {
    return (
      <IonPage>
        <AppHeader showAvatar={false} />
        <IonContent>
          <main className="rb-main" style={{ paddingTop: 48 }}>
            <CelebrateBlock result={result} />
            <ResultCards result={result} />
            <button type="button" className="rb-btn-pill" style={{ width: '100%', marginTop: 32 }} onClick={() => navigate('/')}>
              Готово
              <Icon name="arrow_forward" />
            </button>
          </main>
        </IonContent>
      </IonPage>
    );
  }

  const liveBadge = (
    <div className="rb-badge-live">
      <span className="rb-badge-live__dot" />
      <span>Активна</span>
    </div>
  );

  return (
    <IonPage>
      <AppHeader
        showAvatar={false}
        badge={liveBadge}
        onBack={minimizeOrHome}
      />
      <IonContent>
        <div className="rb-atmosphere">
          <div className="rb-atmosphere__blob" style={{ top: '20%', left: '10%', width: 300, height: 300 }} />
          <div className="rb-atmosphere__blob" style={{ bottom: '20%', right: '10%', width: 300, height: 300 }} />
        </div>
        <main className="rb-main" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', paddingBottom: 40 }}>
          <div style={{ position: 'relative', width: 256, height: 256, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 48 }}>
            <div className="workout-pulse-ring" />
            <div className="workout-pulse-ring workout-pulse-ring--inner" style={{ position: 'absolute' }} />
            <div style={{ zIndex: 10, background: 'var(--rb-surface-container-lowest)', padding: 24, borderRadius: '50%', border: '1px solid rgba(195,244,0,0.3)', boxShadow: '0 0 30px rgba(171,214,0,0.15)' }}>
              <Icon name="directions_run" filled style={{ fontSize: 56, color: 'var(--rb-neon)' }} />
            </div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div className="rb-display font-display font-tabular" style={{ fontSize: 48, color: '#fff' }}>
              {formatDuration(live.seconds)}
            </div>
            <p className="rb-label" style={{ marginTop: 8 }}>Время</p>
          </div>

          <div className="glass-panel" style={{ width: '100%', padding: 'var(--rb-card-padding)', textAlign: 'center', marginBottom: 24 }}>
            <DistanceBlock distance={live.distance} />
          </div>

          {live.gpsError && <p className="rb-text-error">{live.gpsError}</p>}
          {!live.gpsReady && !live.gpsError && <p className="rb-text-muted">Подключение GPS…</p>}
          <p className="rb-text-muted" style={{ textAlign: 'center', marginBottom: 8, fontSize: 12 }}>
            Дистанция считается только при реальном движении (дрейф GPS на месте отфильтрован).
          </p>
          <p className="rb-text-muted" style={{ textAlign: 'center', marginBottom: 24, fontSize: 12 }}>
            «Назад» сворачивает приложение — тренировка продолжается. Остановка — «Завершить тренировку».
          </p>

          <button type="button" className="rb-btn-pill" style={{ width: '100%' }} disabled={finishing} onClick={finish}>
            <Icon name="stop_circle" filled />
            {finishing ? 'Завершение…' : 'Завершить тренировку'}
          </button>
        </main>
      </IonContent>
    </IonPage>
  );
}

function CelebrateBlock({ result }) {
  return (
    <div className="rb-celebrate" style={{ textAlign: 'center', marginBottom: 32 }}>
      <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--rb-neon)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 0 20px rgba(195,244,0,0.3)' }}>
        <Icon name="check_circle" style={{ fontSize: 48, color: 'var(--rb-on-neon)' }} />
      </div>
      <h1 className="font-display" style={{ fontSize: 32, color: 'var(--rb-neon)', textTransform: 'uppercase', margin: 0 }}>
        {result.title || 'Тренировка завершена!'}
      </h1>
      <p className="rb-text-muted" style={{ marginTop: 8 }}>Отличный результат</p>
    </div>
  );
}

function ResultCards({ result }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div className="glass-card" style={{ gridColumn: '1 / -1', padding: 'var(--rb-card-padding)', textAlign: 'center' }}>
        <span className="rb-label">Дистанция</span>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
          <span className="rb-display font-display" style={{ fontSize: 40 }}>{Number(result.distance_km).toFixed(1)}</span>
          <span className="rb-headline">км</span>
        </div>
      </div>
      <div className="glass-card" style={{ gridColumn: '1 / -1', padding: 'var(--rb-card-padding)', textAlign: 'center', borderColor: 'rgba(195,244,0,0.3)' }}>
        <span className="rb-label">Бонус</span>
        {result.bonus_credited ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 8 }}>
            <Icon name="stars" filled style={{ fontSize: 36, color: 'var(--rb-neon)' }} />
            <span className="rb-display font-display" style={{ fontSize: 40 }}>+{Number(result.bonus_earned).toFixed(1)}</span>
          </div>
        ) : (
          <p className="rb-text-muted" style={{ marginTop: 8 }}>{result.message || 'Бонус не начислен'}</p>
        )}
      </div>
    </div>
  );
}

function DistanceBlock({ distance }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
        <span className="rb-display font-display" style={{ fontSize: 40 }}>{distance.toFixed(2)}</span>
        <span className="rb-headline" style={{ color: 'var(--rb-on-surface-variant)' }}>км</span>
      </div>
      <p className="rb-label" style={{ marginTop: 8 }}>Текущая дистанция</p>
    </>
  );
}
