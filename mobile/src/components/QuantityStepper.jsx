import Icon from './Icon';

export const QTY_MIN = 1;
export const QTY_MAX = 5;

export default function QuantityStepper({
  value,
  onChange,
  min = QTY_MIN,
  max = QTY_MAX,
  compact = false,
  label,
  disabled = false,
}) {
  const qty = Math.min(max, Math.max(min, Number(value) || min));

  const dec = () => onChange(Math.max(min, qty - 1));
  const inc = () => onChange(Math.min(max, qty + 1));

  return (
    <div className={compact ? 'rb-qty-stepper rb-qty-stepper--compact' : 'rb-qty-stepper'}>
      {label && (
        <span className="rb-label" style={{ marginRight: compact ? 0 : 12 }}>
          {label}
        </span>
      )}
      <div className="rb-qty-stepper__controls">
        <button
          type="button"
          className="rb-qty-stepper__btn"
          onClick={dec}
          disabled={disabled || qty <= min}
          aria-label="Уменьшить"
        >
          <Icon name="remove" />
        </button>
        <span className="rb-qty-stepper__value font-display">{qty}</span>
        <button
          type="button"
          className="rb-qty-stepper__btn"
          onClick={inc}
          disabled={disabled || qty >= max}
          aria-label="Увеличить"
        >
          <Icon name="add" />
        </button>
      </div>
    </div>
  );
}
