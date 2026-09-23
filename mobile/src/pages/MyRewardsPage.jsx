import { useCallback, useEffect, useMemo, useState } from 'react';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import RewardSelectModal from '../components/RewardSelectModal';
import { fetchRewardsProgress } from '../services/rewards';

const STATUS_LABELS = {
  AVAILABLE: 'Можно выбрать',
  CHOOSING: 'Выберите подарок',
  SELECTED: 'Выбрано',
  PROCESSING: 'В обработке',
  READY: 'Готово к выдаче',
  DELIVERED: 'Доставлено',
  CANCELLED: 'Отменено',
};

function km(value) {
  return (Number(value) || 0).toLocaleString('ru', { maximumFractionDigits: 1 });
}

function rewardLabel(reward) {
  if (!reward) return 'Подарок RunBonus';
  if (typeof reward === 'string') return reward;
  return reward.name || reward.title || reward.description || 'Подарок RunBonus';
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || 'Статус';
}

function canChoose(status) {
  return status === 'AVAILABLE' || status === 'CHOOSING';
}

export default function MyRewardsPage() {
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMilestoneId, setSelectedMilestoneId] = useState(null);

  const loadProgress = useCallback(async () => {
    setError('');
    const data = await fetchRewardsProgress();
    setProgress(data);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadProgress()
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Не удалось загрузить награды');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadProgress]);

  const rewards = useMemo(
    () => (progress?.milestones || []).filter((item) => item.status && item.status !== 'LOCKED'),
    [progress?.milestones]
  );

  return (
    <IonPage>
      <AppHeader showAvatar={false} />
      <IonContent>
        <IonRefresher
          slot="fixed"
          onIonRefresh={async (e) => {
            await loadProgress().catch(() => {});
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
              <h1 className="rb-headline font-display">История milestone-подарков</h1>
              <p className="rb-text-muted">
                Получено и доступно: {progress?.earnedCount ?? rewards.length}
              </p>
            </div>
          </section>

          {loading && <p className="rb-text-muted">Загрузка наград…</p>}
          {error && <p className="rb-text-error">{error}</p>}

          {!loading && !error && rewards.length === 0 && (
            <section className="glass-card rb-progress-empty">
              <Icon name="emoji_events" />
              <p>Пока нет открытых наград. Продолжайте бегать, и первый подарок появится здесь.</p>
            </section>
          )}

          <section className="rb-rewards-list">
            {rewards.map((milestone) => (
              <article key={milestone.id} className="glass-card rb-reward-history-card">
                <div className="rb-reward-history-card__head">
                  <div>
                    <span className="rb-label">{km(milestone.distance)} км</span>
                    <h2 className="font-display">{milestone.name}</h2>
                  </div>
                  <span className={`rb-progress-status rb-progress-status--${String(milestone.status || '').toLowerCase()}`}>
                    {statusLabel(milestone.status)}
                  </span>
                </div>
                <p className="rb-text-muted">{rewardLabel(milestone.reward)}</p>
                {canChoose(milestone.status) ? (
                  <button type="button" className="rb-btn-pill" onClick={() => setSelectedMilestoneId(milestone.id)}>
                    Выбрать подарок
                  </button>
                ) : (
                  <div className="rb-reward-history-card__meta">
                    <Icon name={milestone.status === 'DELIVERED' ? 'check_circle' : 'local_shipping'} />
                    <span>
                      {milestone.status === 'DELIVERED'
                        ? 'Подарок доставлен'
                        : milestone.status === 'READY'
                          ? 'Готово к выдаче'
                          : 'Следите за статусом обработки'}
                    </span>
                  </div>
                )}
              </article>
            ))}
          </section>
        </main>
      </IonContent>
      <BottomNav />
      <RewardSelectModal
        milestoneId={selectedMilestoneId}
        onClose={() => setSelectedMilestoneId(null)}
        onSelected={() => loadProgress().catch(() => {})}
      />
    </IonPage>
  );
}
