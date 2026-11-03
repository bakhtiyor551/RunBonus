import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { IonPage, IonContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import Icon from '../components/Icon';
import WorkoutMap from '../components/WorkoutMap';
import HoldToStopButton from '../components/HoldToStopButton';
import AppleMaps from '../plugins/appleMaps';
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
  flushAllPendingPoints,
  clearWorkoutGpsBuffer,
  freezeWorkoutForFinish,
  getWorkoutFinishSnapshot,
  subscribeWorkoutCommands,
} from '../services/workoutTracker';
import { disconnectWorkoutSocket } from '../services/workoutSocket';
import { syncActiveWorkoutWithServer } from '../services/activeWorkout';
import { ensureWorkoutLiveActivity } from '../services/liveActivity';
import { getDistanceUnits, formatPace } from '../services/units';
import WorkoutResultScreen from '../components/WorkoutResultScreen';
import { fetchChallengeState, startChallenge } from '../services/challenges';

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
    manualPaused: false,
    autoPaused: false,
    gpsReady: false,
    gpsError: '',
    points: [],
    livePosition: null,
  });
  const [result, setResult] = useState(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const localHint = state?.workoutId ?? getActiveWorkoutId();
      // Сразу показываем экран, если id уже известен — не ждём сеть
      if (localHint && !cancelled) {
        setWorkoutId(Number(localHint));
        setActiveWorkoutId(Number(localHint));
        setSyncing(false);
        startWorkoutSession(Number(localHint), api).catch(() => {});
      }

      try {
        const syncPromise = syncActiveWorkoutWithServer();
        const timeoutPromise = new Promise((resolve) =>
          setTimeout(() => resolve({ workoutId: null, offline: true, timedOut: true }), 3500)
        );
        const sync = await Promise.race([syncPromise, timeoutPromise]);
        if (cancelled) return;

        if (sync.timedOut) {
          // Сеть тормозит — продолжаем с локальным id
          if (!localHint) {
            const late = await syncPromise.catch(() => null);
            if (cancelled) return;
            if (late?.workoutId) {
              setWorkoutId(late.workoutId);
              setActiveWorkoutId(late.workoutId);
              await startWorkoutSession(late.workoutId, api, { startedAt: late.startedAt });
              return;
            }
            navigate('/', { replace: true });
          }
          return;
        }

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
          if (!localHint) navigate('/', { replace: true });
          return;
        }

        if (sync.stale && localHint && Number(localHint) !== sync.workoutId) {
          alert('Подключена актуальная тренировка с сервера.');
        }

        setWorkoutId(sync.workoutId);
        setActiveWorkoutId(sync.workoutId);
        await startWorkoutSession(sync.workoutId, api, { startedAt: sync.startedAt });
      } catch (e) {
        if (!cancelled && !localHint) {
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

  useEffect(() => {
    if (syncing || !workoutId) return undefined;
    return subscribeWorkoutCommands((cmd) => {
      if (cmd.type === 'fund_exhausted') {
        // Legacy signal from old money mode — ignore in rewards loyalty model
        return;
      }
      if (cmd.type === 'workout_force_stop') {
        alert(cmd.message || 'Пробежка аннулирована');
        stopWorkoutSession();
        clearWorkoutLocal(workoutId);
        clearWorkoutGpsBuffer(workoutId).catch(() => {});
        setActiveWorkoutId(null);
        navigate('/', { replace: true });
      }
    });
  }, [syncing, workoutId, navigate]);

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

  const samplePoints = (pts, max = 400) => {
    if (!pts?.length || pts.length <= max) return pts || [];
    const step = Math.ceil(pts.length / max);
    const sampled = pts.filter((_, i) => i % step === 0);
    const last = pts[pts.length - 1];
    if (sampled[sampled.length - 1] !== last) sampled.push(last);
    return sampled;
  };

  const finish = async () => {
    if (finishing || !workoutId) return;
    setFinishing(true);
    // Убрать нативную карту — чтобы ничего не блокировало UI
    if (Capacitor.getPlatform() === 'ios') {
      AppleMaps.destroy().catch(() => {});
    }
    freezeWorkoutForFinish();
    const snap = getWorkoutFinishSnapshot();

    const snapDistance = snap?.distance ?? live.distance;
    const snapSeconds = snap?.seconds ?? live.seconds;
    const snapMoving = snap?.movingSeconds ?? live.movingSeconds;
    const snapPause = snap?.pauseSeconds ?? live.pauseSeconds;
    const snapSteps = snap?.steps ?? live.steps;
    const snapMaxSpeed = snap?.maxSpeed ?? live.maxSpeed;
    const snapAvgSpeed = snap?.avgSpeed ?? live.avgSpeed;

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
      await flushAllPendingPoints();
      await disconnectWorkoutSocket();
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
      await clearWorkoutGpsBuffer(workoutId);
      setActiveWorkoutId(null);
      if (setUser) {
        try {
          const profile = await api('/api/auth/me');
          setUser(profile);
        } catch {
          /* ignore */
        }
      }

      // После первой завершённой тренировки — задание и флаг для карточки на главной
      let challengeForHome = data.challenge || null;
      try {
        localStorage.setItem('rb_has_finished_workout', '1');
        if (!challengeForHome) {
          let state = await fetchChallengeState();
          if (!state?.challenge) {
            state = await startChallenge(state?.nextLevel?.levelId);
          }
          challengeForHome = state?.challenge || null;
        }
        if (challengeForHome) {
          localStorage.setItem('rb_home_challenge', JSON.stringify(challengeForHome));
        }
      } catch {
        /* ignore */
      }
      data.challenge = challengeForHome;
      data.trackPoints = points;
      data.steps_count = snapSteps;
      data.avg_speed = snapAvgSpeed;
      data.finished_at = new Date().toISOString();

      if (data.challenge_completed || challengeForHome?.status === 'COMPLETED') {
        navigate('/rewards', { replace: true, state: { challenge: challengeForHome } });
        return;
      }
      // Первое задание показываем на экране результата / главной, не уводим сразу на milestones
      if (
        (data.rewards_unlocked?.length || data.reward_popup) &&
        challengeForHome?.status !== 'ACTIVE'
      ) {
        const first = data.reward_popup || data.rewards_unlocked[0];
        const milestoneId =
          first?.milestoneId || first?.milestone_id || first?.id;
        navigate(milestoneId ? `/milestones?milestone=${milestoneId}` : '/milestones', {
          replace: true,
          state: { challenge: challengeForHome },
        });
        return;
      }
      setResult(data);
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
        await clearWorkoutGpsBuffer(workoutId);
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
    const goHome = () =>
      navigate('/', {
        replace: true,
        state: {
          refreshHome: Date.now(),
          challenge: result.challenge || null,
        },
      });

    return (
      <IonPage className="rb-result-page">
        <IonContent fullscreen scrollY className="rb-result-content">
          <WorkoutResultScreen
            result={result}
            user={user}
            trackPoints={result.trackPoints || []}
            onDone={goHome}
          />
        </IonContent>
      </IonPage>
    );
  }

  const distKm = Number(live.distance) || 0;
  const durationSec = Number(live.seconds) || 0;
  const paceLabel =
    distKm >= 0.05 && durationSec > 0
      ? formatPace((distKm / durationSec) * 3600, units)
      : '—';

  let distanceValue = '—';
  let distanceUnit = 'км';
  if (distKm >= 0.01) {
    if (distKm < 1 && units !== 'imperial') {
      distanceValue = String(Math.round(distKm * 1000));
      distanceUnit = 'м';
    } else {
      distanceValue = distKm.toFixed(2);
      distanceUnit = units === 'imperial' ? 'ми' : 'км';
    }
  }

  const statusText = live.autoPaused
    ? 'Автопауза'
    : live.manualPaused
      ? 'Пауза'
      : live.gpsReady
        ? ''
        : 'Ожидание GPS…';

  const zoomMap = (delta) => {
    if (Capacitor.getPlatform() === 'ios') {
      AppleMaps.zoom({ delta }).catch(() => {});
      return;
    }
    window.dispatchEvent(new CustomEvent('rb-workout-map-zoom', { detail: { delta } }));
  };

  return (
    <IonPage className="rb-workout-live">
      <header className="rb-workout-live__top">
        <button
          type="button"
          className="rb-workout-live__back"
          onClick={minimizeOrHome}
          aria-label="Назад"
        >
          <Icon name="arrow_back" />
        </button>
        <div className="rb-workout-live__stats">
          <div className="rb-workout-live__stat">
            <div className="rb-workout-live__stat-value font-tabular">
              {distanceValue === '—' ? (
                <span className="rb-workout-live__dash">—</span>
              ) : (
                <>
                  {distanceValue}
                  <span className="rb-workout-live__unit">{distanceUnit}</span>
                </>
              )}
            </div>
            <div className="rb-workout-live__stat-label">Дистанция</div>
          </div>
          <div className="rb-workout-live__stat rb-workout-live__stat--center">
            <div className="rb-workout-live__stat-value rb-workout-live__stat-value--time font-tabular">
              {formatDuration(durationSec)}
            </div>
            <div className="rb-workout-live__stat-label">Время</div>
          </div>
          <div className="rb-workout-live__stat">
            <div className="rb-workout-live__stat-value font-tabular">
              {paceLabel === '—' ? <span className="rb-workout-live__dash">—</span> : paceLabel.replace(/ \/.*/, '')}
            </div>
            <div className="rb-workout-live__stat-label">Темп</div>
          </div>
        </div>
      </header>

      <div className="rb-workout-live__map">
        <WorkoutMap points={live.points} livePosition={live.livePosition} interactive />
      </div>

      {(statusText || live.gpsError) && (
        <div className="rb-workout-live__toast" role="status">
          {live.gpsError || statusText}
        </div>
      )}

      <footer className="rb-workout-live__dock">
        <div className="rb-workout-live__zoom">
          <button
            type="button"
            className="rb-workout-live__zoom-btn"
            onClick={() => zoomMap(1)}
            aria-label="Приблизить карту"
          >
            <Icon name="add" />
          </button>
          <button
            type="button"
            className="rb-workout-live__zoom-btn"
            onClick={() => zoomMap(-1)}
            aria-label="Отдалить карту"
          >
            <Icon name="remove" />
          </button>
        </div>
        <button
          type="button"
          className={`rb-workout-live__pause${live.paused ? ' is-paused' : ''}`}
          onClick={toggleWorkoutPause}
          disabled={finishing || live.autoPaused}
          aria-label={live.manualPaused ? 'Продолжить' : 'Пауза'}
        >
          <Icon name={live.manualPaused ? 'play_arrow' : 'pause'} filled />
        </button>
        <HoldToStopButton
          variant="fab"
          onStop={finish}
          disabled={finishing}
          label={finishing ? 'Завершение…' : 'Удерживайте для завершения'}
        />
      </footer>
    </IonPage>
  );
}

