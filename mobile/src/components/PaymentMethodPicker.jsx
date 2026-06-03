import Icon from './Icon';

const ICONS = {
  bonus: 'stars',
  cash: 'payments',
  card: 'credit_card',
  mobile: 'smartphone',
  bank: 'account_balance',
  delivery: 'local_shipping',
};

export default function PaymentMethodPicker({
  methods,
  value,
  onChange,
  details,
  onDetailsChange,
  error,
  availableBonus,
  cartTotal,
}) {
  const selected = methods.find((m) => m.id === value);

  return (
    <section style={{ marginBottom: 16 }}>
      <p className="rb-label" style={{ marginBottom: 10 }}>
        Способ оплаты
      </p>
      {value === 'bonus' && availableBonus != null && (
        <p className="rb-text-muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
          Доступно бонусов: <strong style={{ color: 'var(--rb-neon)' }}>{availableBonus}</strong> сомони
          {cartTotal > 0 && (
            <>
              {' '}
              · к оплате: <strong>{cartTotal}</strong> сомони
            </>
          )}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {methods.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`rb-payment-option${value === m.id ? ' rb-payment-option--active' : ''}`}
            onClick={() => onChange(m.id)}
          >
            <Icon name={ICONS[m.id] || 'payments'} />
            <span>{m.label}</span>
          </button>
        ))}
      </div>
      {selected?.needsDetails && (
        <div style={{ marginTop: 12 }}>
          <label className="rb-label" style={{ display: 'block', marginBottom: 4 }}>
            {selected.detailsLabel || 'Дополнительно'}
          </label>
          <div className="rb-input-wrap">
            <input
              className="rb-input"
              value={details}
              onChange={(e) => onDetailsChange(e.target.value)}
              placeholder={selected.detailsLabel}
            />
          </div>
        </div>
      )}
      {error && <p className="rb-text-error" style={{ marginTop: 8 }}>{error}</p>}
    </section>
  );
}
