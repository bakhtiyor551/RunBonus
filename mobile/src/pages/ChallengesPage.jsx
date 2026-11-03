import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import ChallengeTierCard from '../components/ChallengeTierCard';
import Icon from '../components/Icon';
import {
  claimChallengeReward,
  fetchChallengeRewards,
  fetchChallengeState,
  startChallenge,
} from '../services/challenges';

function km(v) {
  return (Number(v) || 0).toLocaleString('ru', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function ClaimSheet({ challengeId, onClose, onDone }) {
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState([]);
  const [example, setExample] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [size, setSize] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState('pick'); // pick | success | next
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchChallengeRewards(challengeId)
      .then((data) => {
        if (cancelled) return;
        const opts = data.options || [];
        setOptions(opts);
        setExample(data.exampleReward || data.challenge?.exampleReward || '');
        if (opts[0]) setSelectedId(String(opts[0].id));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Ошибка');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  const selected = useMemo(
    () => options.find((o) => String(o.id) === String(selectedId)),
    [options, selectedId]
  );

  const submit = async () => {
    setError('');
    if (options.length && !selected) {
      setError('Выберите награду');
      return;
    }
    if (selected?.requiresSize && !size) {
      setError('Выберите размер');
      return;
    }
    setSaving(true);
    try {
      const data = await claimChallengeReward(challengeId, {
        rewardId: selected?.id,
        size: size || undefined,
      });
      setResult(data);
      setPhase(data.nextLevel ? 'next' : 'success');
      onDone?.(data);
    } catch (err) {
      setError(err.message || 'Не удалось получить награду');
    } finally {
      setSaving(false);
    }
  };

  const startNext = async () => {
    setSaving(true);
    setError('');
    try {
      const data = await startChallenge(result?.nextLevel?.levelId);
      onDone?.(data);
      onClose();
    } catch (err) {
      setError(err.message || 'Не удалось начать задание');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rb-detail-sheet rb-reward-modal" role="dialog" aria-modal="true">
      <button type="button" className="rb-detail-sheet__backdrop" onClick={onClose} aria-label="Закрыть" />
      <div className="rb-detail-sheet__panel glass-effect">
        <header className="rb-detail-sheet__head">
          <h2 className="font-display">
            {phase === 'pick' ? 'Забрать награду' : phase === 'next' ? 'Следующее задание' : 'Готово'}
          </h2>
          <button type="button" className="rb-header__avatar" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" />
          </button>
        </header>

        {loading && <p className="rb-text-muted">Загрузка…</p>}
        {error && <p className="rb-text-error">{error}</p>}

        {phase === 'pick' && !loading && (
          <div className="rb-reward-form">
            <p className="rb-text-muted" style={{ marginTop: 0 }}>
              🎁 Выберите награду
            </p>
            {options.length === 0 && (
              <div className="glass-card" style={{ padding: 16, marginBottom: 12 }}>
                <strong>{example || 'Награда RunBonus'}</strong>
              </div>
            )}
            <div className="rb-reward-options">
              {options.map((opt) => {
                const active = String(opt.id) === String(selectedId);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={opt.inStock === false}
                    className={`rb-reward-option glass-card${active ? ' rb-reward-option--active' : ''}`}
                    onClick={() => {
                      setSelectedId(String(opt.id));
                      setSize('');
                    }}
                  >
                    <span className="rb-label">{opt.type}</span>
                    <strong>{opt.name}</strong>
                    {opt.discountPercent != null && (
                      <p className="rb-reward-option__accent">Скидка {opt.discountPercent}%</p>
                    )}
                  </button>
                );
              })}
            </div>
            {selected?.requiresSize && selected.sizes?.length > 0 && (
              <div className="rb-reward-size-row">
                {selected.sizes.map((s) => (
                  <button
                    key={s.size}
                    type="button"
                    disabled={!s.inStock}
                    className={`rb-btn-pill rb-btn-pill--sm${size === s.size ? ' rb-btn-pill--active' : ''}`}
                    onClick={() => setSize(s.size)}
                  >
                    {s.size}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="rb-btn-primary" disabled={saving} onClick={submit} style={{ width: '100%', marginTop: 16 }}>
              {saving ? 'Отправка…' : 'Забрать награду'}
            </button>
          </div>
        )}

        {phase === 'success' && (
          <div className="rb-reward-success">
            <div className="rb-reward-success__icon">
              <Icon name="check_circle" filled />
            </div>
            <h3 className="font-display">Награда получена</h3>
            <p className="rb-text-muted">{result?.reward?.name}</p>
            {result?.reward?.promoCode && (
              <code className="rb-reward-promo-code">{result.reward.promoCode}</code>
            )}
            <button type="button" className="rb-btn-primary" onClick={onClose} style={{ width: '100%', marginTop: 16 }}>
              Закрыть
            </button>
          </div>
        )}

        {phase === 'next' && (
          <div className="rb-reward-success">
            <p className="rb-text-muted">Награда получена: {result?.reward?.name}</p>
            <div className="glass-card" style={{ padding: 16, textAlign: 'left', marginTop: 12 }}>
              <span className="rb-label">Следующее задание</span>
              <h3 className="font-display" style={{ margin: '8px 0' }}>
                🎯 {km(result.nextLevel.targetKm)} KM
              </h3>
              <p className="rb-text-muted">⏱️ {result.nextLevel.deadlineDays} дней</p>
            </div>
            <button type="button" className="rb-btn-primary" disabled={saving} onClick={startNext} style={{ width: '100%', marginTop: 16 }}>
              {saving ? 'Старт…' : 'Продолжить'}
            </button>
            <button type="button" className="rb-btn-pill" onClick={onClose} style={{ width: '100%', marginTop: 8 }}>
              Позже
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChallengesPage() {
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [claimId, setClaimId] = useState(null);

  const load = useCallback(async () => {
    const data = await fetchChallengeState();
    setState(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err.message || 'Ошибка'))
      .finally(() => setLoading(false));
  }, [load]);

  const challenge = state?.challenge;

  const onStart = async (levelId) => {
    setBusy(true);
    setError('');
    try {
      const data = await startChallenge(levelId);
      setState(data);
    } catch (err) {
      setError(err.message || 'Не удалось начать');
    } finally {
      setBusy(false);
    }
  };

  return (
    <IonPage>
      <AppHeader />
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
          <section className="rb-rewards-page-head">
            <div>
              <h1 className="font-display rb-headline">Задания</h1>
              <p className="rb-text-muted">
                L1 → L5 · цель в км · срок · награда
              </p>
            </div>
            <button type="button" className="rb-btn-pill" onClick={() => navigate('/my-rewards')}>
              Мои награды
            </button>
          </section>

          {error && <p className="rb-text-error">{error}</p>}
          {loading && <p className="rb-text-muted">Загрузка…</p>}

          {!loading && challenge?.status === 'COMPLETED' && !challenge.rewardClaimed && (
            <section className="rb-tier-banner rb-tier-banner--claim">
              <div>
                <strong className="font-display">Задание выполнено</strong>
                <p>
                  {km(challenge.currentKm)} / {km(challenge.targetKm)} KM — заберите награду
                </p>
              </div>
              <button
                type="button"
                className="rb-btn-primary"
                disabled={busy}
                onClick={() => setClaimId(challenge.id)}
              >
                Забрать
              </button>
            </section>
          )}

          {!loading && challenge?.status === 'EXPIRED' && (
            <section className="rb-tier-banner rb-tier-banner--expired">
              <div>
                <strong className="font-display">Время истекло</strong>
                <p>
                  {km(challenge.currentKm)} / {km(challenge.targetKm)} KM — прогресс сброшен
                </p>
              </div>
              <button
                type="button"
                className="rb-btn-primary"
                disabled={busy}
                onClick={() => onStart(challenge.levelId)}
              >
                {busy ? '…' : 'Заново'}
              </button>
            </section>
          )}

          {!loading && state?.allDone && (
            <section className="rb-tier-banner">
              <div>
                <strong className="font-display">Все задания пройдены</strong>
                <p>Вы чемпион RunBonus</p>
              </div>
            </section>
          )}

          <section className="rb-tier-list" aria-label="Уровни заданий">
            {(state?.levels || []).map((level) => {
              const isCurrent = challenge && Number(challenge.levelNum) === Number(level.levelNum);
              const status = isCurrent ? challenge.status : level.status;
              return (
                <ChallengeTierCard
                  key={level.levelId}
                  levelNum={level.levelNum}
                  targetKm={level.targetKm}
                  name={level.name}
                  deadlineDays={level.deadlineDays}
                  exampleReward={level.exampleReward}
                  description={level.description}
                  status={status}
                  currentKm={isCurrent ? challenge.currentKm : undefined}
                  progressPercent={isCurrent ? challenge.progressPercent : undefined}
                  remainingLabel={
                    isCurrent && status === 'ACTIVE' ? challenge.remaining?.label : undefined
                  }
                  onAction={
                    status === 'COMPLETED' && isCurrent && !challenge.rewardClaimed
                      ? () => setClaimId(challenge.id)
                      : undefined
                  }
                  actionLabel={
                    status === 'COMPLETED' && isCurrent && !challenge.rewardClaimed
                      ? 'Забрать награду'
                      : undefined
                  }
                />
              );
            })}
          </section>
        </main>
      </IonContent>
      <BottomNav />
      {claimId != null && (
        <ClaimSheet
          challengeId={claimId}
          onClose={() => setClaimId(null)}
          onDone={(data) => {
            if (data?.challenge || data?.nextLevel || data?.levels) setState(data);
          }}
        />
      )}
    </IonPage>
  );
}
