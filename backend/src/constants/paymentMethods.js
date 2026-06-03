export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Наличные при доставке', needsDetails: false },
  { id: 'card', label: 'Банковская карта', needsDetails: true, detailsLabel: 'Номер карты или последние 4 цифры' },
  {
    id: 'mobile',
    label: 'Мобильный перевод',
    needsDetails: true,
    detailsLabel: 'Номер кошелька (Alif Mobi, DC, Эсхата)',
  },
  { id: 'bank', label: 'Перевод на расчётный счёт', needsDetails: true, detailsLabel: 'Банк или ФИО плательщика' },
];

export function paymentMethodLabel(id) {
  return PAYMENT_METHODS.find((m) => m.id === id)?.label || id || '—';
}

export function isValidPaymentMethod(id) {
  return PAYMENT_METHODS.some((m) => m.id === id);
}

export function paymentMethodNeedsDetails(id) {
  return PAYMENT_METHODS.find((m) => m.id === id)?.needsDetails ?? false;
}
