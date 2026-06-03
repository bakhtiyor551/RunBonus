import Icon from './Icon';

const ICONS = {
  courier: 'local_shipping',
  pickup: 'store',
};

export default function DeliveryMethodPicker({ methods, value, onChange }) {
  return (
    <section style={{ marginBottom: 16 }}>
      <p className="rb-label" style={{ marginBottom: 10 }}>
        Способ доставки
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {methods.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`rb-payment-option${value === m.id ? ' rb-payment-option--active' : ''}`}
            onClick={() => onChange(m.id)}
          >
            <Icon name={ICONS[m.id] || 'local_shipping'} />
            <span style={{ flex: 1, textAlign: 'left' }}>
              {m.label}
              {Number(m.price) > 0 ? (
                <span className="rb-text-muted" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                  +{Number(m.price)} сомони
                </span>
              ) : (
                <span className="rb-text-muted" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                  Бесплатно
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
