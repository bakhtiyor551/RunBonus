import 'dart:math' as math;

import 'gps_point.dart';

/// Макс. погрешность GPS (м) — точки хуже отбрасываются.
const gpsMaxAccuracyM = 15.0;

/// Для первой точки маршрута допускаем более слабый сигнал (Android / помещение).
const gpsAcquireAccuracyM = 120.0;

/// Мин. смещение между сохранёнными точками (м).
const gpsMinSegmentM = 2.5;

/// Оптимальный интервал между точками.
const gpsMinIntervalMs = 1000;

/// Слишком большой разрыв — возобновляем трек без «телепорта» в дистанцию.
const gpsMaxIntervalMs = 15000;

const gpsAutoPauseSpeedMps = 0.5;
const gpsAutoResumeSpeedMps = 0.8;
const gpsAutoPauseMs = 4000;

const speedAverageWindow = 3;

/// Лимит скорости для отсечения выбросов (км/ч).
const maxSpeedKmh = 19.0;

const _coordEps = 1e-6;
const _maxJumpMeters = 80.0;
const _maxJumpSeconds = 4.0;

double movingAverageSpeedMps(List<double> samples) {
  if (samples.isEmpty) return 0;
  final slice = samples.length > speedAverageWindow
      ? samples.sublist(samples.length - speedAverageWindow)
      : samples;
  return slice.reduce((a, b) => a + b) / slice.length;
}

double haversineMeters(double lat1, double lon1, double lat2, double lon2) {
  const r = 6371000.0;
  double rad(double d) => d * math.pi / 180;
  final dLat = rad(lat2 - lat1);
  final dLon = rad(lon2 - lon1);
  final x = math.pow(math.sin(dLat / 2), 2) +
      math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.pow(math.sin(dLon / 2), 2);
  return r * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x));
}

bool isSameCoordinates(GpsPoint a, GpsPoint b) =>
    (a.latitude - b.latitude).abs() < _coordEps && (a.longitude - b.longitude).abs() < _coordEps;

bool _passesAccuracy(GpsPoint pos, double maxAccuracyM) {
  final acc = pos.accuracy;
  if (acc != null && acc > maxAccuracyM) return false;
  if (pos.speedKmh > maxSpeedKmh) return false;
  return true;
}

class RecordDecision {
  const RecordDecision(this.record, [this.segmentMeters = 0]);
  final bool record;
  final double segmentMeters;
}

/// Фильтры точности, времени и минимального смещения перед записью в маршрут.
RecordDecision shouldRecordGpsPoint(GpsPoint? last, GpsPoint pos) {
  final maxAcc = last != null ? gpsMaxAccuracyM : gpsAcquireAccuracyM;
  if (!_passesAccuracy(pos, maxAcc)) return const RecordDecision(false);
  if (last == null) return const RecordDecision(true);
  if (isSameCoordinates(last, pos)) return const RecordDecision(false);

  final elapsedMs = pos.recordedAt.difference(last.recordedAt).inMilliseconds;
  if (elapsedMs > 0 && elapsedMs < gpsMinIntervalMs) return const RecordDecision(false);
  if (elapsedMs > gpsMaxIntervalMs) return const RecordDecision(true);

  final distM = haversineMeters(last.latitude, last.longitude, pos.latitude, pos.longitude);
  if (distM < gpsMinSegmentM) return const RecordDecision(false);
  if (pos.speedMps < gpsStationarySpeedMps) return const RecordDecision(false);

  final dt = elapsedMs > 0 ? elapsedMs / 1000 : null;
  if (dt != null && dt <= _maxJumpSeconds && distM > _maxJumpMeters) {
    return const RecordDecision(false);
  }
  return RecordDecision(true, distM);
}

/// Подготовка маршрута для отображения / отправки.
List<GpsPoint> prepareTrackPoints(Iterable<GpsPoint> points) {
  final sorted = points.toList()..sort((a, b) => a.recordedAt.compareTo(b.recordedAt));
  final out = <GpsPoint>[];
  for (final p in sorted) {
    if (shouldRecordGpsPoint(out.isEmpty ? null : out.last, p).record) out.add(p);
  }
  return out;
}

/// Сумма Haversine между соседними точками (км).
double haversineKm(Iterable<GpsPoint> points) {
  final track = prepareTrackPoints(points);
  if (track.length < 2) return 0;
  var distM = 0.0;
  for (var i = 1; i < track.length; i++) {
    distM += haversineMeters(
      track[i - 1].latitude,
      track[i - 1].longitude,
      track[i].latitude,
      track[i].longitude,
    );
  }
  return (distM / 1000 * 1000).round() / 1000;
}

double computeAvgSpeedKmh(double distanceKm, int movingSeconds) {
  if (movingSeconds <= 0 || distanceKm == 0) return 0;
  return distanceKm / movingSeconds * 3600;
}

List<T> sampleEvenly<T>(List<T> points, int maxPoints) {
  if (points.length <= maxPoints) return points;
  final out = <T>[];
  final step = (points.length - 1) / (maxPoints - 1);
  for (var i = 0; i < maxPoints - 1; i++) {
    out.add(points[(i * step).round()]);
  }
  out.add(points.last);
  return out;
}
