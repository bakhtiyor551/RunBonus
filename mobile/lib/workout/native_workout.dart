import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

import '../core/format.dart';

/// Нативная часть: шагомер (CMPedometer / TYPE_STEP_COUNTER) и Live Activity (iOS).
class NativeWorkout {
  NativeWorkout._();

  static const _channel = MethodChannel('runbonus/workout');
  static const _smsChannel = EventChannel('runbonus/sms_otp');

  static Future<T?> _call<T>(String method, [Map<String, Object?>? args]) async {
    try {
      return await _channel.invokeMethod<T>(method, args);
    } on MissingPluginException {
      return null;
    } on PlatformException catch (e) {
      debugPrint('[NativeWorkout] $method failed: ${e.message}');
      return null;
    }
  }

  static Future<void> startSession() async {
    if (Platform.isAndroid) {
      final status = await Permission.activityRecognition.request();
      if (!status.isGranted) return;
    }
    await _call<Object>('startSession');
  }

  static Future<void> stopSession() => _call<Object>('stopSession');

  static Future<int> getSteps() async {
    final res = await _call<Map<Object?, Object?>>('getSteps');
    return toInt(res?['steps']);
  }

  static Future<int> getDailySteps() async {
    final res = await _call<Map<Object?, Object?>>('getDailySteps');
    return toInt(res?['steps']);
  }

  // —— Live Activity (iOS 16.2+) ——

  static Map<String, Object?> _livePayload(LiveSnapshot s) => {
        'title': 'RunBonus — тренировка',
        'elapsedSeconds': s.seconds,
        'distanceKm': s.distance,
        'speedKmh': s.currentSpeed,
        'steps': s.steps,
        'isPaused': s.paused,
      };

  static Future<bool> updateLiveActivity(LiveSnapshot s) async {
    if (!Platform.isIOS) return false;
    final res = await _call<Map<Object?, Object?>>('updateLiveActivity', _livePayload(s));
    return res?['ok'] == true || res?['active'] == true;
  }

  static Future<void> endLiveActivity() async {
    if (!Platform.isIOS) return;
    await _call<Object>('endLiveActivity');
  }

  /// Коды из SMS (Android SMS Retriever).
  static Stream<String> smsCodes() {
    if (!Platform.isAndroid) return const Stream.empty();
    return _smsChannel.receiveBroadcastStream().where((e) => e is String).cast<String>();
  }

  static Future<void> minimizeApp() async {
    if (Platform.isAndroid) {
      await _call<Object>('minimizeApp');
    }
  }
}

class LiveSnapshot {
  const LiveSnapshot({
    required this.seconds,
    required this.distance,
    required this.currentSpeed,
    required this.steps,
    required this.paused,
  });

  final int seconds;
  final double distance;
  final double currentSpeed;
  final int steps;
  final bool paused;

  String get key =>
      '$seconds|${distance.toStringAsFixed(3)}|${currentSpeed.toStringAsFixed(1)}|$steps|$paused';
}

/// Синхронизация Live Activity без лишних вызовов при неизменных данных.
class LiveActivitySync {
  LiveActivitySync._();

  static bool _enabled = false;
  static String _lastKey = '';

  static Future<void> ensure(LiveSnapshot s) async {
    if (!Platform.isIOS) return;
    _enabled = await NativeWorkout.updateLiveActivity(s);
    _lastKey = s.key;
  }

  static Future<void> sync(LiveSnapshot s) async {
    if (!Platform.isIOS) return;
    if (_enabled && s.key == _lastKey) return;
    await ensure(s);
  }

  static Future<void> stop() async {
    _enabled = false;
    _lastKey = '';
    await NativeWorkout.endLiveActivity();
  }
}
