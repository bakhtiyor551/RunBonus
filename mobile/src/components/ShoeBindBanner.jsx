import { useNavigate } from 'react-router-dom';
import Icon from './Icon';

/** Карточка привязки кроссовок — бонусы за бег только после активации QR. */
export default function ShoeBindBanner({ user }) {
  const navigate = useNavigate();
  const needsBind = user?.needsActivation || !user?.activeShoe;

  if (!needsBind) return null;

  return (
    <section className="glass-card rb-shoe-bind-banner" style={{ marginBottom: 28, padding: 20 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
        <Icon name="directions_run" filled style={{ fontSize: 28, color: 'var(--rb-neon)', flexShrink: 0 }} />
        <div>
          <h2 className="font-display" style={{ margin: '0 0 8px', fontSize: 18, lineHeight: 1.3 }}>
            Привяжите кроссовки RunBonus для начисления бонусов
          </h2>
          <p className="rb-text-muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
            Войти в приложение, смотреть магазин и оформлять заказ можно сразу. Бонусы за бег начисляются только после
            привязки оригинальных кроссовок по QR.
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button type="button" className="rb-btn-primary" style={{ width: '100%' }} onClick={() => navigate('/activate')}>
          <Icon name="qr_code_scanner" />
          Сканировать QR
        </button>
        <button type="button" className="rb-btn-pill" style={{ width: '100%' }} onClick={() => navigate('/shop')}>
          <Icon name="storefront" />
          Купить кроссовки
        </button>
      </div>
    </section>
  );
}
