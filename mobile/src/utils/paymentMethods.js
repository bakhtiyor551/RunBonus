/** Запасной список, если API недоступен. Оплата бонусами отключена — магазин за деньги. */
export const PAYMENT_METHODS_FALLBACK = [
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

export function getPaymentMethod(methods, id) {
  return methods.find((m) => m.id === id);
}

/** Фильтр: не предлагать оплату бонусами в магазине. */
export function filterShopPaymentMethods(methods) {
  return (methods || []).filter((m) => m.id !== 'bonus');
}
