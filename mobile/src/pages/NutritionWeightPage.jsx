import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import WeightChart from '../components/nutrition/WeightChart';
import {
  fetchWeightHistory,
  addWeightLog,
  deleteWeightLog,
} from '../services/nutrition';
import { showToast } from '../utils/toast';

const PERIODS = [
  { id: '7d', label: '7 дн.' },
  { id: '30d', label: '30 дн.' },
  { id: '90d', label: '90 дн.' },
  { id: '365d', label: 'Год' },
];

function ChangeBadge({ value }) {
  if (value == null || value === 0) {
    return <span className="rb-weight-change rb-weight-change--neutral">0 кг</span>;
  }
  const positive = value > 0;
  return (
    <span className={`rb-weight-change${positive ? ' rb-weight-change--up' : ' rb-weight-change--down'}`}>
      {positive ? '+' : ''}{value} кг
    </span>
  );
}

export default function NutritionWeightPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchWeightHistory(period);
      setItems(data.items || []);
      setSummary(data.summary);
      if (data.summary?.current_kg != null) {
        setWeight((prev) => prev || String(data.summary.current_kg));
      }
    } catch (e) {
      showToast(e?.message || 'Ошибка загрузки');
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const refresh = async () => {
    await load();
  };

  const submit = async (e) => {
    e.preventDefault();
    const w = Number(weight);
    if (!w || w < 30 || w > 300) {
      showToast('Введите вес от 30 до 300 кг');
      return;
    }
    setSaving(true);
    try {
      await addWeightLog({
        weight_kg: w,
        body_fat_pct: bodyFat ? Number(bodyFat) : null,
      });
      showToast('Вес сохранён');
      setBodyFat('');
      await refresh();
    } catch (err) {
      showToast(err?.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteWeightLog(id);
      showToast('Удалено');
      refresh();
    } catch {
      showToast('Ошибка удаления');
    }
  };

  const historyDesc = [...items].reverse();

  return (
    <IonPage>
      <AppHeader onBack={() => navigate('/nutrition')} showAvatar={false} />
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={async (e) => { await refresh(); e.detail.complete(); }}>
          <IonRefresherContent />
        </IonRefresher>

        <main className="rb-main rb-weight-page">
          <h1 className="font-display">Вес</h1>
          <p className="rb-text-muted">История, ИМТ и прогноз до цели</p>

          {loading ? (
            <p className="rb-text-muted">Загрузка…</p>
          ) : (
            <>
              <section className="glass-card rb-weight-summary">
                <div className="rb-weight-summary__main">
                  <span className="rb-label">Текущий вес</span>
                  <strong className="font-display font-tabular">
                    {summary?.current_kg ?? '—'}
                    {summary?.current_kg != null && <span className="rb-weight-summary__unit"> кг</span>}
                  </strong>
                  <ChangeBadge value={summary?.change_kg} />
                </div>
                <div className="rb-weight-summary__grid">
                  <div>
                    <span className="rb-label">ИМТ</span>
                    <strong className="font-tabular">{summary?.bmi ?? '—'}</strong>
                    {summary?.bmi_category && (
                      <span className="rb-text-muted rb-weight-summary__bmi-cat">{summary.bmi_category}</span>
                    )}
                  </div>
                  <div>
                    <span className="rb-label">Цель</span>
                    <strong className="font-tabular">
                      {summary?.target_weight_kg != null ? `${summary.target_weight_kg} кг` : '—'}
                    </strong>
                  </div>
                  <div>
                    <span className="rb-label">Рост</span>
                    <strong className="font-tabular">{summary?.height_cm ?? '—'} см</strong>
                  </div>
                </div>
              </section>

              {summary?.forecast && (
                <section className="glass-card rb-weight-forecast">
                  <Icon name="timeline" />
                  <div>
                    <strong>До цели ~{summary.forecast.weeks_to_goal} нед.</strong>
                    <p className="rb-text-muted">
                      Осталось {summary.forecast.remaining_kg} кг · темп{' '}
                      {summary.forecast.weekly_change_kg > 0 ? '+' : ''}
                      {summary.forecast.weekly_change_kg} кг/нед.
                    </p>
                  </div>
                </section>
              )}

              <section className="glass-card">
                <div className="rb-weight-period">
                  {PERIODS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`rb-weight-period__btn${period === p.id ? ' active' : ''}`}
                      onClick={() => setPeriod(p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <WeightChart items={items} targetWeight={summary?.target_weight_kg} />
              </section>

              <section className="glass-card rb-weight-form-card">
                <h2 className="rb-headline font-display">Записать вес</h2>
                <form className="rb-weight-form" onSubmit={submit}>
                  <div className="rb-nutrition-edit-grid">
                    <label className="rb-field">
                      Вес (кг)
                      <input
                        type="number"
                        step="0.1"
                        min="30"
                        max="300"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        required
                      />
                    </label>
                    <label className="rb-field">
                      % жира (необяз.)
                      <input
                        type="number"
                        step="0.1"
                        min="3"
                        max="60"
                        value={bodyFat}
                        onChange={(e) => setBodyFat(e.target.value)}
                        placeholder="—"
                      />
                    </label>
                  </div>
                  <button type="submit" className="rb-btn-pill" disabled={saving}>
                    {saving ? '…' : 'Сохранить'}
                  </button>
                </form>
              </section>

              <section className="glass-card rb-weight-history">
                <h2 className="rb-headline font-display">История</h2>
                {!historyDesc.length ? (
                  <p className="rb-text-muted">Записей пока нет</p>
                ) : (
                  <ul>
                    {historyDesc.map((item) => (
                      <li key={item.id} className="rb-weight-history-item">
                        <div>
                          <span className="rb-text-muted">
                            {new Date(item.logged_at || item.date).toLocaleDateString('ru', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </span>
                          <strong className="font-tabular">{item.weight_kg} кг</strong>
                          {item.body_fat_pct != null && (
                            <span className="rb-text-muted"> · {item.body_fat_pct}% жира</span>
                          )}
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
            </>
          )}
        </main>
      </IonContent>
      <BottomNav />
    </IonPage>
  );
}
