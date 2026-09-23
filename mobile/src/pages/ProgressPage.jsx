import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import RewardSelectModal from '../components/RewardSelectModal';
import { fetchRewardsProgress } from '../services/rewards';

const STATUS_LABELS = {
  LOCKED: 'Закрыто',
  AVAILABLE: 'Доступно',
  CHOOSING: 'Выберите подарок',
  SELECTED: 'Выбрано',
  PROCESSING: 'В обработке',
  READY: 'Готово',
  DELIVERED: 'Доставлено',
  CANCELLED: 'Отменено',
};

function km(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('ru', { maximumFractionDigits: 1 });
}

function rewardLabel(reward) {
  if (!reward) return 'Подарок RunBonus';
  if (typeof reward === 'string') return reward;
  return reward.name || reward.title || reward.description || 'Подарок RunBonus';
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || 'Статус';
}

function canOpen(status) {
  return status === 'AVAILABLE' || status === 'CHOOSING';
}

export default function ProgressPage() {
  const [searchParams, setSearchParams] = useSearchParams();
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
      .then((data) => {
        if (cancelled) return;
        const milestoneId = searchParams.get('milestone');
        if (milestoneId) {
          const milestone = (data.milestones || []).find((item) => String(item.id) === String(milestoneId));
          if (!milestone || canOpen(milestone.status)) setSelectedMilestoneId(milestoneId);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Не удалось загрузить прогресс');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadProgress, searchParams]);

  const nextDistance = Number(progress?.nextMilestone?.distance ?? progress?.nextMilestone ?? 0);
  const totalDistance = Number(progress?.totalDistance ?? 0);
  const remainingDistance = Number(progress?.remainingDistance ?? 0);
  const progressPercent = useMemo(() => {
    if (!nextDistance) return 100;
    return Math.max(0, Math.min(100, Math.round((totalDistance / nextDistance) * 100)));
  }, [nextDistance, totalDistance]);

  const closeModal = () => {
    setSelectedMilestoneId(null);
    if (searchParams.has('milestone')) setSearchParams({});
  };

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

        <main className="rb-main rb-progress-page">
          <section className="glass-card neon-glow rb-progress-hero">
            <span className="rb-label">Мой прогресс</span>
            <div className="rb-progress-hero__distance font-display font-tabular">
              {km(totalDistance)}
              <span>км</span>
            </div>
            <p className="rb-text-muted">
              Уже открыто наград: {progress?.earnedCount ?? 0}
            </p>
            <div className="rb-progress-bar" aria-label="Прогресс до следующей награды">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="rb-progress-hero__foot">
              <span>{progressPercent}% до следующего подарка</span>
              <strong>{remainingDistance > 0 ? `Осталось ${km(remainingDistance)} км` : 'Награда доступна'}</strong>
            </div>
          </section>

          <section className="rb-progress-section">
            <div className="rb-summary-section__head">
              <h1 className="rb-headline font-display">Milestone-подарки</h1>
            </div>

            {loading && <p className="rb-text-muted">Загрузка milestone…</p>}
            {error && <p className="rb-text-error">{error}</p>}
            {!loading && !error && !progress?.milestones?.length && (
              <div className="glass-card rb-progress-empty">
                <Icon name="redeem" />
                <p>Milestone пока не настроены.</p>
              </div>
            )}

            <div className="rb-progress-milestones">
              {(progress?.milestones || []).map((milestone) => {
                const openable = canOpen(milestone.status);
                return (
                  <button
                    key={milestone.id}
                    type="button"
                    className={`glass-card rb-progress-card rb-progress-card--${String(milestone.status || '').toLowerCase()}`}
                    onClick={() => openable && setSelectedMilestoneId(milestone.id)}
                    disabled={!openable}
                  >
                    <div className="rb-progress-card__icon" aria-hidden>
                      <Icon name={milestone.status === 'LOCKED' ? 'lock' : 'redeem'} />
                    </div>
                    <div className="rb-progress-card__body">
                      <div className="rb-progress-card__head">
                        <strong>{milestone.name}</strong>
                        <span className={`rb-progress-status rb-progress-status--${String(milestone.status || '').toLowerCase()}`}>
                          {statusLabel(milestone.status)}
                        </span>
                      </div>
                      <p className="rb-text-muted">
                        {km(milestone.distance)} км · {rewardLabel(milestone.reward)}
                      </p>
                      {milestone.remainingKm > 0 && (
                        <p className="rb-progress-card__remaining">
                          Осталось {km(milestone.remainingKm)} км
                        </p>
                      )}
                    </div>
                    {openable && <Icon name="chevron_right" />}
                  </button>
                );
              })}
            </div>
          </section>
        </main>
      </IonContent>
      <BottomNav />
      <RewardSelectModal
        milestoneId={selectedMilestoneId}
        onClose={closeModal}
        onSelected={() => loadProgress().catch(() => {})}
      />
    </IonPage>
  );
}
