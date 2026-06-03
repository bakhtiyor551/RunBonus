export function emptyOrderForm(user) {
  return {
    customer_name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name || '',
    phone: user?.phone || '',
    city: user?.city || '',
    address: '',
    quantity: 1,
    comment: '',
  };
}

/** Проверка полей перед оформлением заказа. */
export function validateOrderForm(form, { requireAddress = true } = {}) {
  if (!form.customer_name?.trim()) return 'Укажите имя';
  if (!form.phone?.trim()) return 'Укажите телефон';
  if (!form.city?.trim()) return 'Укажите город';
  if (requireAddress && !form.address?.trim()) return 'Укажите адрес доставки';
  const qty = Number(form.quantity);
  if (form.quantity != null && (!Number.isFinite(qty) || qty < 1 || qty > 5)) {
    return 'Количество от 1 до 5';
  }
  return null;
}
