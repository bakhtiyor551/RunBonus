import 'package:intl/intl.dart';

String _pad(int n) => n.toString().padLeft(2, '0');

double toDouble(Object? v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

int toInt(Object? v) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? double.tryParse(v)?.toInt() ?? 0;
  return 0;
}

double? toDoubleOrNull(Object? v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v);
  return null;
}

/// HH:MM:SS всегда.
String formatClock(num totalSeconds) {
  final t = totalSeconds.floor().clamp(0, 1 << 31);
  return '${_pad(t ~/ 3600)}:${_pad((t % 3600) ~/ 60)}:${_pad(t % 60)}';
}

/// MM:SS, либо HH:MM:SS если есть часы.
String formatDuration(num totalSeconds) {
  final t = totalSeconds.floor();
  final h = t ~/ 3600;
  final m = (t % 3600) ~/ 60;
  final s = t % 60;
  if (h > 0) return '${_pad(h)}:${_pad(m)}:${_pad(s)}';
  return '${_pad(m)}:${_pad(s)}';
}

/// Число в русской локали: «1 234,5».
String formatNumber(num? value, {int minFraction = 0, int maxFraction = 2}) {
  final f = NumberFormat.decimalPattern('ru')
    ..minimumFractionDigits = minFraction
    ..maximumFractionDigits = maxFraction;
  return f.format(value ?? 0);
}

String formatKm(Object? value, {int minFraction = 0, int maxFraction = 2}) =>
    formatNumber(toDouble(value), minFraction: minFraction, maxFraction: maxFraction);

DateTime? parseDate(Object? iso) {
  if (iso == null) return null;
  return DateTime.tryParse('$iso')?.toLocal();
}

bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

String formatWorkoutDate(Object? iso) {
  final d = parseDate(iso);
  if (d == null) return '';
  if (_sameDay(d, DateTime.now())) return 'Сегодня, ${DateFormat.Hm('ru').format(d)}';
  return DateFormat('d MMM', 'ru').format(d);
}

String dayLabel(Object? iso) {
  final d = parseDate(iso);
  if (d == null) return 'Тренировка';
  final now = DateTime.now();
  if (_sameDay(d, now)) return 'Сегодня';
  if (_sameDay(d, now.subtract(const Duration(days: 1)))) return 'Вчера';
  return DateFormat('d MMMM', 'ru').format(d);
}

String formatDateTime(Object? iso) {
  final d = parseDate(iso);
  if (d == null) return '—';
  return DateFormat('d MMM y, HH:mm', 'ru').format(d);
}

String formatDateTimeLong(Object? iso) {
  final d = parseDate(iso);
  if (d == null) return '—';
  return DateFormat('dd MMMM y, HH:mm', 'ru').format(d);
}

String formatMoney(Object? n) {
  final v = toDoubleOrNull(n);
  if (v == null || !v.isFinite) return '—';
  return '${formatNumber(v)} с.';
}

/// Темп в формате 5'30".
String formatPaceTicks(double? secPerKm) {
  if (secPerKm == null || !secPerKm.isFinite || secPerKm <= 0) return '—';
  final total = secPerKm.round();
  return "${total ~/ 60}'${_pad(total % 60)}\"";
}
