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
            <span>{m.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
