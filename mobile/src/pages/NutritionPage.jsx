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

function MiniChart({ days }) {
  if (!days?.length) return null;
  const max = Math.max(...days.map((d) => Math.max(d.consumed, d.burned)), 1);
  return (
    <div className="rb-nutrition-chart">
      {days.map((d) => (
        <div key={d.date} className="rb-nutrition-chart__col">
          <div className="rb-nutrition-chart__bars">
            <div className="rb-nutrition-chart__bar rb-nutrition-chart__bar--eat" style={{ height: `${(d.consumed / max) * 100}%` }} title={`${d.consumed} kcal`} />
            <div className="rb-nutrition-chart__bar rb-nutrition-chart__bar--burn" style={{ height: `${(d.burned / max) * 100}%` }} title={`${d.burned} kcal`} />
          </div>
          <span className="rb-nutrition-chart__day">{d.day}</span>
        </div>
      ))}
      <div className="rb-nutrition-chart__legend">
        <span><i className="eat" /> Съедено</span>
        <span><i className="burn" /> Сожжено</span>
      </div>
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
          <main className="rb-main">
            <PremiumPaywall onClose={() => navigate('/summary')} />
          </main>
        </IonContent>
      </IonPage>
    );
  }

  const remaining = today?.remaining ?? 0;
  const balance = today?.balance ?? 0;

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
            <h1 className="font-display">Питание и калории</h1>
            <p className="rb-text-muted">AI-диетолог RunBonus+</p>
          </section>

          {loading ? (
            <p className="rb-text-muted">Загрузка…</p>
          ) : (
            <>
              <section className="rb-nutrition-stats-grid">
                <StatCard emoji="🔥" label="Сожжено сегодня" value={today?.burned_today ?? 0} unit="kcal" />
                <StatCard emoji="🍔" label="Съедено" value={today?.consumed_today ?? 0} unit="kcal" />
                <StatCard emoji="🎯" label="Дневная цель" value={today?.daily_goal ?? 2200} unit="kcal" />
                <StatCard
                  emoji="📉"
                  label="Осталось"
                  value={remaining >= 0 ? remaining : `+${Math.abs(remaining)}`}
                  unit={remaining >= 0 ? 'kcal' : 'превышение'}
                  accent={remaining < 0}
                />
              </section>

              <section className="glass-card rb-nutrition-balance">
                <h2 className="rb-headline font-display">Баланс</h2>
                <div className="rb-nutrition-balance__row">
                  <div>
                    <span className="rb-label">Съедено</span>
                    <strong>{today?.consumed_today ?? 0} kcal</strong>
                  </div>
                  <span className="rb-nutrition-balance__op">−</span>
                  <div>
                    <span className="rb-label">Сожжено</span>
                    <strong>{today?.burned_today ?? 0} kcal</strong>
                  </div>
                  <span className="rb-nutrition-balance__op">=</span>
                  <div>
                    <span className="rb-label">Итого</span>
                    <strong className={balance > 0 ? 'rb-nutrition-balance--plus' : ''}>
                      {balance > 0 ? '+' : ''}{balance} kcal
                    </strong>
                  </div>
                </div>
              </section>

              <section className="glass-card">
                <h2 className="rb-headline font-display">Сожжено</h2>
                <div className="rb-nutrition-period-row">
                  <div><span className="rb-label">Сегодня</span><strong>{today?.burned_today ?? 0} kcal</strong></div>
                  <div><span className="rb-label">Неделя</span><strong>{today?.burned_week ?? 0} kcal</strong></div>
                </div>
              </section>

              <section className="glass-card">
                <h2 className="rb-headline font-display">Съедено по приёмам</h2>
                <div className="rb-nutrition-meals-grid">
                  <div><span className="rb-label">Завтрак</span><strong>{today?.meals?.breakfast ?? 0}</strong></div>
                  <div><span className="rb-label">Обед</span><strong>{today?.meals?.lunch ?? 0}</strong></div>
                  <div><span className="rb-label">Ужин</span><strong>{today?.meals?.dinner ?? 0}</strong></div>
                  <div><span className="rb-label">Перекусы</span><strong>{today?.meals?.snack ?? 0}</strong></div>
                </div>
              </section>

              {tips.length > 0 && (
                <section className="glass-card rb-nutrition-tips">
                  <h2 className="rb-headline font-display"><Icon name="lightbulb" /> Рекомендации</h2>
                  {tips.map((t, i) => (
                    <p key={i} className="rb-nutrition-tip">{t.message}</p>
                  ))}
                </section>
              )}

              {analytics && (
                <section className="glass-card">
                  <h2 className="rb-headline font-display">Аналитика (30 дней)</h2>
                  <div className="rb-nutrition-analytics">
                    <div><span className="rb-label">Среднее потребление</span><strong>{analytics.avg_consumed} kcal</strong></div>
                    <div><span className="rb-label">Средний расход</span><strong>{analytics.avg_burned} kcal</strong></div>
                    <div><span className="rb-label">Средний баланс</span><strong>{analytics.avg_balance > 0 ? '+' : ''}{analytics.avg_balance} kcal</strong></div>
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

              <section className="glass-card rb-nutrition-history">
                <h2 className="rb-headline font-display">История сегодня</h2>
                {!history.length ? (
                  <p className="rb-text-muted">Пока нет записей</p>
                ) : (
                  <ul>
                    {history.map((item) => (
                      <li key={item.id} className="rb-nutrition-history-item">
                        <div>
                          <span className="rb-nutrition-history__time">{item.time}</span>
                          <strong>{item.name}</strong>
                          <span className="rb-text-muted">{item.calories} kcal</span>
                        </div>
                        <button type="button" className="rb-nutrition-history__del" onClick={() => handleDelete(item.id)} aria-label="Удалить">
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
