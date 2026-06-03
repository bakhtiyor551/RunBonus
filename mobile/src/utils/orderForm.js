import { getPaymentMethod } from './paymentMethods';
import { deliveryRequiresAddress, getDeliveryMethod } from './deliveryMethods';

export function emptyOrderForm(user) {
  return {
    customer_name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name || '',
    phone: user?.phone || '',
    city: user?.city || '',
    address: '',
    delivery_method: 'courier',
    quantity: 1,
    comment: '',
    payment_method: 'cash',
    payment_details: '',
  };
}

/** Проверка полей перед оформлением заказа. */
export function validateOrderForm(
  form,
  paymentMethods,
  deliveryMethods,
  { cartTotal = 0, availableBonus = 0 } = {}
) {
  if (!form.customer_name?.trim()) return 'Укажите имя';
  if (!form.phone?.trim()) return 'Укажите телефон';
  if (!form.city?.trim()) return 'Укажите город';

  if (!form.delivery_method) return 'Выберите способ доставки';
  const dm = getDeliveryMethod(deliveryMethods, form.delivery_method);
  if (!dm) return 'Выберите способ доставки';
  if (deliveryRequiresAddress(deliveryMethods, form.delivery_method) && !form.address?.trim()) {
    return 'Укажите адрес доставки';
  }

  const qty = Number(form.quantity);
  if (form.quantity != null && (!Number.isFinite(qty) || qty < 1 || qty > 5)) {
    return 'Количество от 1 до 5';
  }
  if (!form.payment_method) return 'Выберите способ оплаты';
  const pm = getPaymentMethod(paymentMethods, form.payment_method);
  if (!pm) return 'Выберите способ оплаты';
  if (form.payment_method === 'bonus') {
    const total = Number(cartTotal);
    const available = Number(availableBonus);
    if (!Number.isFinite(total) || total <= 0) return 'Корзина пуста';
    if (!Number.isFinite(available)) return 'Не удалось проверить баланс бонусов';
    if (total > available) {
      return `Недостаточно бонусов. Доступно: ${available} сомони, нужно: ${total} сомони`;
    }
  }

  if (form.payment_method !== 'mobile' && pm.needsDetails && !form.payment_details?.trim()) {
    return pm.detailsLabel || 'Укажите данные для оплаты';
  }
  return null;
}
