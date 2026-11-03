import 'storage.dart';

const _unitsKey = 'runbonus_distance_units';

enum DistanceUnits { metric, imperial }

DistanceUnits getDistanceUnits() =>
    Storage.getString(_unitsKey) == 'imperial' ? DistanceUnits.imperial : DistanceUnits.metric;

Future<void> setDistanceUnits(DistanceUnits units) =>
    Storage.setString(_unitsKey, units == DistanceUnits.imperial ? 'imperial' : 'metric');

String formatDistance(double km, [DistanceUnits? units]) {
  final u = units ?? getDistanceUnits();
  if (u == DistanceUnits.imperial) return '${(km * 0.621371).toStringAsFixed(2)} mi';
  if (km < 1) return '${(km * 1000).round()} м';
  return '${km.toStringAsFixed(2)} km';
}

String formatSpeed(double kmh, [DistanceUnits? units]) {
  final u = units ?? getDistanceUnits();
  if (u == DistanceUnits.imperial) return '${(kmh * 0.621371).toStringAsFixed(1)} mph';
  return '${kmh.toStringAsFixed(1)} km/h';
}

/// Темп «5:30» (без суффикса единиц), либо «—».
String formatPace(double kmh, [DistanceUnits? units]) {
  if (kmh <= 0) return '—';
  final u = units ?? getDistanceUnits();
  var sec = 3600 / kmh;
  if (u == DistanceUnits.imperial) sec *= 1.60934;
  final m = sec ~/ 60;
  final s = (sec % 60).round();
  return '$m:${s.toString().padLeft(2, '0')}';
}
