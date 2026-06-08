export const PHONE_LOCAL_LENGTH = 9;

export function digitsOnlyPhone(raw) {
  return String(raw || '').replace(/\D/g, '');
}

/** 9 цифр после +992. */
export function toLocalPhoneDigits(raw) {
  let digits = digitsOnlyPhone(raw);
  if (digits.startsWith('992')) {
    digits = digits.slice(3);
  }
  return digits.slice(0, PHONE_LOCAL_LENGTH);
}

/** Оставляет только цифры, не больше 9. */
export function formatLocalPhoneInput(raw) {
  return toLocalPhoneDigits(raw);
}

/** 9 цифр после +992. */
export function isValidLocalPhone(value) {
  const digits = toLocalPhoneDigits(value);
  return digits.length === PHONE_LOCAL_LENGTH;
}

export function phoneValidationMessage(value) {
  const digits = toLocalPhoneDigits(value);
  if (!digits) return 'Укажите номер телефона';
  if (digits.length !== PHONE_LOCAL_LENGTH) return `Введите ${PHONE_LOCAL_LENGTH} цифр номера`;
  return null;
}

/** Из сохранённого номера (+992… или 992…) — 9 цифр для поля ввода. */
export function phoneToLocalDigits(raw) {
  return toLocalPhoneDigits(raw);
}

export function formatPhoneDisplay(raw) {
  const local = phoneToLocalDigits(raw);
  if (local.length !== PHONE_LOCAL_LENGTH) return String(raw || '').trim();
  return `+992 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
}
