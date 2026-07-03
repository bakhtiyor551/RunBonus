import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import PremiumPaywall from '../components/nutrition/PremiumPaywall';
import AddFoodSheet from '../components/nutrition/AddFoodSheet';
import PhotoAnalysisSheet from '../components/nutrition/PhotoAnalysisSheet';
import {
  fetchNutritionStatus,
  fetchNutritionToday,
  fetchNutritionWeek,
  fetchNutritionHistory,
  fetchNutritionRecommendations,
  fetchNutritionAnalytics,
  deleteNutritionEntry,
} from '../services/nutrition';
import { showToast } from '../utils/toast';

function pctOf(value, goal) {
  return goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
}

function CalorieRing({ consumed, goal }) {
  const size = 140;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const pct = pctOf(consumed, goal);
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;
  const over = consumed > goal;

  return (
    <div className="rb-nutrition-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="transparent"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={stroke}
          />
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="transparent"
            stroke={over ? '#ff6b6b' : 'var(--rb-neon)'}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="rb-nutrition-ring__arc"
          />
        </g>
      </svg>
      <div className="rb-nutrition-ring__center">
        <strong className="font-display font-tabular">{consumed}</strong>
        <span className="rb-text-muted">из {goal} kcal</span>
      </div>
    </div>
  );
}

function StatCard({ emoji, label, value, unit, accent }) {
  return (
    <div className={`glass-card rb-nutrition-stat${accent ? ' rb-nutrition-stat--accent' : ''}`}>
      <span className="rb-nutrition-stat__emoji" aria-hidden>{emoji}</span>
      <span className="rb-label">{label}</span>
      <strong className="font-display font-tabular">{value}</strong>
      {unit && <span className="rb-text-muted rb-nutrition-stat__unit">{unit}</span>}
    </div>
  );
}

function MacroBar({ label, value, goal, color }) {
  return (
    <div className="rb-nutrition-macro">
      <div className="rb-nutrition-macro__head">
        <span className="rb-label">{label}</span>
        <span className="rb-nutrition-macro__val font-tabular">{value} / {goal} г</span>
      </div>
      <div className="rb-nutrition-macro__track">
        <span className="rb-nutrition-macro__fill" style={{ width: `${pctOf(value, goal)}%`, background: color }} />
      </div>
    </div>
  );
}

function MealRow({ label, calories, total }) {
  const pct = total > 0 ? Math.min(100, (calories / total) * 100) : 0;
  return (
    <div className="rb-nutrition-meal">
      <div className="rb-nutrition-meal__head">
        <span>{label}</span>
        <strong className="font-tabular">{calories} kcal</strong>
      </div>
      <div className="rb-nutrition-meal__track">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MiniChart({ days }) {
  if (!days?.length) return <p className="rb-text-muted">Нет данных за неделю</p>;
  const max = Math.max(...days.map((d) => Math.max(d.consumed, d.burned)), 1);
  return (
    <div className="rb-nutrition-chart">
      <div className="rb-nutrition-chart__cols">
        {days.map((d) => (
          <div key={d.date} className="rb-nutrition-chart__col">
            <div className="rb-nutrition-chart__bars">
              <div
                className="rb-nutrition-chart__bar rb-nutrition-chart__bar--eat"
                style={{ height: `${(d.consumed / max) * 100}%` }}
                title={`${d.consumed} kcal`}
              />
              <div
                className="rb-nutrition-chart__bar rb-nutrition-chart__bar--burn"
                style={{ height: `${(d.burned / max) * 100}%` }}
                title={`${d.burned} kcal`}
              />
            </div>
            <span className="rb-nutrition-chart__day">{d.day}</span>
          </div>
        ))}
      </div>
      <div className="rb-nutrition-chart__legend">
        <span><i className="eat" /> Съедено</span>
        <span><i className="burn" /> Сожжено</span>
      </div>
    </div>
  );
}

function NutritionSkeleton() {
  return (
    <div className="rb-nutrition-skeleton" aria-hidden>
      <div className="rb-nutrition-stats-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card rb-nutrition-skeleton__card" />
        ))}
      </div>
      <div className="glass-card rb-nutrition-skeleton__block" />
      <div className="glass-card rb-nutrition-skeleton__block" />
    </div>
  );
}

