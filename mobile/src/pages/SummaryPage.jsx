import { useNavigate, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import { api, cacheUser } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import ActivityRings from '../components/summary/ActivityRings';
import WeeklyChart from '../components/summary/WeeklyChart';
import LevelSection from '../components/level/LevelSection';
import { formatBalance } from '../utils/format';
import { resolveAvatarUrl } from '../utils/avatar';
import { fetchUserSummary } from '../services/summary';
import {
  startDailyStepsPolling,
  stopDailyStepsPolling,
  subscribeDailySteps,
} from '../services/dailySteps';

function formatHeaderDate() {
  const now = new Date();
  const date = now.toLocaleDateString('ru', { day: 'numeric', month: 'long' });
  return `Сегодня, ${date}`;
}

function TodayMetricCard({ icon, label, value, unit }) {
  return (
    <div className="glass-card rb-summary-metric">
      <Icon name={icon} />
      <span className="rb-label">{label}</span>
      <strong className="rb-summary-metric__value font-display font-tabular">{value}</strong>
      {unit && <span className="rb-text-muted rb-summary-metric__unit">{unit}</span>}
    </div>
  );
}

function GoalRow({ goal }) {
  const pct = Math.min(100, goal.percent ?? 0);
  return (
    <div className="rb-summary-goal">
      <div className="rb-summary-goal__head">
        <span>{goal.label}</span>
        <span className="rb-text-muted">
          {goal.current}
          {goal.unit === 'km' ? ' км' : goal.unit === 'min' ? ' мин' : goal.unit === 'bonus' ? ' с.' : ''}
          {' / '}
          {goal.target}
          {goal.unit === 'km' ? ' км' : goal.unit === 'min' ? ' мин' : goal.unit === 'bonus' ? ' с.' : ''}
        </span>
      </div>
      <div className="rb-summary-goal__bar">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RecordRow({ label, value }) {
  return (
    <div className="rb-summary-record">
      <span className="rb-text-muted">{label}</span>
      <strong className="font-display">{value}</strong>
    </div>
  );
}

export default function SummaryPage({ user, setUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [levelData, setLevelData] = useState(null);
  const [levelHistory, setLevelHistory] = useState([]);
  const [levelLoading, setLevelLoading] = useState(true);
  const [deviceSteps, setDeviceSteps] = useState(0);

  const displayName = summary?.profile?.name || user.name || 'Пользователь';
  const avatarUrl = resolveAvatarUrl(summary?.profile?.avatar_url || user.avatar_url);
  const todaySteps = Math.max(deviceSteps, summary?.today?.steps ?? 0);

  const loadSummary = useCallback(async () => {
    const data = await fetchUserSummary();
    if (deviceSteps > (data?.today?.steps ?? 0)) {
      data.today = { ...data.today, steps: deviceSteps };
      if (data.rings) {
        const activeMin = data.today.active_minutes ?? 0;
        const dist = data.today.distance ?? 0;
        const calories = Math.round(Math.max(dist * 60, activeMin * 5, deviceSteps * 0.04));
        data.today.calories = calories;
        if (data.rings.move) {
          const g = data.rings.move.goal || 600;
          data.rings.move.current = calories;
          data.rings.move.percent = Math.min(100, Math.round((calories / g) * 100));
        }
      }
    }
    setSummary(data);
    return data;
  }, [deviceSteps]);

  const loadLevel = useCallback(async () => {
    setLevelLoading(true);
    try {
      const [level, hist] = await Promise.all([
        api('/api/me/level'),
        api('/api/me/level-history'),
      ]);
      setLevelData(level);
      setLevelHistory(hist);
    } catch {
      setLevelData(null);
      setLevelHistory([]);
    } finally {
      setLevelLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [profile] = await Promise.all([
        api('/api/auth/me').catch(() => null),
        loadSummary(),
        loadLevel(),
      ]);
      if (profile) {
        cacheUser(profile);
        setUser(profile);
      }
    } catch {
      /* offline */
    }
  }, [loadSummary, loadLevel, setUser]);

  useEffect(() => {
    setLoading(true);
    refreshAll().finally(() => setLoading(false));
    startDailyStepsPolling();
    const unsub = subscribeDailySteps(setDeviceSteps);
    return () => {
      unsub();
      stopDailyStepsPolling();
    };
  }, []);

  useEffect(() => {
    if (location.pathname === '/summary') {
      refreshAll();
    }
  }, [location.pathname, refreshAll]);

  useEffect(() => {
    if (!loading && deviceSteps > 0) loadSummary().catch(() => {});
  }, [deviceSteps, loading, loadSummary]);

  const records = summary?.personal_records;

  return (
    <IonPage>
      <AppHeader
        showAvatar={false}
        badge={(
          <button type="button" className="rb-header__avatar" aria-label="Уведомления" onClick={() => navigate('/profile')}>
            <Icon name="notifications" />
          </button>
        )}
      />
      <IonContent>
        <IonRefresher
          slot="fixed"
          onIonRefresh={async (e) => {
            await refreshAll();
            e.detail.complete();
          }}
        >
          <IonRefresherContent />
        </IonRefresher>

        <main className="rb-main rb-summary">
          <section className="rb-summary-profile">
            <div className="rb-summary-profile__user">
              <div className="rb-summary-profile__avatar" aria-hidden={!avatarUrl}>
                {avatarUrl ? <img src={avatarUrl} alt="" /> : <Icon name="person" />}
              </div>
              <div>
                <h1 className="rb-summary-profile__name font-display">{displayName}</h1>
                <p className="rb-text-muted">{formatHeaderDate()}</p>
              </div>
            </div>
          </section>

          <section className="glass-card neon-glow rb-summary-balance">
            <span className="rb-label">Баланс RunBonus</span>
            <div className="rb-summary-balance__main font-display">
              {formatBalance(summary?.balance ?? user.balance)}
              <span>сомони</span>
            </div>
            <div className="rb-summary-balance__grid">
              <div>
                <span className="rb-label">Всего заработано</span>
                <strong>{formatBalance(summary?.total_earned ?? 0)} с.</strong>
              </div>
              <div>
                <span className="rb-label">Доступно к выводу</span>
                <strong>{formatBalance(summary?.available_withdraw ?? user.available_balance ?? 0)} с.</strong>
              </div>
            </div>
            <button type="button" className="rb-btn-pill rb-summary-balance__cta" onClick={() => navigate('/wallet/withdraw')}>
              Вывести средства
            </button>
          </section>

          <section className="rb-summary-section">
            <h2 className="rb-headline font-display">Активность за сегодня</h2>
            <div className="rb-summary-metrics">
              <TodayMetricCard icon="straighten" label="Дистанция" value={(summary?.today?.distance ?? 0).toFixed(2)} unit="км" />
              <TodayMetricCard icon="directions_walk" label="Шаги" value={todaySteps.toLocaleString('ru')} />
              <TodayMetricCard icon="timer" label="Время" value={summary?.today?.active_minutes ?? 0} unit="мин" />
              <TodayMetricCard icon="local_fire_department" label="Калории" value={summary?.today?.calories ?? 0} unit="ккал" />
              <TodayMetricCard icon="payments" label="Заработано" value={(summary?.today?.bonus ?? 0).toFixed(2)} unit="сомони" />
            </div>
          </section>

          <section className="glass-card rb-summary-section">
            <h2 className="rb-headline font-display">Кольца активности</h2>
            {loading ? <p className="rb-text-muted">Загрузка…</p> : <ActivityRings rings={summary?.rings} />}
          </section>

          <LevelSection data={levelData} history={levelHistory} loading={levelLoading} />

          <section className="glass-card rb-summary-section">
            <h2 className="rb-headline font-display">Недельная статистика</h2>
            {loading ? <p className="rb-text-muted">Загрузка…</p> : (
              <WeeklyChart days={summary?.weekly} totals={summary?.weekly_totals} />
            )}
          </section>

          <section className="glass-card rb-summary-section">
            <h2 className="rb-headline font-display">Цели</h2>
            <h3 className="rb-summary-goals__title">Дневная цель</h3>
            {(summary?.goals?.daily || []).map((g) => <GoalRow key={g.key} goal={g} />)}
            <h3 className="rb-summary-goals__title">Недельная цель</h3>
            {(summary?.goals?.weekly || []).map((g) => <GoalRow key={g.key} goal={g} />)}
            <h3 className="rb-summary-goals__title">Месячная цель</h3>
            {(summary?.goals?.monthly || []).map((g) => <GoalRow key={g.key} goal={g} />)}
          </section>

          {records && (
            <section className="glass-card rb-summary-section">
              <h2 className="rb-headline font-display">Личные рекорды</h2>
              <RecordRow label="Самая длинная тренировка" value={`${records.longest_workout_km.toFixed(2)} км`} />
              <RecordRow label="Максимум шагов за день" value={records.max_steps_per_day.toLocaleString('ru')} />
              <RecordRow label="Самый большой заработок за день" value={`${records.max_bonus_per_day.toFixed(2)} с.`} />
              <RecordRow label="Лучшее время активности" value={`${records.best_active_minutes} мин`} />
              <RecordRow label="Самая высокая средняя скорость" value={`${records.max_avg_speed_kmh.toFixed(1)} км/ч`} />
            </section>
          )}
        </main>
      </IonContent>
      <BottomNav />
    </IonPage>
  );
}
