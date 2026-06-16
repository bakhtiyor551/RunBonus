import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { IonPage, IonContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import Icon from '../components/Icon';
import WorkoutMap from '../components/WorkoutMap';
import HoldToStopButton from '../components/HoldToStopButton';
import { api } from '../api';
import {
  clearWorkoutLocal,
  setActiveWorkoutId,
  getActiveWorkoutId,
  filterTrackPoints,
  getCurrentPosition,
  formatDuration,
} from '../services/geolocation';
import {
  startWorkoutSession,
  stopWorkoutSession,
  getWorkoutPoints,
  subscribeWorkoutSession,
  toggleWorkoutPause,
} from '../services/workoutTracker';
import { syncActiveWorkoutWithServer } from '../services/activeWorkout';
import { ensureWorkoutLiveActivity } from '../services/liveActivity';
import { getDistanceUnits, formatDistance, formatSpeed } from '../services/units';
import { PageAdSlots } from '../components/MobileAdSlot';

export default function WorkoutPage({ user, setUser }) {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [workoutId, setWorkoutId] = useState(null);
  const [syncing, setSyncing] = useState(true);
  const [units] = useState(() => getDistanceUnits());
  const [live, setLive] = useState({
    distance: 0,
    seconds: 0,
    movingSeconds: 0,
    pauseSeconds: 0,
    currentSpeed: 0,
    maxSpeed: 0,
    avgSpeed: 0,
    steps: 0,
    paused: false,
    gpsReady: false,
    gpsError: '',
    points: [],
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

  const minimizeOrHome = async () => {
    if (Capacitor.isNativePlatform()) {
      await ensureWorkoutLiveActivity({
        seconds: live.seconds,
        distance: live.distance,
        currentSpeed: live.currentSpeed,
        steps: live.steps,
        paused: live.paused,
      }).catch(() => {});
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
    const snapMoving = live.movingSeconds;
    const snapPause = live.pauseSeconds;
    const snapSteps = live.steps;
    const snapMaxSpeed = live.maxSpeed;
    const snapAvgSpeed = live.avgSpeed;

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
          moving_seconds: snapMoving,
          pause_seconds: snapPause,
          steps_count: snapSteps,
          max_speed: snapMaxSpeed,
          avg_speed: snapAvgSpeed,
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
          <main className="rb-main rb-workout-result">
            <CelebrateBlock result={result} units={units} />
            <ResultCards result={result} units={units} />
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
    <div className={`rb-badge-live ${live.paused ? 'rb-badge-live--paused' : ''}`}>
      <span className="rb-badge-live__dot" />
      <span>{live.paused ? 'Пауза' : 'Активна'}</span>
    </div>
  );

  return (
    <IonPage className="rb-workout-screen">
      <AppHeader showAvatar={false} badge={liveBadge} onBack={minimizeOrHome} />
      <IonContent fullscreen>
        <div className="rb-workout-layout">
          <section className="rb-workout-layout__map">
            <WorkoutMap points={live.points} interactive />
          </section>

          <main className="rb-workout-layout__panel">
            <div className="rb-workout-metrics">
              <MetricBlock label="Время" value={formatDuration(live.seconds)} large />
              <MetricBlock label="Дистанция" value={formatDistance(live.distance, units)} />
              <MetricBlock label="Скорость" value={formatSpeed(live.currentSpeed, units)} />
              <MetricBlock label="Шаги" value={String(live.steps)} />
            </div>

            <div className="rb-workout-metrics rb-workout-metrics--secondary">
              <MetricBlock label="Средняя" value={formatSpeed(live.avgSpeed, units)} compact />
              <MetricBlock label="Макс." value={formatSpeed(live.maxSpeed, units)} compact />
              {live.pauseSeconds > 0 && (
                <MetricBlock label="Пауза" value={formatDuration(live.pauseSeconds)} compact />
              )}
            </div>

            {live.gpsError && <p className="rb-text-error">{live.gpsError}</p>}
            {!live.gpsReady && !live.gpsError && <p className="rb-text-muted">Подключение GPS…</p>}

            <p className="rb-text-muted rb-workout-hint">
              «Назад» сворачивает приложение — тренировка продолжается в фоне.
            </p>

            <div className="rb-workout-controls">
              <button
                type="button"
                className="rb-btn-outline rb-workout-controls__pause"
                onClick={toggleWorkoutPause}
                disabled={finishing}
              >
                <Icon name={live.paused ? 'play_arrow' : 'pause'} filled />
                {live.paused ? 'Продолжить' : 'Пауза'}
              </button>
              <HoldToStopButton onStop={finish} disabled={finishing} />
            </div>
          </main>
        </div>
      </IonContent>
    </IonPage>
  );
}

function MetricBlock({ label, value, large = false, compact = false }) {
  return (
    <div className={`rb-workout-metric ${large ? 'rb-workout-metric--large' : ''} ${compact ? 'rb-workout-metric--compact' : ''}`}>
      <span className="rb-workout-metric__value font-display font-tabular">{value}</span>
      <span className="rb-label">{label}</span>
    </div>
  );
}

function CelebrateBlock({ result, units }) {
  return (
    <div className="rb-celebrate" style={{ textAlign: 'center', marginBottom: 32 }}>
      <div className="rb-celebrate__icon">
        <Icon name="check_circle" style={{ fontSize: 48, color: 'var(--rb-on-neon)' }} />
      </div>
      <h1 className="font-display" style={{ fontSize: 32, color: 'var(--rb-neon)', textTransform: 'uppercase', margin: 0 }}>
        {result.title || 'Тренировка завершена!'}
      </h1>
      {result.level_up?.message && (
        <p className="rb-headline rb-celebrate__levelup">{result.level_up.message}</p>
      )}
      <p className="rb-text-muted" style={{ marginTop: 8 }}>
        {formatDistance(result.distance_km, units)} · {formatDuration(Number(result.duration_seconds) || 0)}
      </p>
    </div>
  );
}

function ResultCards({ result, units }) {
  return (
    <div className="rb-workout-result-grid">
      <div className="glass-card rb-workout-result-grid__wide">
        <span className="rb-label">Дистанция</span>
        <div className="rb-workout-result-grid__hero font-display">{formatDistance(result.distance_km, units)}</div>
      </div>
      <div className="glass-card">
        <span className="rb-label">Бонус</span>
        {result.bonus_credited ? (
          <div className="rb-workout-result-grid__bonus">
            <Icon name="stars" filled />
            <span className="font-display">+{Number(result.bonus_earned).toFixed(1)}</span>
          </div>
        ) : (
          <p className="rb-text-muted">{result.reject_reason || result.message || 'Бонус не начислен'}</p>
        )}
      </div>
    </div>
  );
}
