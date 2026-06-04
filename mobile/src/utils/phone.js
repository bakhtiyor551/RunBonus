export const PHONE_LOCAL_LENGTH = 9;

export function digitsOnlyPhone(raw) {
  return String(raw || '').replace(/\D/g, '');
}

/** Оставляет только цифры, не больше 9. */
export function formatLocalPhoneInput(raw) {
  return digitsOnlyPhone(raw).slice(0, PHONE_LOCAL_LENGTH);
}

/** 9 цифр, начинается с 9 (мобильный Таджикистан). */
export function isValidLocalPhone(value) {
  const digits = digitsOnlyPhone(value);
  return digits.length === PHONE_LOCAL_LENGTH && digits.startsWith('9');
}

export function phoneValidationMessage(value) {
  const digits = digitsOnlyPhone(value);
  if (!digits) return 'Укажите номер телефона';
  if (digits.length !== PHONE_LOCAL_LENGTH) return `Введите ${PHONE_LOCAL_LENGTH} цифр номера`;
  if (!digits.startsWith('9')) return 'Номер должен начинаться с 9';
  return null;
}

/** Из сохранённого номера (+992… или 992…) — 9 цифр для поля ввода. */
export function phoneToLocalDigits(raw) {
  const digits = digitsOnlyPhone(raw);
  if (digits.length === 12 && digits.startsWith('992')) return digits.slice(3);
  if (digits.length === 9) return digits;
  return formatLocalPhoneInput(digits);
}

export function formatPhoneDisplay(raw) {
  const local = phoneToLocalDigits(raw);
  if (local.length !== PHONE_LOCAL_LENGTH) return String(raw || '').trim();
  return `+992 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
}
