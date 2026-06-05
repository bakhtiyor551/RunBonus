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
  getCurrentPosition,
} from '../services/geolocation';
import {
  startWorkoutSession,
  stopWorkoutSession,
  getWorkoutPoints,
  subscribeWorkoutSession,
} from '../services/workoutTracker';
import { syncActiveWorkoutWithServer } from '../services/activeWorkout';
import { PageAdSlots } from '../components/MobileAdSlot';

/** 0–5 км зелёный, 5–10 оранжевый, 10+ красный */
function workoutDistanceTier(km) {
  if (km >= 10) return 'red';
  if (km >= 5) return 'orange';
  return 'green';
}

export default function WorkoutPage({ user, setUser }) {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [workoutId, setWorkoutId] = useState(null);
  const [syncing, setSyncing] = useState(true);
  const [live, setLive] = useState({
    distance: 0,
    seconds: 0,
    gpsReady: false,
    gpsError: '',
  });
  const [result, setResult] = useState(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const localHint = state?.workoutId ?? getActiveWorkoutId();
        const sync = await syncActiveWorkoutWithServer();
        if (cancelled) return;

        if (!sync.workoutId) {
          if (sync.offline && localHint) {
            setWorkoutId(Number(localHint));
            setActiveWorkoutId(Number(localHint));
            await startWorkoutSession(Number(localHint), api);
            return;
          }
          if (sync.stale && localHint) {
            alert(
              'Сохранённая тренировка на сервере не найдена (уже завершена). Начните новую с главной.'
            );
          }
          navigate('/', { replace: true });
          return;
        }

        if (sync.stale && localHint && Number(localHint) !== sync.workoutId) {
          alert('Подключена актуальная тренировка с сервера.');
        }

        setWorkoutId(sync.workoutId);
        setActiveWorkoutId(sync.workoutId);
        await startWorkoutSession(sync.workoutId, api, { startedAt: sync.startedAt });
      } catch (e) {
        if (!cancelled) {
          alert(e.message || 'Не удалось открыть тренировку');
          navigate('/', { replace: true });
        }
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, state?.workoutId]);

  useEffect(() => {
    if (syncing || !workoutId) return undefined;
    return subscribeWorkoutSession(setLive);
  }, [syncing, workoutId]);

  const minimizeOrHome = () => {
    if (Capacitor.isNativePlatform()) {
      App.minimizeApp();
    } else {
      navigate('/');
    }
  };

  const samplePoints = (pts, max = 120) => {
    if (pts.length <= max) return pts;
    const step = Math.ceil(pts.length / max);
    return pts.filter((_, i) => i % step === 0);
  };

  const finish = async () => {
    if (finishing || !workoutId) return;
    setFinishing(true);

    const snapDistance = live.distance;
    const snapSeconds = live.seconds;

    let points = filterTrackPoints(getWorkoutPoints());
    if (points.length < 2) {
      try {
        const pos = await getCurrentPosition();
        points = filterTrackPoints([...getWorkoutPoints(), pos]);
      } catch {
        /* завершим с тем, что есть */
      }
    }
    points = samplePoints(points);

    try {
      const data = await api(`/api/workouts/${workoutId}/finish`, {
        method: 'POST',
        body: JSON.stringify({
          points,
          distance_km: snapDistance,
          duration_seconds: snapSeconds,
        }),
      });
      stopWorkoutSession();
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
      if (err.code === 'DEVICE_MISMATCH') {
        setFinishing(false);
        return;
      }
      if (
        err.status === 404 ||
        err.code === 'WORKOUT_NOT_ACTIVE' ||
        err.message?.includes('уже завершена') ||
        err.message?.includes('не найдена')
      ) {
        stopWorkoutSession();
        clearWorkoutLocal(workoutId);
        setActiveWorkoutId(null);
        const sync = await syncActiveWorkoutWithServer();
        alert(
          sync.workoutId
            ? 'Эта тренировка недоступна. На главной откройте текущую активную тренировку.'
            : 'Тренировка не найдена. Начните новую с главной.'
        );
        navigate('/', { replace: true });
        return;
      }
      const msg =
        err.code === 'DEVICE_REQUIRED'
          ? 'Обновите приложение RunBonus и повторите вход.'
          : err.message;
      alert(msg);
      setFinishing(false);
      startWorkoutSession(workoutId, api).catch(() => {});
    }
  };

  if (syncing || !workoutId) {
    return (
      <IonPage>
        <AppHeader showAvatar={false} />
        <IonContent>
          <main className="rb-main" style={{ paddingTop: 48, textAlign: 'center' }}>
            <p className="rb-text-muted">Синхронизация тренировки…</p>
          </main>
        </IonContent>
      </IonPage>
    );
  }

  if (result) {
    return (
      <IonPage>
        <AppHeader showAvatar={false} />
        <IonContent>
          <main className="rb-main" style={{ paddingTop: 48 }}>
            <CelebrateBlock result={result} />
            <ResultCards result={result} />
            <PageAdSlots
              key={`workout-ads-${result.workout_id ?? result.id ?? 'done'}`}
              page="workout"
              user={user}
              runBonusPlacement="banner_workout"
              className="rb-ad-banner--workout"
              style={{ marginTop: 24 }}
            />
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

  const distanceTier = workoutDistanceTier(live.distance);
  const heroClass =
    distanceTier === 'red'
      ? 'rb-workout-hero rb-workout-hero--red'
      : distanceTier === 'orange'
        ? 'rb-workout-hero rb-workout-hero--orange'
        : 'rb-workout-hero';

  return (
    <IonPage>
      <AppHeader showAvatar={false} badge={liveBadge} onBack={minimizeOrHome} />
      <IonContent>
        <div className="rb-atmosphere">
          <div className="rb-atmosphere__blob" style={{ top: '20%', left: '10%', width: 300, height: 300 }} />
          <div className="rb-atmosphere__blob" style={{ bottom: '20%', right: '10%', width: 300, height: 300 }} />
        </div>
        <main
          className="rb-main"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '70vh',
            paddingBottom: 40,
          }}
        >
          <div className={heroClass}>
            <div className="workout-pulse-ring" />
            <div className="workout-pulse-ring workout-pulse-ring--inner" />
            <div className="rb-workout-runner-core">
              <Icon name="directions_run" filled className="rb-workout-runner-icon" />
            </div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div className="rb-display font-display font-tabular" style={{ fontSize: 48, color: '#fff' }}>
              {formatDuration(live.seconds)}
            </div>
            <p className="rb-label" style={{ marginTop: 8 }}>
              Время
            </p>
          </div>

          <div
            className="glass-panel"
            style={{ width: '100%', padding: 'var(--rb-card-padding)', textAlign: 'center', marginBottom: 24 }}
          >
            <DistanceBlock distance={live.distance} tier={distanceTier} />
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
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          background: 'var(--rb-neon)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          boxShadow: '0 0 20px rgba(195,244,0,0.3)',
        }}
      >
        <Icon name="check_circle" style={{ fontSize: 48, color: 'var(--rb-on-neon)' }} />
      </div>
      <h1 className="font-display" style={{ fontSize: 32, color: 'var(--rb-neon)', textTransform: 'uppercase', margin: 0 }}>
        {result.title || 'Тренировка завершена!'}
      </h1>
      {result.level_up?.message && (
        <p
          className="rb-headline"
          style={{
            marginTop: 16,
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(195,244,0,0.12)',
            color: 'var(--rb-neon)',
          }}
        >
          {result.level_up.message}
        </p>
      )}
      <p className="rb-text-muted" style={{ marginTop: 8 }}>
        Отличный результат
      </p>
    </div>
  );
}

