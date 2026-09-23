import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import RewardSelectModal from '../components/RewardSelectModal';
import { fetchRewardsProgress } from '../services/rewards';

const USER_VISIBLE = {
  LOCKED: 'Закрыто',
  AVAILABLE: 'Доступно',
  CHOOSING: 'Выберите',
  SELECTED: 'Выбрано',
  PROCESSING: 'Обработка',
  READY: 'Готово',
  DELIVERED: 'Получено',
  CANCELLED: 'Отменено',
};

function km(value) {
  return (Number(value) || 0).toLocaleString('ru', { maximumFractionDigits: 2 });
}

function canOpen(status) {
  return status === 'AVAILABLE' || status === 'CHOOSING';
}

function isClaimed(status) {
  return ['SELECTED', 'PROCESSING', 'READY', 'DELIVERED'].includes(status);
}

function statusText(milestone) {
  const { status, remainingKm } = milestone;
  if (status === 'DELIVERED') return 'Получено';
  if (canOpen(status)) return 'Доступно';
  if (status === 'LOCKED') return `ещё ${km(remainingKm)} км`;
  return USER_VISIBLE[status] || status;
}

export default function ProgressPage() {
  const navigate = useNavigate();
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
        if (!cancelled) setError(err.message || 'Не удалось загрузить награды');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadProgress, searchParams]);

  const totalDistance = Number(progress?.totalDistance ?? 0);
  const milestones = useMemo(() => progress?.milestones || [], [progress]);
  const claimableCount = milestones.filter((m) => canOpen(m.status)).length;

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
          <section className="rb-rewards-page-head">
            <div>
              <h1 className="rb-headline font-display" style={{ margin: 0 }}>
                Награды
              </h1>
              <p className="rb-text-muted" style={{ margin: '8px 0 0' }}>
                {km(totalDistance)} км · {claimableCount > 0 ? `${claimableCount} доступно` : 'накопите км для подарков'}
              </p>
            </div>
            <button type="button" className="rb-btn-pill" onClick={() => navigate('/my-rewards')}>
              Мои
            </button>
          </section>

          {claimableCount > 0 && (
            <div className="glass-card rb-progress-claim-hint">
              <Icon name="redeem" />
              <p>
                {claimableCount === 1
                  ? 'Есть доступная награда — нажмите карточку, чтобы выбрать подарок'
                  : `${claimableCount} награды ждут выбора`}
              </p>
            </div>
          )}

          {loading && <p className="rb-text-muted">Загрузка…</p>}
          {error && <p className="rb-text-error">{error}</p>}

          {!loading && !error && !milestones.length && (
            <div className="glass-card rb-progress-empty">
              <Icon name="redeem" />
              <p>Контрольные точки пока не настроены.</p>
            </div>
          )}

          <div className="rb-progress-milestones">
            {milestones.map((milestone) => {
              const openable = canOpen(milestone.status);
              const claimed = isClaimed(milestone.status);
              const statusKey = String(milestone.status || '').toLowerCase();
              return (
                <button
                  key={milestone.id}
                  type="button"
                  className={`glass-card rb-progress-card rb-progress-card--${statusKey}`}
                  onClick={() => openable && setSelectedMilestoneId(milestone.id)}
                  disabled={!openable}
                >
                  <div className={`rb-progress-card__icon rb-progress-card__icon--${statusKey}`} aria-hidden>
                    <Icon name={milestone.status === 'LOCKED' ? 'lock' : claimed ? 'check_circle' : 'redeem'} />
                  </div>
                  <div className="rb-progress-card__body">
                    <div className="rb-progress-card__head">
                      <strong className="font-display">{km(milestone.distance)} км</strong>
                      <span className={`rb-progress-status rb-progress-status--${statusKey}`}>
                        {statusText(milestone)}
                      </span>
                    </div>
                    <p className="rb-text-muted">{milestone.name}</p>
                    {milestone.reward?.name && (
                      <p className="rb-progress-card__remaining">{milestone.reward.name}</p>
                    )}
                    {openable && (
                      <p className="rb-progress-card__cta">Нажмите, чтобы выбрать</p>
                    )}
                  </div>
                  {openable && <Icon name="chevron_right" />}
                </button>
              );
            })}
          </div>
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
