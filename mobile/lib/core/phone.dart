const phoneLocalLength = 9;

String digitsOnlyPhone(String? raw) => (raw ?? '').replaceAll(RegExp(r'\D'), '');

/// 9 цифр после +992.
String toLocalPhoneDigits(String? raw) {
  var digits = digitsOnlyPhone(raw);
  if (digits.startsWith('992')) digits = digits.substring(3);
  return digits.length > phoneLocalLength ? digits.substring(0, phoneLocalLength) : digits;
}

String? phoneValidationMessage(String? value) {
  final digits = toLocalPhoneDigits(value);
  if (digits.isEmpty) return 'Укажите номер телефона';
  if (digits.length != phoneLocalLength) return 'Введите $phoneLocalLength цифр номера';
  return null;
}

String formatPhoneDisplay(String? raw) {
  final local = toLocalPhoneDigits(raw);
  if (local.length != phoneLocalLength) return (raw ?? '').trim();
  return '+992 ${local.substring(0, 2)} ${local.substring(2, 5)} ${local.substring(5)}';
}