function ResultCards({ result }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div className="glass-card" style={{ gridColumn: '1 / -1', padding: 'var(--rb-card-padding)', textAlign: 'center' }}>
        <span className="rb-label">Дистанция</span>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
          <span className="rb-display font-display" style={{ fontSize: 40 }}>
            {Number(result.distance_km).toFixed(1)}
          </span>
          <span className="rb-headline">км</span>
        </div>
      </div>
      <div
        className="glass-card"
        style={{
          gridColumn: '1 / -1',
          padding: 'var(--rb-card-padding)',
          textAlign: 'center',
          borderColor: 'rgba(195,244,0,0.3)',
        }}
      >
        <span className="rb-label">Бонус</span>
        {result.bonus_credited ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 8 }}>
            <Icon name="stars" filled style={{ fontSize: 36, color: 'var(--rb-neon)' }} />
            <span className="rb-display font-display" style={{ fontSize: 40 }}>
              +{Number(result.bonus_earned).toFixed(1)}
            </span>
          </div>
        ) : (
          <p className="rb-text-muted" style={{ marginTop: 8 }}>
            {result.reject_reason || result.message || 'Бонус не начислен'}
          </p>
        )}
      </div>
    </div>
  );
}

function DistanceBlock({ distance, tier = 'green' }) {
  const tierClass = tier === 'red' ? 'rb-workout-distance--red' : tier === 'orange' ? 'rb-workout-distance--orange' : '';
  return (
    <div className={tierClass}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
        <span className="rb-display font-display" style={{ fontSize: 40, color: tier === 'green' ? 'var(--rb-neon)' : undefined }}>
          {distance.toFixed(2)}
        </span>
        <span className="rb-headline" style={{ color: 'var(--rb-on-surface-variant)' }}>
          км
        </span>
      </div>
      <p className="rb-label" style={{ marginTop: 8 }}>
        Текущая дистанция
      </p>
    </div>
  );
}
