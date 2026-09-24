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
  flushAllPendingPoints,
  clearWorkoutGpsBuffer,
  freezeWorkoutForFinish,
  getWorkoutFinishSnapshot,
  subscribeWorkoutCommands,
} from '../services/workoutTracker';
import { disconnectWorkoutSocket } from '../services/workoutSocket';
import { syncActiveWorkoutWithServer } from '../services/activeWorkout';
import { ensureWorkoutLiveActivity } from '../services/liveActivity';
import { getDistanceUnits, formatDistance, formatSpeed } from '../services/units';
import { PageAdSlots } from '../components/MobileAdSlot';
import { fetchChallengeState, startChallenge } from '../services/challenges';

function kmLabel(value) {
  return (Number(value) || 0).toLocaleString('ru', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function WorkoutPage({ user, setUser }) {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [workoutId, setWorkoutId] = useState(null);
  const [syncing, setSyncing] = useState(true);
  const [units] = useState(() => getDistanceUnits());
  const [challenge, setChallenge] = useState(null);
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

  useEffect(() => {
    if (!workoutId) return;
    let cancelled = false;
    fetchChallengeState()
      .then((data) => {
        if (cancelled) return;
        setChallenge(data?.challenge || null);
      })
      .catch(() => {
        if (!cancelled) setChallenge(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workoutId]);

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

  const samplePoints = (pts, max = 120) => {
    if (pts.length <= max) return pts;
    const step = Math.ceil(pts.length / max);
    return pts.filter((_, i) => i % step === 0);
  };

  const finish = async () => {
    if (finishing || !workoutId) return;
    setFinishing(true);
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
      if (data.challenge_completed || data.challenge?.status === 'COMPLETED') {
        navigate('/rewards', { replace: true });
        return;
      }
      if (data.rewards_unlocked?.length || data.reward_popup) {
        const first = data.reward_popup || data.rewards_unlocked[0];
        const milestoneId =
          first?.milestoneId || first?.milestone_id || first?.id;
        navigate(milestoneId ? `/milestones?milestone=${milestoneId}` : '/milestones', { replace: true });
        return;
      }
      // Обновим задание для карточки на главной после первой тренировки
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
          setChallenge(challengeForHome);
        }
      } catch {
        /* ignore */
      }
      data.challenge = challengeForHome;
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
    return (
      <IonPage>
        <AppHeader showAvatar={false} />
        <IonContent>
          <main className="rb-main rb-workout-result">
            <CelebrateBlock result={result} units={units} />
            <ResultCards result={result} units={units} />
            {(result.challenge || challenge)?.status === 'ACTIVE' && (
              <section className="rb-workout-challenge glass-card neon-glow" style={{ marginTop: 20 }}>
                <div className="rb-workout-challenge__head">
                  <Icon name="flag" filled />
                  <div>
                    <span className="rb-label">Ваше задание</span>
                    <strong className="font-display">
                      {(result.challenge || challenge).name}
                    </strong>
                  </div>
                </div>
                <div className="rb-workout-challenge__km font-display font-tabular">
                  <span className="rb-workout-challenge__value">
                    {kmLabel((result.challenge || challenge).currentKm)}
                  </span>
                  <span className="rb-workout-challenge__unit">
                    / {kmLabel((result.challenge || challenge).targetKm)} км
                  </span>
                </div>
                <div className="rb-progress-bar" aria-label="Прогресс задания">
                  <span
                    style={{
                      width: `${(result.challenge || challenge).progressPercent || 0}%`,
                    }}
                  />
                </div>
                <div className="rb-workout-challenge__meta">
                  <span>Осталось времени</span>
                  <strong>{(result.challenge || challenge).remaining?.label || '—'}</strong>
                </div>
              </section>
            )}
            <PageAdSlots
              key={`workout-ads-${result.workout_id ?? result.id ?? 'done'}`}
              page="workout"
              user={user}
              runBonusPlacement="banner_workout"
              className="rb-ad-banner--workout"
              style={{ marginTop: 24 }}
            />
            <button
              type="button"
              className="rb-btn-pill"
              style={{ width: '100%', marginTop: 32 }}
              onClick={() =>
                navigate('/', {
                  replace: true,
                  state: {
                    refreshHome: Date.now(),
                    challenge: result.challenge || challenge || null,
                  },
                })
              }
            >
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
      <span>
        {live.autoPaused ? 'Автопауза' : live.manualPaused ? 'Пауза' : 'Активна'}
      </span>
    </div>
  );

  return (
    <IonPage className="rb-workout-screen">
      <AppHeader showAvatar={false} badge={liveBadge} onBack={minimizeOrHome} />
      <IonContent fullscreen>
        <div className="rb-workout-layout">
          <section className="rb-workout-layout__map">
            <WorkoutMap points={live.points} livePosition={live.livePosition} interactive />
          </section>

          <main className={`rb-workout-layout__panel${live.autoPaused ? ' rb-workout-layout__panel--auto-paused' : ''}`}>
            {challenge?.status === 'ACTIVE' && (
              <section className="rb-workout-challenge glass-card neon-glow">
                <div className="rb-workout-challenge__head">
                  <Icon name="flag" filled />
                  <div>
                    <span className="rb-label">Активное задание</span>
                    <strong className="font-display">{challenge.name}</strong>
                  </div>
                </div>
                <div className="rb-workout-challenge__km font-display font-tabular">
                  <span className="rb-workout-challenge__value">
                    {kmLabel(Number(challenge.currentKm || 0) + Number(live.distance || 0))}
                  </span>
                  <span className="rb-workout-challenge__unit">
                    / {kmLabel(challenge.targetKm)} км
                  </span>
                </div>
                <div className="rb-progress-bar" aria-label="Прогресс задания">
                  <span
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          ((Number(challenge.currentKm || 0) + Number(live.distance || 0)) /
                            Math.max(Number(challenge.targetKm) || 1, 0.001)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
                <div className="rb-workout-challenge__meta">
                  <span>Осталось времени</span>
                  <strong>{challenge.remaining?.label || '—'}</strong>
                </div>
              </section>
            )}

            <div className={`rb-workout-dashboard${live.pauseSeconds > 0 ? '' : ' rb-workout-dashboard--no-pause'}`}>
              <MetricCard
                icon="timer"
                label="Время"
                value={formatDuration(live.seconds)}
                area="timer"
                accent="neon"
                hero
              />
              <MetricCard
                icon="straighten"
                label="Дистанция"
                value={formatDistance(live.distance, units)}
                area="dist"
                accent="cyan"
              />
              <MetricCard
                icon="speed"
                label="Скорость"
                value={formatSpeed(live.currentSpeed, units)}
                area="speed"
                accent="neon"
              />
              <MetricCard
                icon="directions_walk"
                label="Шаги"
                value={String(live.steps)}
                area="steps"
                accent="violet"
              />
              <MetricCard
                icon="trending_flat"
                label="Средняя"
                value={formatSpeed(live.avgSpeed, units)}
                area="avg"
                accent="blue"
                compact
              />
              <MetricCard
                icon="bolt"
                label="Макс."
                value={formatSpeed(live.maxSpeed, units)}
                area="max"
                accent="orange"
                compact
              />
              {live.pauseSeconds > 0 && (
                <MetricCard
                  icon="pause_circle"
                  label="Пауза"
                  value={formatDuration(live.pauseSeconds)}
                  area="pause"
                  accent="amber"
                  compact
                />
              )}
            </div>

            {(live.gpsError || !live.gpsReady) && (
              <div className="rb-workout-status">
                {live.gpsError && <p className="rb-text-error">{live.gpsError}</p>}
                {!live.gpsReady && !live.gpsError && (
                  <p className="rb-workout-status__gps">
                    <Icon name="my_location" />
                    Ожидание сигнала GPS…
                  </p>
                )}
              </div>
            )}

            <p className="rb-workout-hint">
              <Icon name="info" />
              «Назад» сворачивает приложение — тренировка продолжается в фоне.
            </p>

            <div className="rb-workout-controls">
              <button
                type="button"
                className={`rb-workout-controls__pause${live.autoPaused ? ' rb-workout-controls__pause--auto' : ''}`}
                onClick={toggleWorkoutPause}
                disabled={finishing || live.autoPaused}
              >
                <Icon name={live.manualPaused ? 'play_arrow' : live.autoPaused ? 'motion_sensor_active' : 'pause'} filled />
                {live.autoPaused ? 'Автопауза' : live.manualPaused ? 'Продолжить' : 'Пауза'}
              </button>
              <HoldToStopButton
                onStop={finish}
                disabled={finishing}
                label={finishing ? 'Завершение…' : 'Удерживайте для остановки'}
              />
            </div>
          </main>
        </div>
      </IonContent>
    </IonPage>
  );
}

function MetricCard({ icon, label, value, area, accent = 'neon', hero = false, compact = false }) {
  return (
    <div
      className={[
        'rb-workout-metric',
        'glass-card',
        `rb-workout-metric--${accent}`,
        hero ? 'rb-workout-metric--hero' : '',
        compact ? 'rb-workout-metric--compact' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ gridArea: area }}
    >
      <div className="rb-workout-metric__icon" aria-hidden>
        <Icon name={icon} filled={hero} />
      </div>
      <div className="rb-workout-metric__body">
        <span className="rb-workout-metric__value font-display font-tabular">{value}</span>
        <span className="rb-workout-metric__label">{label}</span>
      </div>
    </div>
  );
}

function CelebrateBlock({ result, units }) {
  return (
    <div className="rb-celebrate rb-celebrate--result">
      <div className="rb-celebrate__icon">
        <Icon name="check_circle" />
      </div>
      <h1 className="rb-celebrate__title font-display">
        {result.title || 'Тренировка завершена!'}
      </h1>
      <p className="rb-celebrate__summary">
        {formatDistance(result.distance_km, units)} · {formatDuration(Number(result.duration_seconds) || 0)}
      </p>
    </div>
  );
}

function ResultCards({ result, units }) {
  const approved = result.status === 'approved';
  const pending = !result.status || result.status === 'pending' || result.status === 'processing';
  const checkLabel = approved
    ? 'Засчитано'
    : pending
      ? 'Обрабатывается'
      : result.reject_reason || result.message || 'Не засчитано';
  const durationSec = Number(result.duration_seconds) || 0;
  const avgSpeed =
    durationSec > 0 && result.distance_km != null
      ? (Number(result.distance_km) / durationSec) * 3600
      : null;

  return (
    <div className="rb-workout-result-cards">
      <div className="rb-workout-metric glass-card rb-workout-metric--cyan rb-workout-result-card">
        <div className="rb-workout-metric__icon" aria-hidden>
          <Icon name="straighten" />
        </div>
        <div className="rb-workout-metric__body">
          <span className="rb-workout-metric__value font-display font-tabular">
            {formatDistance(result.distance_km, units)}
          </span>
          <span className="rb-workout-metric__label">Расстояние</span>
        </div>
      </div>

      <div className="rb-workout-metric glass-card rb-workout-metric--neon rb-workout-result-card">
        <div className="rb-workout-metric__icon" aria-hidden>
          <Icon name="timer" />
        </div>
        <div className="rb-workout-metric__body">
          <span className="rb-workout-metric__value font-display font-tabular">
            {formatDuration(durationSec)}
          </span>
          <span className="rb-workout-metric__label">Время</span>
        </div>
      </div>

      {avgSpeed != null && avgSpeed > 0 && (
        <div className="rb-workout-metric glass-card rb-workout-result-card">
          <div className="rb-workout-metric__icon" aria-hidden>
            <Icon name="speed" />
          </div>
          <div className="rb-workout-metric__body">
            <span className="rb-workout-metric__value font-display font-tabular">
              {avgSpeed.toFixed(1)}
            </span>
            <span className="rb-workout-metric__label">км/ч средняя</span>
          </div>
        </div>
      )}

      <div
        className={[
          'rb-workout-metric',
          'glass-card',
          'rb-workout-result-card',
          approved ? '' : 'rb-workout-result-card--muted',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="rb-workout-metric__icon" aria-hidden>
          <Icon name={approved ? 'verified' : 'hourglass_top'} />
        </div>
        <div className="rb-workout-metric__body">
          <span className="rb-workout-result-card__note">{checkLabel}</span>
          <span className="rb-workout-metric__label">Проверка</span>
        </div>
      </div>

      {Array.isArray(result.rewards_unlocked) && result.rewards_unlocked.length > 0 && (
        <div className="glass-card rb-workout-result-unlock">
          <div className="rb-workout-result-unlock__icon" aria-hidden>
            <Icon name="redeem" />
          </div>
          <div>
            <p className="rb-label" style={{ margin: 0 }}>Новые награды</p>
            <p className="rb-workout-result-unlock__names">
              {result.rewards_unlocked.map((r) => r.name || `${r.distance} км`).join(', ')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
