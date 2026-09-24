import { useNavigate } from 'react-router-dom';
import Icon from './Icon';

/** Баннер: кроссовки активируются после доставки заказа из магазина. */
export default function ShoeBindBanner({ user }) {
  const navigate = useNavigate();
  const needsBind = user?.needsActivation || !user?.activeShoe;

  if (!needsBind) return null;

  return (
    <section className="glass-card rb-shoe-bind-banner" style={{ marginBottom: 28, padding: 20 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
        <Icon name="local_shipping" filled style={{ fontSize: 28, color: 'var(--rb-neon)', flexShrink: 0 }} />
        <div>
          <h2 className="font-display" style={{ margin: '0 0 8px', fontSize: 18, lineHeight: 1.3 }}>
            Кроссовки RunBonus
          </h2>
          <p className="rb-text-muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
            Купите кроссовки в магазине. После статуса «Доставлен» они активируются автоматически — можно
            бегать и копить километры.
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button type="button" className="rb-btn-primary" style={{ width: '100%' }} onClick={() => navigate('/shop')}>
          <Icon name="storefront" />
          Магазин
        </button>
        <button type="button" className="rb-btn-pill" style={{ width: '100%' }} onClick={() => navigate('/orders')}>
          <Icon name="shopping_bag" />
          Мои заказы
        </button>
      </div>
    </section>
  );
}
