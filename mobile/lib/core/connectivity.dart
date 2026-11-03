import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;

import 'config.dart';

/// Стабильный онлайн-статус: сеть устройства + доступность /api/health.
class ConnectivityService with WidgetsBindingObserver {
  ConnectivityService._();
  static final instance = ConnectivityService._();

  static const _probeTimeout = Duration(seconds: 5);
  static const _probeInterval = Duration(seconds: 30);
  static const _offlineStreak = 2;

  final online = ValueNotifier<bool>(true);
  final _reconnect = StreamController<void>.broadcast();

  /// Событие «связь восстановилась» (для догрузки GPS-буфера).
  Stream<void> get onReconnect => _reconnect.stream;

  bool _deviceHasLink = true;
  bool _workoutMode = false;
  int _failStreak = 0;
  bool _probeInFlight = false;
  bool _started = false;
  Timer? _timer;

  void start() {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    Connectivity().checkConnectivity().then(_onLink);
    Connectivity().onConnectivityChanged.listen(_onLink);
    _timer = Timer.periodic(_probeInterval, (_) {
      if (!_workoutMode) _publish();
    });
    _publish();
  }

  /// Во время тренировки не опрашиваем /api/health — только сеть + WebSocket.
  void setWorkoutMode(bool active) {
    _workoutMode = active;
    if (active) {
      if (_deviceHasLink && !online.value) online.value = true;
    } else {
      _publish();
    }
  }

  void _onLink(List<ConnectivityResult> results) {
    final connected = results.any((r) => r != ConnectivityResult.none);
    final wasConnected = _deviceHasLink;
    _deviceHasLink = connected;
    if (!connected) {
      _failStreak = _offlineStreak;
      online.value = false;
      return;
    }
    if (!wasConnected) _reconnect.add(null);
    _publish();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && !_workoutMode) _publish();
  }

  Future<bool> _probe() async {
    try {
      final res = await http.get(Uri.parse('$apiUrl/api/health')).timeout(_probeTimeout);
      return res.statusCode >= 200 && res.statusCode < 300;
    } catch (_) {
      return false;
    }
  }

  Future<void> _publish() async {
    if (_probeInFlight) return;
    _probeInFlight = true;
    try {
      final bool ok;
      if (!_deviceHasLink) {
        ok = false;
      } else if (_workoutMode) {
        ok = true;
      } else {
        ok = await _probe();
      }

      if (ok) {
        _failStreak = 0;
        online.value = true;
      } else {
        _failStreak += 1;
        if (online.value && _failStreak < _offlineStreak) return;
        online.value = false;
      }
    } finally {
      _probeInFlight = false;
    }
  }

  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
  }
}
