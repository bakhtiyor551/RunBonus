export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Наличные при доставке', needsDetails: false },
  { id: 'delivery', label: 'Доставка', needsDetails: false },
  { id: 'card', label: 'Банковская карта', needsDetails: true, detailsLabel: 'Номер карты или последние 4 цифры' },
  {
    id: 'mobile',
    label: 'Мобильный перевод',
    needsDetails: false,
    usesTransferModal: true,
  },
  { id: 'bank', label: 'Перевод на расчётный счёт', needsDetails: true, detailsLabel: 'Банк или ФИО плательщика' },
];

export function paymentMethodLabel(id) {
  if (id === 'bonus') return 'Оплата бонусами (отключено)';
  return PAYMENT_METHODS.find((m) => m.id === id)?.label || id || '—';
}

export function isValidPaymentMethod(id) {
  if (id === 'bonus') return false;
  return PAYMENT_METHODS.some((m) => m.id === id);
}

export function paymentMethodNeedsDetails(id) {
  return PAYMENT_METHODS.find((m) => m.id === id)?.needsDetails ?? false;
}
