import Icon from './Icon';

const ICONS = {
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
}) {
  const selected = methods.find((m) => m.id === value);

  return (
    <section style={{ marginBottom: 16 }}>
      <p className="rb-label" style={{ marginBottom: 10 }}>
        Способ оплаты
      </p>
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
        <label className="rb-profile-form__field" style={{ marginTop: 12 }}>
          <span className="rb-label">{selected.detailsLabel || 'Реквизиты'}</span>
          <div className="rb-input-wrap">
            <input
              className="rb-input"
              value={details || ''}
              onChange={(e) => onDetailsChange?.(e.target.value)}
              placeholder={selected.detailsLabel || ''}
            />
          </div>
        </label>
      )}
      {error && <p className="rb-text-error">{error}</p>}
    </section>
  );
}
