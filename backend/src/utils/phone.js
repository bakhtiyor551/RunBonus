/** Нормализация телефона для Таджикистана: 992XXXXXXXXX */
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 12 && digits.startsWith('992')) {
    return digits;
  }
  if (digits.length === 9 && digits.startsWith('9')) {
    return `992${digits}`;
  }
  if (digits.length === 10 && digits.startsWith('992')) {
    return digits.slice(0, 12);
  }
  return null;
}

export function formatPhoneDisplay(phone992) {
  const d = String(phone992 || '');
  if (d.length !== 12 || !d.startsWith('992')) return d;
  return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
}
