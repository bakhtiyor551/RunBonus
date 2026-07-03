import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import {
  fetchWaterToday,
  fetchWaterStats,
  addWaterLog,
  deleteWaterLog,
} from '../services/nutrition';
import { showToast } from '../utils/toast';

const QUICK_AMOUNTS = [150, 250, 500];

function WaterRing({ consumed, goal }) {
  const size = 140;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const pct = goal > 0 ? Math.min(100, (consumed / goal) * 100) : 0;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;
  const done = consumed >= goal;

  return (
    <div className="rb-water-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          <circle cx={cx} cy={cx} r={r} fill="transparent" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="transparent"
            stroke={done ? 'var(--rb-neon)' : '#00d4ff'}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="rb-water-ring__arc"
          />
        </g>
      </svg>
      <div className="rb-water-ring__center">
        <strong className="font-display font-tabular">{consumed}</strong>
        <span className="rb-text-muted">из {goal} мл</span>
      </div>
    </div>
  );
}

function WaterWeekChart({ days = [] }) {
  if (!days.length) return null;
  const max = Math.max(...days.map((d) => d.consumed_ml), 1);
  return (
    <div className="rb-water-chart">
      {days.map((d) => (
        <div key={d.date} className="rb-water-chart__col">
          <div className="rb-water-chart__bars">
            <div
              className="rb-water-chart__bar"
              style={{ height: `${Math.max(4, (d.consumed_ml / max) * 100)}%` }}
              title={`${d.consumed_ml} мл`}
            />
          </div>
          <span className="rb-water-chart__day">{d.day}</span>
        </div>
      ))}
    </div>
  );
}

export default function NutritionWaterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState(null);
  const [stats, setStats] = useState(null);
  const [customMl, setCustomMl] = useState('');
  const [adding, setAdding] = useState(false);
  const [period, setPeriod] = useState('7d');

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([
        fetchWaterToday(),
        fetchWaterStats(period),
      ]);
      setToday(t);
      setStats(s);
    } catch (e) {
      showToast(e?.message || 'Ошибка загрузки');
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const addWater = async (ml) => {
    setAdding(true);
    try {
      const res = await addWaterLog(ml);
      setToday(res.today);
      await load();
      showToast(`+${ml} мл`);
    } catch (e) {
      showToast(e?.message || 'Ошибка');
    } finally {
      setAdding(false);
    }
  };

  const handleCustom = async (e) => {
    e.preventDefault();
    const ml = Math.round(Number(customMl));
    if (!ml || ml < 50 || ml > 2000) {
      showToast('От 50 до 2000 мл');
      return;
    }
    await addWater(ml);
    setCustomMl('');
  };

  const handleDelete = async (id) => {
    try {
      await deleteWaterLog(id);
      showToast('Удалено');
      load();
    } catch {
      showToast('Ошибка удаления');
    }
  };

  return (
    <IonPage>
      <AppHeader onBack={() => navigate('/nutrition')} showAvatar={false} />
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={async (e) => { await load(); e.detail.complete(); }}>
          <IonRefresherContent />
        </IonRefresher>

        <main className="rb-main rb-water-page">
          <h1 className="font-display">Вода</h1>
          <p className="rb-text-muted">Гидратация и дневная норма</p>

          {loading ? (
            <p className="rb-text-muted">Загрузка…</p>
          ) : today && (
            <>
              <section className="rb-water-hero">
                <WaterRing consumed={today.consumed_ml} goal={today.goal_ml} />
                <div className="rb-water-hero__info">
                  <p className="rb-water-hero__remaining">
                    {today.remaining_ml > 0
                      ? <>Осталось <strong className="font-tabular">{today.remaining_ml}</strong> мл</>
                      : <strong className="rb-water-hero__done">Норма выполнена!</strong>}
                  </p>
                  {today.workout_bonus_ml > 0 && (
                    <p className="rb-text-muted rb-water-hero__bonus">
                      +{today.workout_bonus_ml} мл за тренировку сегодня
                    </p>
                  )}
                  <p className="rb-text-muted">Базовая норма: {today.base_ml} мл (вес × 33)</p>
                </div>
              </section>

              <section className="glass-card rb-water-quick">
                <h2 className="rb-headline font-display">Быстро добавить</h2>
                <div className="rb-water-quick__grid">
                  {QUICK_AMOUNTS.map((ml) => (
                    <button
                      key={ml}
                      type="button"
                      className="rb-water-quick__btn"
                      disabled={adding}
                      onClick={() => addWater(ml)}
                    >
                      <Icon name="water_drop" />
                      +{ml} мл
                    </button>
                  ))}
                </div>
                <form className="rb-water-custom" onSubmit={handleCustom}>
                  <input
                    type="number"
                    className="rb-input"
                    placeholder="Свой объём (мл)"
                    value={customMl}
                    onChange={(e) => setCustomMl(e.target.value)}
                    min={50}
                    max={2000}
                  />
                  <button type="submit" className="rb-btn-pill" disabled={adding}>Добавить</button>
                </form>
              </section>

              <section className="glass-card">
                <div className="rb-weight-period">
                  <button type="button" className={`rb-weight-period__btn${period === '7d' ? ' active' : ''}`} onClick={() => setPeriod('7d')}>7 дн.</button>
                  <button type="button" className={`rb-weight-period__btn${period === '30d' ? ' active' : ''}`} onClick={() => setPeriod('30d')}>30 дн.</button>
                </div>
                {stats && (
                  <p className="rb-text-muted rb-water-stats-avg">
                    Среднее: <strong className="font-tabular">{stats.avg_ml}</strong> мл/день
                  </p>
                )}
                <WaterWeekChart days={stats?.days} />
              </section>

              <section className="glass-card rb-water-history">
                <h2 className="rb-headline font-display">Сегодня</h2>
                {!today.logs?.length ? (
                  <p className="rb-text-muted">Пока нет записей</p>
                ) : (
                  <ul>
                    {today.logs.map((log) => (
                      <li key={log.id} className="rb-water-history-item">
                        <div>
                          <span className="rb-text-muted">{log.time}</span>
                          <strong className="font-tabular">+{log.amount_ml} мл</strong>
                        </div>
                        <button type="button" className="rb-nutrition-history__del" onClick={() => handleDelete(log.id)} aria-label="Удалить">
                          <Icon name="delete" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </main>
      </IonContent>
      <BottomNav />
    </IonPage>
  );
}
