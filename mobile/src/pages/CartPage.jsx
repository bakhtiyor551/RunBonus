import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import { getCart, removeFromCart, clearCart } from '../services/cart';
import { emptyOrderForm, validateOrderForm } from '../utils/orderForm';

export default function CartPage({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const [form, setForm] = useState(() => ({
    ...emptyOrderForm(user),
    ...(location.state?.checkoutForm || {}),
  }));

  const refreshCart = () => setItems(getCart());

  useEffect(() => {
    refreshCart();
  }, [location.key]);

  const total = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);

  const checkout = async (e) => {
    e.preventDefault();
    setError('');
    if (!items.length) {
      setError('Корзина пуста');
      return;
    }
    const formErr = validateOrderForm(form, { requireAddress: true });
    if (formErr) {
      setError(formErr);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        customer_name: form.customer_name.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        address: form.address.trim(),
        comment: form.comment.trim(),
      };
      for (const item of items) {
        await api('/api/mobile/orders', {
          method: 'POST',
          body: JSON.stringify({
            product_id: item.productId,
            size: item.size,
            quantity: item.quantity,
            ...payload,
          }),
        });
      }
      clearCart();
      setDone(true);
    } catch (err) {
      setError(err.message || 'Не удалось оформить заказ');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <IonPage>
        <AppHeader onBack={() => navigate('/shop')} />
        <IonContent>
          <main className="rb-main" style={{ textAlign: 'center', paddingTop: 40 }}>
            <Icon name="check_circle" filled style={{ fontSize: 64, color: 'var(--rb-neon)' }} />
            <h2 className="font-display" style={{ marginTop: 16 }}>
              Заказ оформлен
            </h2>
            <p className="rb-text-muted">Мы свяжемся с вами для подтверждения.</p>
            <button type="button" className="rb-btn-pill" style={{ marginTop: 24 }} onClick={() => navigate('/orders')}>
              Мои заказы
            </button>
          </main>
          <BottomNav />
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <AppHeader onBack={() => navigate('/shop')} />
      <IonContent>
        <main className="rb-main">
          <h1 className="rb-headline font-display" style={{ marginBottom: 16 }}>
            Корзина
          </h1>

          {!items.length && (
            <div className="glass-card" style={{ padding: 24, textAlign: 'center' }}>
              <p className="rb-text-muted">Корзина пуста</p>
              <button type="button" className="rb-btn-pill" style={{ marginTop: 16 }} onClick={() => navigate('/shop')}>
                В магазин
              </button>
            </div>
          )}

          {items.length > 0 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                {items.map((item, idx) => (
                  <div key={`${item.productId}-${item.size}-${idx}`} className="glass-card" style={{ padding: 14, display: 'flex', gap: 12 }}>
                    {item.image_url ? (
                      <img src={item.image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                    ) : (
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 8,
                          background: 'var(--rb-surface-high)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name="directions_run" />
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <strong>{item.name}</strong>
                      <p className="rb-text-muted" style={{ margin: '4px 0', fontSize: 13 }}>
                        Размер {item.size}
                        {item.color ? ` · ${item.color}` : ''} · ×{item.quantity}
                      </p>
                      <p className="rb-display font-display" style={{ margin: 0, fontSize: 18, color: 'var(--rb-neon)' }}>
                        {(Number(item.price) || 0) * (Number(item.quantity) || 1)} сомони
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rb-header__avatar"
                      aria-label="Удалить"
                      onClick={() => setItems(removeFromCart(idx))}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                ))}
              </div>

              <p className="rb-headline font-display" style={{ marginBottom: 16 }}>
                Итого: {total} сомони
              </p>

              <form onSubmit={checkout} className="glass-card" style={{ padding: 20 }} noValidate>
                <h2 className="font-display" style={{ fontSize: 18, margin: '0 0 16px' }}>
                  Оформление заказа
                </h2>
                {[
                  ['customer_name', 'Имя', 'text'],
                  ['phone', 'Телефон', 'tel'],
                  ['city', 'Город', 'text'],
                  ['address', 'Адрес доставки', 'text'],
                ].map(([key, label, type]) => (
                  <div key={key} style={{ marginBottom: 12 }}>
                    <label className="rb-label" style={{ display: 'block', marginBottom: 4 }}>
                      {label}
                    </label>
                    <div className="rb-input-wrap">
                      <input
                        className="rb-input"
                        type={type}
                        value={form[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
                <div style={{ marginBottom: 12 }}>
                  <label className="rb-label" style={{ display: 'block', marginBottom: 4 }}>
                    Комментарий
                  </label>
                  <div className="rb-input-wrap">
                    <input
                      className="rb-input"
                      value={form.comment}
                      onChange={(e) => setForm({ ...form, comment: e.target.value })}
                      placeholder="Необязательно"
                    />
                  </div>
                </div>
                {error && <p className="rb-text-error">{error}</p>}
                <button type="submit" className="rb-btn-primary" disabled={submitting} style={{ width: '100%' }}>
                  {submitting ? 'Оформление…' : 'Оформить заказ'}
                </button>
              </form>
            </>
          )}
        </main>
        <BottomNav />
      </IonContent>
    </IonPage>
  );
}
