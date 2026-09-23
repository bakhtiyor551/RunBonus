import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import { fetchRewardMilestone, selectReward } from '../services/rewards';

const DEFAULT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

function rewardTypeLabel(type) {
  if (type === 'DISCOUNT') return 'Промокод';
  if (type === 'PRODUCT') return 'Подарок';
  if (type === 'SERVICE') return 'Услуга';
  return 'Награда';
}

function extractPromoCode(result) {
  return (
    result?.promoCode ||
    result?.promo_code ||
    result?.code ||
    result?.selected?.promoCode ||
    result?.selected?.promo_code ||
    result?.selection?.promoCode ||
    result?.selection?.promo_code ||
    ''
  );
}

export default function RewardSelectModal({ milestoneId, onClose, onSelected }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedRewardId, setSelectedRewardId] = useState('');
  const [size, setSize] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (!milestoneId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setSuccess(null);
    setSelectedRewardId('');
    setSize('');
    fetchRewardMilestone(milestoneId)
      .then((data) => {
        if (cancelled) return;
        setDetails(data);
        const firstAvailable = (data.options || []).find((option) => option.inStock !== false);
        if (firstAvailable) setSelectedRewardId(String(firstAvailable.id));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Не удалось загрузить подарки');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [milestoneId]);

  const selectedReward = useMemo(
    () => (details?.options || []).find((option) => String(option.id) === String(selectedRewardId)),
    [details?.options, selectedRewardId]
  );

  if (!milestoneId) return null;

  const availableSizes = selectedReward?.sizes?.length ? selectedReward.sizes : DEFAULT_SIZES;
  const needsDelivery = selectedReward && selectedReward.type !== 'DISCOUNT';
  const promoCode = extractPromoCode(success);
  const selectedType = success?.reward?.type || selectedReward?.type;

  const submit = async (e) => {
    e.preventDefault();
    if (!selectedReward) {
      setError('Выберите подарок');
      return;
    }
    if (selectedReward.inStock === false) {
      setError('Этот подарок сейчас недоступен');
      return;
    }
    if (selectedReward.requiresSize && !size) {
      setError('Выберите размер');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await selectReward({
        milestoneId,
        rewardId: selectedReward.id,
        size: selectedReward.requiresSize ? size : undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
      });
      setSuccess(result || {});
      onSelected?.(result);
    } catch (err) {
      setError(err.message || 'Не удалось выбрать подарок');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rb-detail-sheet rb-reward-modal" role="dialog" aria-modal="true">
      <button type="button" className="rb-detail-sheet__backdrop" onClick={onClose} aria-label="Закрыть" />
      <section className="rb-detail-sheet__panel glass-panel">
        <div className="rb-detail-sheet__handle" />
        <header className="rb-detail-sheet__header">
          <div>
            <p className="rb-label" style={{ margin: 0 }}>Подарок за milestone</p>
            <h2 className="rb-detail-sheet__title font-display">
              {details?.milestone?.name || 'Выберите награду'}
            </h2>
          </div>
          <button type="button" className="rb-detail-sheet__close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" />
          </button>
        </header>

        <div className="rb-detail-sheet__body">
          {loading && <p className="rb-text-muted">Загрузка вариантов…</p>}
          {error && <p className="rb-text-error">{error}</p>}

          {success ? (
            <div className="rb-reward-success">
              <div className="rb-reward-success__icon">
                <Icon name="redeem" />
              </div>
              <h3 className="font-display">Награда выбрана</h3>
              {selectedType === 'DISCOUNT' ? (
                <div className="rb-reward-promo glass-card">
                  <span className="rb-label">Ваш промокод</span>
                  <strong className="font-display">{promoCode || 'Код появится в «Мои награды»'}</strong>
                </div>
              ) : (
                <p className="rb-text-muted">
                  Мы приняли заявку. Статус доставки можно смотреть на экране «Мои награды».
                </p>
              )}
              <button type="button" className="rb-btn-pill" style={{ width: '100%' }} onClick={onClose}>
                Отлично
              </button>
            </div>
          ) : (
            !loading && (
              <form className="rb-reward-form" onSubmit={submit}>
                {details?.canSelect === false && (
                  <div className="withdraw-alert withdraw-alert--compact glass-card">
                    <Icon name="lock" className="withdraw-alert__icon" />
                    <div>
                      <strong>Выбор пока недоступен</strong>
                      <p className="rb-text-muted" style={{ margin: '4px 0 0' }}>
                        Награду можно выбрать, когда milestone станет доступным.
                      </p>
                    </div>
                  </div>
                )}

                <div className="rb-reward-options">
                  {(details?.options || []).map((option) => {
                    const disabled = option.inStock === false;
                    const active = String(option.id) === String(selectedRewardId);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`rb-reward-option glass-card${active ? ' rb-reward-option--active' : ''}${disabled ? ' rb-reward-option--disabled' : ''}`}
                        onClick={() => !disabled && setSelectedRewardId(String(option.id))}
                        disabled={disabled}
                      >
                        <div>
                          <span className="rb-label">{rewardTypeLabel(option.type)}</span>
                          <strong>{option.name}</strong>
                          {option.description && <p className="rb-text-muted">{option.description}</p>}
                          {option.discountPercent ? (
                            <p className="rb-reward-option__accent">Скидка {option.discountPercent}%</p>
                          ) : null}
                          {disabled && (
                            <p className="rb-text-error">
                              {option.unavailableReason || 'Нет в наличии'}
                            </p>
                          )}
                        </div>
                        <Icon name={active ? 'radio_button_checked' : 'radio_button_unchecked'} />
                      </button>
                    );
                  })}
                </div>

                {selectedReward?.requiresSize && (
                  <div>
                    <p className="rb-label">Размер</p>
                    <div className="rb-reward-size-row">
                      {availableSizes.map((item) => (
                        <button
                          key={item}
                          type="button"
                          className={`rb-size-chip${size === item ? ' rb-size-chip--active' : ''}`}
                          onClick={() => setSize(item)}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {needsDelivery && (
                  <div className="rb-reward-delivery">
                    <label className="withdraw-field">
                      <span className="rb-label">Телефон</span>
                      <input className="withdraw-field__input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+992…" />
                    </label>
                    <label className="withdraw-field">
                      <span className="rb-label">Город</span>
                      <input className="withdraw-field__input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ваш город" />
                    </label>
                    <label className="withdraw-field">
                      <span className="rb-label">Адрес</span>
                      <textarea className="withdraw-field__input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Куда доставить подарок" rows={3} />
                    </label>
                  </div>
                )}

                <button
                  type="submit"
                  className="rb-btn-primary"
                  disabled={submitting || details?.canSelect === false || !selectedReward}
                >
                  {submitting ? 'Сохраняем…' : 'Выбрать награду'}
                </button>
              </form>
            )
          )}
        </div>
      </section>
    </div>
  );
}
