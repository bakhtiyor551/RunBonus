import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNavNoShoe from '../components/BottomNavNoShoe';
import Icon from '../components/Icon';

export default function ProductDetailPage({ user, limitedMode = true }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [size, setSize] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    customer_name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name || '',
    phone: user?.phone || '',
    city: user?.city || '',
    address: '',
    quantity: 1,
    comment: '',
  });

  useEffect(() => {
    api(`/api/mobile/products/${id}`)
      .then((p) => {
        setProduct(p);
        const first = (p.sizes || []).find((s) => s.in_stock);
        if (first) setSize(first.size);
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [id]);

  const submitOrder = async (e) => {
    e.preventDefault();
    setError('');
    if (!size) {
      setError('Выберите размер');
      return;
    }
    setSubmitting(true);
    try {
      await api('/api/mobile/orders', {
        method: 'POST',
        body: JSON.stringify({
          product_id: product.id,
          size,
          quantity: Number(form.quantity) || 1,
          ...form,
        }),
      });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Не удалось отправить заказ');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <IonPage>
        <AppHeader onBack={() => navigate(-1)} />
        <IonContent>
          <main className="rb-main">
            <p className="rb-text-muted">Загрузка…</p>
          </main>
        </IonContent>
      </IonPage>
    );
  }

  if (!product) {
    return (
      <IonPage>
        <AppHeader onBack={() => navigate(-1)} />
        <IonContent>
          <main className="rb-main">
            <p className="rb-text-muted">Товар не найден</p>
          </main>
        </IonContent>
      </IonPage>
    );
  }

  if (done) {
    return (
      <IonPage>
        <AppHeader onBack={() => navigate('/orders')} />
        <IonContent>
          <main className="rb-main" style={{ textAlign: 'center', paddingTop: 40 }}>
            <Icon name="check_circle" filled style={{ fontSize: 64, color: 'var(--rb-neon)' }} />
            <h2 className="font-display" style={{ marginTop: 16 }}>
              Ваш заказ принят
            </h2>
            <p className="rb-text-muted">Мы свяжемся с вами для подтверждения.</p>
            <button type="button" className="rb-btn-pill" style={{ marginTop: 24 }} onClick={() => navigate('/orders')}>
              Мои заказы
            </button>
          </main>
          {limitedMode && <BottomNavNoShoe />}
        </IonContent>
      </IonPage>
    );
  }

  const availableSizes = (product.sizes || []).filter((s) => s.in_stock);

  return (
    <IonPage>
      <AppHeader onBack={() => navigate(-1)} />
      <IonContent>
        <main className="rb-main">
          <div className="rb-shop-detail-hero glass-card">
            {product.image_url ? (
              <img src={product.image_url} alt="" />
            ) : (
              <Icon name="directions_run" filled style={{ fontSize: 72, color: 'var(--rb-neon)' }} />
            )}
          </div>

          <h1 className="rb-headline font-display" style={{ margin: '16px 0 4px' }}>
            {product.name}
          </h1>
          <p className="rb-display font-display" style={{ color: 'var(--rb-neon)', fontSize: 28, margin: '0 0 8px' }}>
            {product.price} сомони
          </p>
          {product.color && <p className="rb-text-muted">Цвет: {product.color}</p>}
          <p className="rb-text-muted" style={{ marginTop: 12, lineHeight: 1.5 }}>
            {product.description}
          </p>
          <p className="rb-text-muted" style={{ marginTop: 12, fontSize: 13 }}>
            Условия бонусов: бегайте в кроссовках RunBonus — получайте сомони за километры по программе уровней.
          </p>

          <section style={{ marginTop: 24 }}>
            <p className="rb-label" style={{ marginBottom: 8 }}>Размер</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {availableSizes.map((s) => (
                <button
                  key={s.size}
                  type="button"
                  className={`rb-size-chip${size === s.size ? ' rb-size-chip--active' : ''}`}
                  onClick={() => setSize(s.size)}
                >
                  {s.size}
                </button>
              ))}
            </div>
          </section>

          <form onSubmit={submitOrder} className="glass-card" style={{ padding: 20, marginTop: 24 }}>
            <h2 className="font-display" style={{ fontSize: 18, margin: '0 0 16px' }}>
              Оформить заказ
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
                    required={key !== 'address'}
                  />
                </div>
              </div>
            ))}
            <div style={{ marginBottom: 12 }}>
              <label className="rb-label" style={{ display: 'block', marginBottom: 4 }}>
                Количество
              </label>
              <div className="rb-input-wrap">
                <input
                  className="rb-input"
                  type="number"
                  min={1}
                  max={5}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
            </div>
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
              {submitting ? 'Отправка…' : 'Отправить заказ'}
            </button>
          </form>
        </main>
        {limitedMode && <BottomNavNoShoe />}
      </IonContent>
    </IonPage>
  );
}
