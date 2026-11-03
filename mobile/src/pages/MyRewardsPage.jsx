import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import RewardSelectModal from '../components/RewardSelectModal';
import { fetchMyRewards, fetchRewardsProgress } from '../services/rewards';

const STATUS_LABELS = {
  AVAILABLE: 'Можно выбрать',
  CHOOSING: 'Выберите подарок',
  SELECTED: 'Выбрано',
  PROCESSING: 'Обрабатывается',
  READY: 'Готово',
  DELIVERED: 'Получена',
  CANCELLED: 'Отменено',
  LOCKED: 'Недоступно',
};

function km(value) {
  return (Number(value) || 0).toLocaleString('ru', { maximumFractionDigits: 1 });
}

function rewardLabel(reward) {
  if (!reward) return 'Подарок RunBonus';
  if (typeof reward === 'string') return reward;
  return reward.name || reward.title || reward.description || 'Подарок RunBonus';
}

function canChoose(status) {
  return status === 'AVAILABLE' || status === 'CHOOSING';
}

export default function MyRewardsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMilestoneId, setSelectedMilestoneId] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const mine = await fetchMyRewards();
      setItems(Array.isArray(mine) ? mine : mine?.items || []);
    } catch {
      const data = await fetchRewardsProgress();
      const list = (data.milestones || []).filter((item) => item.status && item.status !== 'LOCKED');
      setItems(list);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Не удалось загрузить награды');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const rewards = useMemo(() => items, [items]);

  return (
    <IonPage>
      <AppHeader onBack={() => navigate(-1)} showAvatar={false} />
      <IonContent>
        <IonRefresher
          slot="fixed"
          onIonRefresh={async (e) => {
            await load().catch(() => {});
            e.detail.complete();
          }}
        >
          <IonRefresherContent />
        </IonRefresher>

        <main className="rb-main rb-rewards-page">
          <section className="glass-card rb-rewards-hero">
            <div className="rb-rewards-hero__icon">
              <Icon name="redeem" />
            </div>
            <div>
              <span className="rb-label">Мои награды</span>
              <h1 className="rb-headline font-display">История подарков</h1>
              <p className="rb-text-muted">
                {rewards.length
                  ? `${rewards.length} ${rewards.length === 1 ? 'запись' : 'записей'}`
                  : 'Пока пусто — бегайте и открывайте контрольные точки'}
              </p>
            </div>
          </section>

          {loading && <p className="rb-text-muted">Загрузка наград…</p>}
          {error && <p className="rb-text-error">{error}</p>}

          {!loading && !error && rewards.length === 0 && (
            <section className="glass-card rb-progress-empty">
              <Icon name="redeem" />
              <p>Пока нет открытых наград. Продолжайте бегать — первый подарок появится здесь.</p>
              <button type="button" className="rb-btn-pill" onClick={() => navigate('/rewards')}>
                К наградам
              </button>
            </section>
          )}

          <section className="rb-rewards-list">
            {rewards.map((item) => {
              const distance = item.distance ?? item.distance_km ?? item.milestone?.distance;
              const name = item.name || item.milestone_name || item.milestone?.name;
              const status = item.status;
              const reward = item.reward || item.reward_name;
              const promo = item.promoCode || item.promo_code || item.reward?.promoCode;
              return (
                <article key={item.id || `${distance}-${status}`} className="glass-card rb-reward-history-card">
                  <div className="rb-reward-history-card__head">
                    <div>
                      <span className="rb-label">{km(distance)} км</span>
                      <h2 className="font-display">{name}</h2>
                    </div>
                    <span className={`rb-progress-status rb-progress-status--${String(status || '').toLowerCase()}`}>
                      {STATUS_LABELS[status] || status}
                    </span>
                  </div>
                  <p className="rb-text-muted">{rewardLabel(reward)}</p>
                  {promo ? (
                    <div className="rb-reward-promo-row">
                      <code className="rb-reward-promo-code">{promo}</code>
                      <button
                        type="button"
                        className="rb-btn-pill rb-btn-pill--sm"
                        onClick={() => navigator.clipboard?.writeText(String(promo))}
                      >
                        Копировать
                      </button>
                    </div>
                  ) : null}
                  {canChoose(status) ? (
                    <button
                      type="button"
                      className="rb-btn-pill"
                      onClick={() => setSelectedMilestoneId(item.milestone_id || item.id)}
                    >
                      Выбрать подарок
                    </button>
                  ) : (
                    <div className="rb-reward-history-card__meta">
                      <Icon name={status === 'DELIVERED' ? 'check_circle' : 'local_shipping'} />
                      <span>{STATUS_LABELS[status] || 'В обработке'}</span>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </main>
      </IonContent>
      <BottomNav />
      <RewardSelectModal
        milestoneId={selectedMilestoneId}
        onClose={() => setSelectedMilestoneId(null)}
        onSelected={() => load().catch(() => {})}
      />
    </IonPage>
  );
}
