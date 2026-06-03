export const DELIVERY_METHODS_FALLBACK = [
  { id: 'courier', label: 'Доставка курьером', requiresAddress: true, price: 25 },
  { id: 'pickup', label: 'Самовывоз', requiresAddress: false, price: 0 },
];

export function getDeliveryMethod(methods, id) {
  return methods.find((m) => m.id === id);
}

export function deliveryRequiresAddress(methods, id) {
  const m = getDeliveryMethod(methods, id);
  return m?.requiresAddress ?? true;
}
