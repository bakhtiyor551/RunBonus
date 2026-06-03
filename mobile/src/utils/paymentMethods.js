/** Запасной список, если API недоступен */
export const PAYMENT_METHODS_FALLBACK = [
  { id: 'bonus', label: 'Оплата бонусами', needsDetails: false },
  { id: 'cash', label: 'Наличные при доставке', needsDetails: false },
  { id: 'card', label: 'Банковская карта', needsDetails: true, detailsLabel: 'Номер карты или последние 4 цифры' },
  {
    id: 'mobile',
    label: 'Мобильный перевод',
    needsDetails: false,
    usesTransferModal: true,
  },
  { id: 'bank', label: 'Перевод на расчётный счёт', needsDetails: true, detailsLabel: 'Банк или ФИО плательщика' },
];

export function getPaymentMethod(methods, id) {
  return methods.find((m) => m.id === id);
}
