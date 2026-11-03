import '../core/format.dart';

class GpsPoint {
  const GpsPoint({
    required this.latitude,
    required this.longitude,
    required this.recordedAt,
    this.speedMps = 0,
    this.accuracy,
    this.altitude,
    this.course,
  });

  final double latitude;
  final double longitude;
  final DateTime recordedAt;

  /// Скорость с датчика, м/с.
  final double speedMps;
  final double? accuracy;
  final double? altitude;
  final double? course;

  /// Скорость, км/ч (как отдаёт API).
  double get speedKmh => speedMpsToKmh(speedMps);

  bool get isValidCoord =>
      latitude.isFinite && longitude.isFinite && latitude.abs() <= 90 && longitude.abs() <= 180;

  GpsPoint copyWith({DateTime? recordedAt}) => GpsPoint(
        latitude: latitude,
        longitude: longitude,
        recordedAt: recordedAt ?? this.recordedAt,
        speedMps: speedMps,
        accuracy: accuracy,
        altitude: altitude,
        course: course,
      );

  Map<String, dynamic> toJson() => {
        'latitude': latitude,
        'longitude': longitude,
        'speedMps': speedMps,
        'speed': speedKmh,
        'accuracy': accuracy,
        'altitude': altitude,
        'course': course,
        'recorded_at': recordedAt.toUtc().toIso8601String(),
      };

  /// Формат точки для API (`/points`, `/finish`, WebSocket).
  Map<String, dynamic> toApi() {
    final iso = recordedAt.toUtc().toIso8601String();
    return {
      'latitude': latitude,
      'longitude': longitude,
      'speed': speedKmh,
      'accuracy': accuracy,
      'altitude': altitude,
      'course': course,
      'timestamp': iso,
      'recorded_at': iso,
    };
  }

  static GpsPoint? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final lat = toDoubleOrNull(raw['latitude'] ?? raw['lat']);
    final lng = toDoubleOrNull(raw['longitude'] ?? raw['lng'] ?? raw['lon']);
    if (lat == null || lng == null) return null;
    final speedKmh = toDoubleOrNull(raw['speed']);
    final speedMps = toDoubleOrNull(raw['speedMps']) ?? (speedKmh != null ? speedKmh / 3.6 : 0);
    return GpsPoint(
      latitude: lat,
      longitude: lng,
      recordedAt: parseDate(raw['recorded_at'] ?? raw['timestamp']) ?? DateTime.now(),
      speedMps: speedMps,
      accuracy: toDoubleOrNull(raw['accuracy']),
      altitude: toDoubleOrNull(raw['altitude']),
      course: toDoubleOrNull(raw['course']),
    );
  }
}

/// Ниже — считаем скорость нулевой (м/с).
const gpsStationarySpeedMps = 0.2;

double normalizeSpeedMps(Object? raw) {
  final v = toDoubleOrNull(raw);
  if (v == null || !v.isFinite || v < 0) return 0;
  return v;
}

double speedMpsToKmh(double mps) {
  if (mps < gpsStationarySpeedMps) return 0;
  return (mps * 3.6 * 10).round() / 10;
}