export default function NutritionPage({ user }) {
  const navigate = useNavigate();
  const [premium, setPremium] = useState(user?.is_premium ?? null);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState(null);
  const [week, setWeek] = useState(null);
  const [history, setHistory] = useState([]);
  const [tips, setTips] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const status = await fetchNutritionStatus();
      setPremium(status.is_premium);
      if (!status.is_premium) return;

      const [t, w, h, rec, an] = await Promise.all([
        fetchNutritionToday(),
        fetchNutritionWeek(),
        fetchNutritionHistory(),
        fetchNutritionRecommendations().catch(() => ({ tips: [] })),
        fetchNutritionAnalytics().catch(() => null),
      ]);
      setToday(t);
      setWeek(w);
      setHistory(h.items || []);
      setTips(rec.tips || []);
      setAnalytics(an);
    } catch (e) {
      if (e?.code === 'PREMIUM_REQUIRED') {
        setPremium(false);
      }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  const refresh = async () => {
    await loadAll();
  };

  const handleDelete = async (id) => {
    try {
      await deleteNutritionEntry(id);
      showToast('Удалено');
      refresh();
    } catch {
      showToast('Ошибка удаления');
    }
  };

  if (premium === false) {
    return (
      <IonPage>
        <AppHeader onBack={() => navigate('/summary')} showAvatar={false} />
        <IonContent>
          <main className="rb-main rb-nutrition">
            <PremiumPaywall onClose={() => navigate('/summary')} />
          </main>
        </IonContent>
      </IonPage>
    );
  }

  const remaining = today?.remaining ?? 0;
  const balance = today?.balance ?? 0;
  const consumed = today?.consumed_today ?? 0;
  const goal = today?.daily_goal ?? 2200;
  const burned = today?.burned_today ?? 0;
  const macros = today?.consumed_macros;
  const macrosGoal = today?.macros_goal;
  const meals = today?.meals ?? {};
  const mealsTotal = (meals.breakfast ?? 0) + (meals.lunch ?? 0) + (meals.dinner ?? 0) + (meals.snack ?? 0);

  return (
    <IonPage>
      <AppHeader
        onBack={() => navigate('/summary')}
        showAvatar={false}
        badge={(
          <span className="rb-nutrition-plus-badge">
            <Icon name="workspace_premium" />
            RunBonus+
          </span>
        )}
      />
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={async (e) => { await refresh(); e.detail.complete(); }}>
          <IonRefresherContent />
        </IonRefresher>

        <main className="rb-main rb-nutrition">
          <section className="rb-nutrition-hero">
            <div className="rb-nutrition-hero__text">
              <h1 className="font-display">Питание и калории</h1>
              <p className="rb-text-muted">AI-диетолог RunBonus+</p>
            </div>
            {!loading && today && (
              <div className="rb-nutrition-hero__ring-wrap">
                <CalorieRing consumed={consumed} goal={goal} />
              </div>
            )}
          </section>

          {loading ? (
            <NutritionSkeleton />
          ) : (
            <>
              <section className="rb-nutrition-stats-grid">
                <StatCard emoji="🔥" label="Сожжено" value={burned} unit="kcal" />
                <StatCard emoji="🍔" label="Съедено" value={consumed} unit="kcal" />
                <StatCard emoji="🎯" label="Цель" value={goal} unit="kcal" />
                <StatCard
                  emoji={remaining >= 0 ? '📉' : '⚠️'}
                  label="Осталось"
                  value={remaining >= 0 ? remaining : `+${Math.abs(remaining)}`}
                  unit={remaining >= 0 ? 'kcal' : 'превышение'}
                  accent={remaining < 0}
                />
              </section>

              <div className="rb-nutrition-columns">
                <section className="glass-card rb-nutrition-balance">
                  <h2 className="rb-headline font-display">Баланс дня</h2>
                  <div className="rb-nutrition-balance__row">
                    <div className="rb-nutrition-balance__item">
                      <span className="rb-label">Съедено</span>
                      <strong className="font-tabular">{consumed} kcal</strong>
                    </div>
                    <span className="rb-nutrition-balance__op" aria-hidden>−</span>
                    <div className="rb-nutrition-balance__item">
                      <span className="rb-label">Сожжено</span>
                      <strong className="font-tabular">{burned} kcal</strong>
                    </div>
                    <span className="rb-nutrition-balance__op" aria-hidden>=</span>
                    <div className="rb-nutrition-balance__item">
                      <span className="rb-label">Итого</span>
                      <strong className={`font-tabular${balance > 0 ? ' rb-nutrition-balance--plus' : ''}`}>
                        {balance > 0 ? '+' : ''}{balance} kcal
                      </strong>
                    </div>
                  </div>
                  <div className="rb-nutrition-goal-bar">
                    <div className="rb-nutrition-goal-bar__head">
                      <span className="rb-label">Прогресс цели</span>
                      <span className="font-tabular">{Math.round((consumed / goal) * 100)}%</span>
                    </div>
                    <div className="rb-nutrition-goal-bar__track">
                      <span
                        className={`rb-nutrition-goal-bar__fill${consumed > goal ? ' rb-nutrition-goal-bar__fill--over' : ''}`}
                        style={{ width: `${Math.min(100, (consumed / goal) * 100)}%` }}
                      />
                    </div>
                  </div>
                </section>

                <section className="glass-card">
                  <h2 className="rb-headline font-display">Расход энергии</h2>
                  <div className="rb-nutrition-period-row">
                    <div>
                      <span className="rb-label">Сегодня</span>
                      <strong className="font-tabular">{burned} kcal</strong>
                    </div>
                    <div>
                      <span className="rb-label">Неделя</span>
                      <strong className="font-tabular">{today?.burned_week ?? 0} kcal</strong>
                    </div>
                  </div>
                </section>
              </div>

              {macros && macrosGoal && (
                <section className="glass-card rb-nutrition-macros">
                  <h2 className="rb-headline font-display">БЖУ сегодня</h2>
                  <MacroBar label="Белки" value={macros.protein_g ?? 0} goal={macrosGoal.protein_g ?? 120} color="#c3f400" />
                  <MacroBar label="Жиры" value={macros.fat_g ?? 0} goal={macrosGoal.fat_g ?? 70} color="#00d4ff" />
                  <MacroBar label="Углеводы" value={macros.carbs_g ?? 0} goal={macrosGoal.carbs_g ?? 250} color="#ff9f43" />
                </section>
              )}

              <section className="glass-card">
                <h2 className="rb-headline font-display">Приёмы пищи</h2>
                <div className="rb-nutrition-meals-list">
                  <MealRow label="Завтрак" calories={meals.breakfast ?? 0} total={mealsTotal || goal} />
                  <MealRow label="Обед" calories={meals.lunch ?? 0} total={mealsTotal || goal} />
                  <MealRow label="Ужин" calories={meals.dinner ?? 0} total={mealsTotal || goal} />
                  <MealRow label="Перекусы" calories={meals.snack ?? 0} total={mealsTotal || goal} />
                </div>
              </section>

              {tips.length > 0 && (
                <section className="glass-card rb-nutrition-tips">
                  <h2 className="rb-headline font-display">
                    <Icon name="lightbulb" /> Рекомендации
                  </h2>
                  {tips.map((t, i) => (
                    <p key={i} className="rb-nutrition-tip">{t.message}</p>
                  ))}
                </section>
              )}

              <div className="rb-nutrition-columns">
                {analytics && (
                  <section className="glass-card">
                    <h2 className="rb-headline font-display">Аналитика (30 дней)</h2>
                    <div className="rb-nutrition-analytics">
                      <div>
                        <span className="rb-label">Среднее потребление</span>
                        <strong className="font-tabular">{analytics.avg_consumed} kcal</strong>
                      </div>
                      <div>
                        <span className="rb-label">Средний расход</span>
                        <strong className="font-tabular">{analytics.avg_burned} kcal</strong>
                      </div>
                      <div>
                        <span className="rb-label">Средний баланс</span>
                        <strong className="font-tabular">
                          {analytics.avg_balance > 0 ? '+' : ''}{analytics.avg_balance} kcal
                        </strong>
                      </div>
                      <div>
                        <span className="rb-label">За месяц</span>
                        <strong className="font-tabular">{today?.consumed_month ?? 0} kcal</strong>
                      </div>
                    </div>
                    {(today?.streak?.current_streak > 0) && (
                      <p className="rb-nutrition-streak">
                        <Icon name="local_fire_department" />
                        Streak: {today.streak.current_streak} дн. (рекорд {today.streak.best_streak})
                      </p>
                    )}
                  </section>
                )}

                <section className="glass-card">
                  <h2 className="rb-headline font-display">Калории за неделю</h2>
                  <MiniChart days={week?.days} />
                </section>
              </div>

              <section className="glass-card rb-nutrition-history">
                <h2 className="rb-headline font-display">История сегодня</h2>
                {!history.length ? (
                  <div className="rb-nutrition-empty">
                    <Icon name="restaurant" />
                    <p>Пока нет записей</p>
                    <span className="rb-text-muted">Нажмите «Добавить еду», чтобы записать приём пищи</span>
                  </div>
                ) : (
                  <ul>
                    {history.map((item) => (
                      <li key={item.id} className="rb-nutrition-history-item">
                        <div className="rb-nutrition-history__body">
                          <div className="rb-nutrition-history__meta">
                            <span className="rb-nutrition-history__time">{item.time}</span>
                            {item.meal_label && (
                              <span className="rb-nutrition-history__meal">{item.meal_label}</span>
                            )}
                          </div>
                          <strong>{item.name}</strong>
                          <span className="rb-text-muted rb-nutrition-history__kcal">{item.calories} kcal</span>
                        </div>
                        <button
                          type="button"
                          className="rb-nutrition-history__del"
                          onClick={() => handleDelete(item.id)}
                          aria-label="Удалить"
                        >
                          <Icon name="delete" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <button type="button" className="rb-btn-pill rb-nutrition-fab" onClick={() => setAddOpen(true)}>
                <Icon name="add" />
                Добавить еду
              </button>
            </>
          )}
        </main>
      </IonContent>

      <AddFoodSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onPhoto={() => setPhotoOpen(true)}
        onSaved={refresh}
      />
      <PhotoAnalysisSheet
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        onSaved={refresh}
      />
      <BottomNav />
    </IonPage>
  );
}
