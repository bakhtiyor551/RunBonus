import { getPaymentMethod } from './paymentMethods';

export function emptyOrderForm(user) {
  return {
    customer_name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name || '',
    phone: user?.phone || '',
    city: user?.city || '',
    address: '',
    quantity: 1,
    comment: '',
    payment_method: 'cash',
    payment_details: '',
  };
}

/** Проверка полей перед оформлением заказа. */
export function validateOrderForm(form, paymentMethods, { requireAddress = true } = {}) {
  if (!form.customer_name?.trim()) return 'Укажите имя';
  if (!form.phone?.trim()) return 'Укажите телефон';
  if (!form.city?.trim()) return 'Укажите город';
  if (requireAddress && !form.address?.trim()) return 'Укажите адрес доставки';
  const qty = Number(form.quantity);
  if (form.quantity != null && (!Number.isFinite(qty) || qty < 1 || qty > 5)) {
    return 'Количество от 1 до 5';
  }
  if (!form.payment_method) return 'Выберите способ оплаты';
  const pm = getPaymentMethod(paymentMethods, form.payment_method);
  if (!pm) return 'Выберите способ оплаты';
  // Мобильный перевод: кошелёк и чек — в модальном окне после «Оформить»
  if (form.payment_method !== 'mobile' && pm.needsDetails && !form.payment_details?.trim()) {
    return pm.detailsLabel || 'Укажите данные для оплаты';
  }
  return null;
}
