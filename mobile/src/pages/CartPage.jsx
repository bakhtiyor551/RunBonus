import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import PaymentMethodPicker from '../components/PaymentMethodPicker';
import DeliveryMethodPicker from '../components/DeliveryMethodPicker';
import Icon from '../components/Icon';
import QuantityStepper from '../components/QuantityStepper';
import { getCart, removeFromCart, clearCart, setCartItemQuantity } from '../services/cart';
import { emptyOrderForm, validateOrderForm } from '../utils/orderForm';
import MobileTransferModal from '../components/MobileTransferModal';
import { showToast } from '../utils/toast';
import { PAYMENT_METHODS_FALLBACK } from '../utils/paymentMethods';
import { DELIVERY_METHODS_FALLBACK, deliveryRequiresAddress } from '../utils/deliveryMethods';

export default function CartPage({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState(PAYMENT_METHODS_FALLBACK);
  const [deliveryMethods, setDeliveryMethods] = useState(DELIVERY_METHODS_FALLBACK);
  const [availableBonus, setAvailableBonus] = useState(user?.available_balance ?? user?.balance ?? 0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [mobileModalOpen, setMobileModalOpen] = useState(false);

  const [form, setForm] = useState(() => ({
    ...emptyOrderForm(user),
    ...(location.state?.checkoutForm || {}),
  }));

  useEffect(() => {
    Promise.all([api('/api/mobile/payment-methods'), api('/api/mobile/delivery-methods')])
      .then(([payData, delivList]) => {
        const list = Array.isArray(payData) ? payData : payData?.methods || PAYMENT_METHODS_FALLBACK;
        const normalized = list.map((m) =>
          m.id === 'mobile' ? { ...m, needsDetails: false, usesTransferModal: true } : m
        );
        setPaymentMethods(normalized.length ? normalized : PAYMENT_METHODS_FALLBACK);
        if (!Array.isArray(payData) && payData?.available_bonus != null) {
          setAvailableBonus(Number(payData.available_bonus));
        }
        const dList = Array.isArray(delivList) ? delivList : DELIVERY_METHODS_FALLBACK;
        setDeliveryMethods(dList.length ? dList : DELIVERY_METHODS_FALLBACK);
      })
      .catch(() => {
        setPaymentMethods(PAYMENT_METHODS_FALLBACK);
        setDeliveryMethods(DELIVERY_METHODS_FALLBACK);
      });
  }, []);

  useEffect(() => {
    setItems(getCart());
  }, [location.key]);

  const itemsTotal = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
  const selectedDelivery = deliveryMethods.find((m) => m.id === form.delivery_method);
  const deliveryFee = Number(selectedDelivery?.price) || 0;
  const total = itemsTotal + deliveryFee;

  const placeOrders = async (mobilePayment = null) => {
    const cartItems = getCart();
    if (!cartItems.length) {
      await showToast('Корзина пуста');
      return;
    }

    setSubmitting(true);
    try {
      let receiptUrl = null;
      if (form.payment_method === 'mobile' && mobilePayment?.payment_receipt_base64) {
        const uploaded = await api('/api/mobile/order-receipt', {
          method: 'POST',
          body: JSON.stringify({ payment_receipt_base64: mobilePayment.payment_receipt_base64 }),
        });
        receiptUrl = uploaded.receipt_url;
      }

      const payload = {
        customer_name: form.customer_name.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        address: form.address.trim(),
        delivery_method: form.delivery_method,
        comment: form.comment.trim(),
        payment_method: form.payment_method,
        payment_details: mobilePayment?.payment_details || form.payment_details?.trim() || '',
        payment_receipt_url: receiptUrl,
      };

      for (let i = 0; i < cartItems.length; i++) {
        const item = cartItems[i];
        await api('/api/mobile/orders', {
          method: 'POST',
          body: JSON.stringify({
            product_id: item.productId,
            size: item.size,
            quantity: item.quantity,
            apply_delivery_fee: i === 0,
            ...payload,
          }),
        });
      }

      clearCart();
      setItems([]);
      setMobileModalOpen(false);
      setDone(true);
    } catch (err) {
      await showToast(err.message || 'Не удалось оформить заказ');
    } finally {
      setSubmitting(false);
    }
  };

  const checkout = async (e) => {
    e.preventDefault();
    if (!items.length) {
      await showToast('Корзина пуста');
      return;
    }
    const formErr = validateOrderForm(form, paymentMethods, deliveryMethods, {
      cartTotal: total,
      availableBonus,
    });
    if (formErr) {
      await showToast(formErr);
      return;
    }
    if (form.payment_method === 'mobile') {
      setMobileModalOpen(true);
      return;
    }
    await placeOrders();
  };

  const handleMobileConfirm = async (mobilePayment) => {
    await placeOrders(mobilePayment);
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
            <p className="rb-text-muted">
              {form.payment_method === 'bonus'
                ? 'Оплачено бонусами. Мы свяжемся с вами для доставки.'
                : 'Мы свяжемся с вами для подтверждения и оплаты.'}
            </p>
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
                      <p className="rb-text-muted" style={{ margin: '4px 0 8px', fontSize: 13 }}>
                        Размер {item.size}
                        {item.color ? ` · ${item.color}` : ''}
                      </p>
                      <QuantityStepper
                        compact
                        value={item.quantity}
                        onChange={(q) => setItems(setCartItemQuantity(idx, q))}
                      />
                      <p className="rb-display font-display" style={{ margin: '8px 0 0', fontSize: 18, color: 'var(--rb-neon)' }}>
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

              <div className="glass-card" style={{ padding: 14, marginBottom: 16 }}>
                <p className="rb-text-muted" style={{ margin: '0 0 4px', fontSize: 13 }}>
                  Товары: {itemsTotal} сомони
                </p>
                {deliveryFee > 0 && (
                  <p className="rb-text-muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
                    Доставка: {deliveryFee} сомони
                  </p>
                )}
                <p className="rb-headline font-display" style={{ margin: 0 }}>
                  Итого: {total} сомони
                </p>
              </div>

              <form onSubmit={checkout} className="glass-card" style={{ padding: 20 }} noValidate>
                <h2 className="font-display" style={{ fontSize: 18, margin: '0 0 16px' }}>
                  Оформление заказа
                </h2>
                <DeliveryMethodPicker
                  methods={deliveryMethods}
                  value={form.delivery_method}
                  onChange={(id) => setForm({ ...form, delivery_method: id })}
                />

                {[
                  ['customer_name', 'Имя', 'text'],
                  ['phone', 'Телефон', 'tel'],
                  ['city', 'Город', 'text'],
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

                {deliveryRequiresAddress(deliveryMethods, form.delivery_method) && (
                  <div style={{ marginBottom: 12 }}>
                    <label className="rb-label" style={{ display: 'block', marginBottom: 4 }}>
                      Адрес доставки
                    </label>
                    <div className="rb-input-wrap">
                      <input
                        className="rb-input"
                        type="text"
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                {form.delivery_method === 'pickup' && (
                  <p className="rb-text-muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
                    Самовывоз — адрес не требуется. Мы сообщим, когда заказ будет готов.
                  </p>
                )}

                <PaymentMethodPicker
                  methods={paymentMethods}
                  value={form.payment_method}
                  onChange={(id) =>
                    setForm({
                      ...form,
                      payment_method: id,
                      payment_details: id === 'mobile' ? '' : form.payment_details,
                    })
                  }
                  details={form.payment_details}
                  onDetailsChange={(v) => setForm({ ...form, payment_details: v })}
                  availableBonus={availableBonus}
                  cartTotal={total}
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
                <button type="submit" className="rb-btn-primary" disabled={submitting} style={{ width: '100%' }}>
                  {submitting ? 'Оформление…' : 'Оформить заказ'}
                </button>
              </form>
            </>
          )}
        </main>
        <BottomNav />
      </IonContent>

      <MobileTransferModal
        open={mobileModalOpen}
        totalAmount={total}
        submitting={submitting}
        onClose={() => !submitting && setMobileModalOpen(false)}
        onConfirm={handleMobileConfirm}
      />
    </IonPage>
  );
}
