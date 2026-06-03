import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import Icon from '../components/Icon';
import { addToCart } from '../services/cart';
import PaymentMethodPicker from '../components/PaymentMethodPicker';
import QuantityStepper from '../components/QuantityStepper';
import { emptyOrderForm, validateOrderForm } from '../utils/orderForm';
import { PAYMENT_METHODS_FALLBACK } from '../utils/paymentMethods';

export default function ProductDetailPage({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [size, setSize] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentMethods, setPaymentMethods] = useState(PAYMENT_METHODS_FALLBACK);
  const [form, setForm] = useState(() => emptyOrderForm(user));

  useEffect(() => {
    api('/api/mobile/payment-methods')
      .then(setPaymentMethods)
      .catch(() => setPaymentMethods(PAYMENT_METHODS_FALLBACK));
  }, []);

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

  const buildCartItem = () => ({
    productId: product.id,
    name: product.name,
    size,
    color: product.color,
    price: product.price,
    image_url: product.image_url,
    quantity: Number(form.quantity) || 1,
  });

  const addCartAndGo = () => {
    setError('');
    if (!size) {
      setError('Выберите размер');
      return;
    }
    addToCart(buildCartItem());
    navigate('/cart');
  };

  const buyToCart = () => {
    setError('');
    if (!size) {
      setError('Выберите размер');
      return;
    }
    const formErr = validateOrderForm(form, paymentMethods, { requireAddress: true });
    if (formErr) {
      setError(formErr);
      return;
    }
    addToCart(buildCartItem());
    navigate('/cart', {
      state: {
        checkoutForm: {
          customer_name: form.customer_name.trim(),
          phone: form.phone.trim(),
          city: form.city.trim(),
          address: form.address.trim(),
          comment: form.comment.trim(),
          payment_method: form.payment_method,
          payment_details: form.payment_details?.trim() || '',
        },
      },
    });
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
          <p className="rb-text-muted" style={{ marginTop: 8 }}>
            {product.in_stock ? 'В наличии' : 'Нет в наличии'}
          </p>
          <p className="rb-text-muted" style={{ marginTop: 12, lineHeight: 1.5 }}>
            {product.description}
          </p>

          <section style={{ marginTop: 24 }}>
            <p className="rb-label" style={{ marginBottom: 8 }}>
              Размер
            </p>
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

          <div style={{ marginBottom: 12, marginTop: 20 }}>
            <QuantityStepper
              label="Количество"
              value={form.quantity}
              onChange={(q) => setForm({ ...form, quantity: q })}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
            <button type="button" className="rb-btn-pill" style={{ flex: 1 }} onClick={addCartAndGo}>
              <Icon name="add_shopping_cart" />
              В корзину
            </button>
            <button type="button" className="rb-btn-primary" style={{ flex: 1 }} onClick={buyToCart}>
              <Icon name="shopping_cart" />
              Купить
            </button>
          </div>

          <div className="glass-card" style={{ padding: 20 }}>
            <h2 className="font-display" style={{ fontSize: 18, margin: '0 0 8px' }}>
              Данные для доставки
            </h2>
            <p className="rb-text-muted" style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.45 }}>
              Заполните поля перед «Купить». Оформление заказа — в корзине после проверки.
            </p>
            {[
              ['customer_name', 'Имя', 'text', true],
              ['phone', 'Телефон', 'tel', true],
              ['city', 'Город', 'text', true],
              ['address', 'Адрес доставки', 'text', true],
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
            <PaymentMethodPicker
              methods={paymentMethods}
              value={form.payment_method}
              onChange={(id) => setForm({ ...form, payment_method: id })}
              details={form.payment_details}
              onDetailsChange={(v) => setForm({ ...form, payment_details: v })}
            />

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
          </div>
        </main>
      </IonContent>
    </IonPage>
  );
}
