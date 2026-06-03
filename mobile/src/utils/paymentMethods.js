/** Запасной список, если API недоступен */
export const PAYMENT_METHODS_FALLBACK = [
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

export function getPaymentMethod(methods, id) {
  return methods.find((m) => m.id === id);
}
