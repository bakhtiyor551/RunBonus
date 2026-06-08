/** 9 цифр мобильного номера (любой оператор, только начинается с 9). */
export function toLocalPhoneDigits(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('992')) {
    digits = digits.slice(3);
  }
  if (digits.length !== 9 || !digits.startsWith('9')) return null;
  return digits;
}

/** Нормализация телефона для Таджикистана: 992XXXXXXXXX */
export function normalizePhone(raw) {
  const local = toLocalPhoneDigits(raw);
  if (!local) return null;
  return `992${local}`;
}

export function formatPhoneDisplay(phone992) {
  const d = String(phone992 || '');
  if (d.length !== 12 || !d.startsWith('992')) return d;
  return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
}
