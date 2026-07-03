import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import { fetchAchievements } from '../services/nutrition';
import { showToast } from '../utils/toast';

const CATEGORIES = [
  { id: 'all', label: 'Все' },
  { id: 'streak', label: 'Streak' },
  { id: 'food', label: 'Питание' },
  { id: 'ai', label: 'AI' },
  { id: 'water', label: 'Вода' },
  { id: 'protein', label: 'Белок' },
  { id: 'weight', label: 'Вес' },
  { id: 'workout', label: 'Бег' },
];

function AchievementCard({ item }) {
  return (
    <div className={`rb-ach-card${item.unlocked ? ' rb-ach-card--unlocked' : ''}`}>
      <div className="rb-ach-card__icon">
        <Icon name={item.icon || 'emoji_events'} />
      </div>
      <div className="rb-ach-card__body">
        <strong>{item.title}</strong>
        <p className="rb-text-muted">{item.description}</p>
        {!item.unlocked && (
          <div className="rb-ach-card__progress">
            <div className="rb-nutrition-goal-bar__track">
              <span className="rb-nutrition-goal-bar__fill" style={{ width: `${item.progress_pct}%` }} />
            </div>
            <span className="rb-label font-tabular">{item.progress}/{item.threshold}</span>
          </div>
        )}
        {item.unlocked && item.bonus_points > 0 && (
          <span className="rb-ach-card__bonus">+{item.bonus_points} бонус</span>
        )}
      </div>
    </div>
  );
}

export default function NutritionAchievementsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [category, setCategory] = useState('all');

  const load = useCallback(async () => {
    const result = await fetchAchievements();
    setData(result);
  }, []);

  useEffect(() => {
    setLoading(true);
    load()
      .catch(() => showToast('Не удалось загрузить достижения'))
      .finally(() => setLoading(false));
  }, [load]);

  const items = useMemo(() => {
    const list = data?.items || [];
    if (category === 'all') return list;
    return list.filter((i) => i.category === category);
  }, [data, category]);

  return (
    <IonPage>
      <AppHeader onBack={() => navigate('/nutrition')} showAvatar={false} />
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={async (e) => { await load(); e.detail.complete(); }}>
          <IonRefresherContent />
        </IonRefresher>

        <main className="rb-main rb-ach-page">
          <h1 className="rb-ach-page__title font-display">Достижения</h1>
          {data && (
            <p className="rb-ach-page__summary rb-text-muted">
              Разблокировано {data.unlocked_count} из {data.total}
            </p>
          )}

          <div className="rb-weight-period rb-ach-categories">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`rb-weight-period__btn${category === c.id ? ' active' : ''}`}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="rb-ach-skeleton glass-card" aria-hidden />
          ) : (
            <div className="rb-ach-grid">
              {items.map((item) => (
                <AchievementCard key={item.slug} item={item} />
              ))}
            </div>
          )}
        </main>
      </IonContent>
      <BottomNav active="summary" />
    </IonPage>
  );
}
