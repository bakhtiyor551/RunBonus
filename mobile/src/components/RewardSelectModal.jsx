import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import { fetchRewardMilestone, selectReward } from '../services/rewards';

const DEFAULT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const DEFAULT_COLORS = ['Чёрный', 'Белый', 'Красный'];

function rewardTypeLabel(type) {
  if (type === 'DISCOUNT') return 'Скидка';
  if (type === 'PRODUCT') return 'Подарок';
  if (type === 'SPECIAL') return 'Специальный';
  if (type === 'VIP') return 'VIP';
  return 'Награда';
}

function normalizeSizes(sizes) {
  if (!sizes?.length) return DEFAULT_SIZES.map((size) => ({ size, inStock: true }));
  return sizes.map((item) => {
    if (typeof item === 'string') return { size: item, inStock: true, available: null };
    return {
      size: item.size,
      inStock: item.inStock !== false && (item.available == null || item.available > 0),
      available: item.available,
    };
  });
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
  const [color, setColor] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (!milestoneId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setSuccess(null);
    setConfirming(false);
    setSelectedRewardId('');
    setSize('');
    setColor('');
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

  const sizeOptions = normalizeSizes(selectedReward?.sizes);
  const colorOptions = selectedReward?.colors?.length ? selectedReward.colors : selectedReward?.hasColors ? DEFAULT_COLORS : [];
  const needsDelivery = selectedReward && selectedReward.type !== 'DISCOUNT';
  const promoCode = extractPromoCode(success);
  const selectedType = success?.reward?.type || selectedReward?.type || success?.selected?.type;

  const beginConfirm = (e) => {
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
    setError('');
    setConfirming(true);
  };

  const submit = async () => {
    if (!selectedReward) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await selectReward({
        milestoneId,
        rewardId: selectedReward.id,
        size: selectedReward.requiresSize ? size : undefined,
        color: color || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
      });
      setSuccess(result || {});
      setConfirming(false);
      onSelected?.(result);
    } catch (err) {
      setError(err.message || 'Не удалось выбрать подарок');
      setConfirming(false);
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
            <p className="rb-label" style={{ margin: 0 }}>
              {details?.milestone?.distance ? `${details.milestone.distance} км достигнуто` : 'Подарок'}
            </p>
            <h2 className="rb-detail-sheet__title font-display">
              {confirming ? 'Вы уверены?' : details?.milestone?.name || 'Выберите награду'}
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
                <Icon name="check_circle" />
              </div>
              <h3 className="font-display">Награда выбрана</h3>
              <p className="rb-text-muted">{selectedReward?.name || success?.selected?.name}</p>
              {selectedType === 'DISCOUNT' ? (
                <div className="rb-reward-promo glass-card">
                  <span className="rb-label">Ваш промокод</span>
                  <strong className="font-display">{promoCode || 'Код появится в «Мои награды»'}</strong>
                  <button
                    type="button"
                    className="rb-btn-pill"
                    style={{ marginTop: 12 }}
                    onClick={() => promoCode && navigator.clipboard?.writeText(promoCode)}
                    disabled={!promoCode}
                  >
                    Скопировать
                  </button>
                </div>
              ) : (
                <p className="rb-text-muted">Мы обрабатываем заказ — статус смотрите в «Мои награды»</p>
              )}
              <button type="button" className="rb-btn-primary" style={{ width: '100%' }} onClick={onClose}>
                Готово
              </button>
            </div>
          ) : confirming ? (
            <div className="rb-reward-confirm">
              <p className="rb-text-muted" style={{ marginBottom: 12 }}>
                После подтверждения изменить выбранную награду нельзя.
              </p>
              <div className="glass-card rb-reward-confirm__card">
                <span className="rb-label">{rewardTypeLabel(selectedReward?.type)}</span>
                <h3 className="font-display">{selectedReward?.name}</h3>
                {size && <p className="rb-text-muted">Размер: {size}</p>}
                {color && <p className="rb-text-muted">Цвет: {color}</p>}
              </div>
              <div className="rb-reward-confirm__actions">
                <button type="button" className="rb-btn-outline" onClick={() => setConfirming(false)} disabled={submitting}>
                  Отмена
                </button>
                <button type="button" className="rb-btn-primary" onClick={submit} disabled={submitting}>
                  {submitting ? 'Сохраняем…' : 'Подтвердить'}
                </button>
              </div>
            </div>
          ) : (
            !loading && (
              <form className="rb-reward-form" onSubmit={beginConfirm}>
                {details?.canSelect === false && (
                  <div className="rb-reward-locked glass-card">
                    <Icon name="lock" />
                    <div>
                      <strong>Выбор пока недоступен</strong>
                      <p className="rb-text-muted" style={{ margin: '4px 0 0' }}>
                        Награду можно выбрать, когда контрольная точка станет доступной.
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
                        onClick={() => {
                          if (disabled) return;
                          setSelectedRewardId(String(option.id));
                          setSize('');
                          setColor('');
                        }}
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
                            <p className="rb-text-error">{option.unavailableReason || 'Нет в наличии'}</p>
                          )}
                        </div>
                        <Icon name={active ? 'radio_button_checked' : 'radio_button_unchecked'} />
                      </button>
                    );
                  })}
                </div>

                {selectedReward?.requiresSize && (
                  <div>
                    <p className="rb-label">Выберите размер</p>
                    <div className="rb-reward-size-row">
                      {sizeOptions.map((item) => (
                        <button
                          key={item.size}
                          type="button"
                          className={`rb-size-chip${size === item.size ? ' rb-size-chip--active' : ''}`}
                          onClick={() => item.inStock !== false && setSize(item.size)}
                          disabled={item.inStock === false}
                        >
                          {item.size}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {colorOptions.length > 0 && (
                  <div>
                    <p className="rb-label">Цвет</p>
                    <div className="rb-reward-size-row">
                      {colorOptions.map((c) => {
                        const value = typeof c === 'string' ? c : c.name;
                        return (
                          <button
                            key={value}
                            type="button"
                            className={`rb-size-chip${color === value ? ' rb-size-chip--active' : ''}`}
                            onClick={() => setColor(value)}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {needsDelivery && (
                  <div className="rb-reward-delivery">
                    <label className="rb-reward-field">
                      <span className="rb-label">Телефон</span>
                      <input className="rb-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+992…" />
                    </label>
                    <label className="rb-reward-field">
                      <span className="rb-label">Город</span>
                      <input className="rb-input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ваш город" />
                    </label>
                    <label className="rb-reward-field">
                      <span className="rb-label">Адрес</span>
                      <textarea className="rb-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Куда доставить подарок" rows={3} />
                    </label>
                  </div>
                )}

                <button
                  type="submit"
                  className="rb-btn-primary"
                  disabled={details?.canSelect === false || !selectedReward}
                >
                  Выбрать
                </button>
              </form>
            )
          )}
        </div>
      </section>
    </div>
  );
}
