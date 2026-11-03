import 'dart:async';
import 'dart:io';

import 'package:geolocator/geolocator.dart';

import '../core/storage.dart';
import 'gps_point.dart';

class LocationException implements Exception {
  LocationException(this.message);
  final String message;
  @override
  String toString() => message;
}

GpsPoint _fromPosition(Position p) => GpsPoint(
      latitude: p.latitude,
      longitude: p.longitude,
      speedMps: normalizeSpeedMps(p.speed),
      accuracy: p.accuracy,
      altitude: p.altitude,
      course: p.heading >= 0 ? p.heading : null,
      recordedAt: DateTime.now(),
    );

Future<void> requestLocationPermission() async {
  if (!await Geolocator.isLocationServiceEnabled()) {
    throw LocationException('Включите GPS в настройках телефона');
  }
  var perm = await Geolocator.checkPermission();
  if (perm == LocationPermission.denied) {
    perm = await Geolocator.requestPermission();
  }
  if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
    throw LocationException('Включите геолокацию для начала тренировки');
  }
  // Первый фикс может прийти позже через поток — ошибки здесь не критичны.
  try {
    await getCurrentPosition();
  } catch (_) {}
}

LocationSettings _oneShot({required bool high, required Duration timeout}) {
  return LocationSettings(
    accuracy: high ? LocationAccuracy.best : LocationAccuracy.medium,
    timeLimit: timeout,
  );
}

Future<GpsPoint> _attempts(List<({bool high, Duration timeout, Duration maxAge})> attempts) async {
  Object? lastErr;
  for (final a in attempts) {
    try {
      final last = await Geolocator.getLastKnownPosition();
      if (last != null && DateTime.now().difference(last.timestamp) <= a.maxAge) {
        return _fromPosition(last);
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: _oneShot(high: a.high, timeout: a.timeout),
      );
      return _fromPosition(pos);
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr is LocationException) throw lastErr;
  throw LocationException('GPS сигнал недоступен');
}

Future<GpsPoint> getCurrentPosition() {
  if (Platform.isAndroid) {
    return _attempts([
      (high: true, timeout: const Duration(seconds: 25), maxAge: const Duration(seconds: 5)),
      (high: true, timeout: const Duration(seconds: 25), maxAge: const Duration(seconds: 30)),
      (high: false, timeout: const Duration(seconds: 20), maxAge: const Duration(minutes: 2)),
    ]);
  }
  return _attempts([
    (high: true, timeout: const Duration(seconds: 15), maxAge: const Duration(seconds: 5)),
  ]);
}

/// Быстрый фикс для фонового опроса — не ждём десятки секунд.
Future<GpsPoint> getCurrentPositionQuick() => _attempts([
      (high: true, timeout: const Duration(seconds: 4), maxAge: const Duration(seconds: 8)),
      (high: false, timeout: const Duration(milliseconds: 3500), maxAge: const Duration(seconds: 30)),
    ]);

/// Поток GPS с фоновым режимом. На Android держит foreground-сервис с уведомлением.
StreamSubscription<Position> startBackgroundTracking(void Function(GpsPoint) onPosition) {
  final LocationSettings settings;
  if (Platform.isAndroid) {
    settings = AndroidSettings(
      accuracy: LocationAccuracy.best,
      distanceFilter: 0,
      intervalDuration: const Duration(seconds: 2),
      foregroundNotificationConfig: const ForegroundNotificationConfig(
        notificationTitle: 'RunBonus — тренировка',
        notificationText: 'GPS и шаги записываются',
        notificationChannelName: 'Тренировка',
        enableWakeLock: true,
        setOngoing: true,
      ),
    );
  } else if (Platform.isIOS) {
    settings = AppleSettings(
      accuracy: LocationAccuracy.best,
      activityType: ActivityType.fitness,
      distanceFilter: 0,
      pauseLocationUpdatesAutomatically: false,
      allowBackgroundLocationUpdates: true,
      showBackgroundLocationIndicator: true,
    );
  } else {
    settings = const LocationSettings(accuracy: LocationAccuracy.best);
  }

  // Не блокируем старт долгим getCurrentPosition — быстрый фикс параллельно.
  getCurrentPositionQuick().then(onPosition).catchError((_) {});

  return Geolocator.getPositionStream(locationSettings: settings).listen(
    (p) => onPosition(_fromPosition(p)),
    onError: (_) {},
    cancelOnError: false,
  );
}

// —— Локальное состояние активной тренировки ——

const _activeWorkoutIdKey = 'runbonus_active_workout_id';
String _workoutFile(int id) => 'runbonus_workout_$id';

Future<void> setActiveWorkoutId(int? id) =>
    Storage.setString(_activeWorkoutIdKey, id?.toString());

int? getActiveWorkoutId() => int.tryParse(Storage.getString(_activeWorkoutIdKey) ?? '');

Future<void> saveWorkoutLocal(int id, Map<String, dynamic> data) =>
    Storage.writeFileJson(_workoutFile(id), data);

Map<String, dynamic>? loadWorkoutLocal(int id) => Storage.readFileJson(_workoutFile(id));

Future<void> clearWorkoutLocal(int id) => Storage.deleteFile(_workoutFile(id));
