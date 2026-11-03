import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';

import '../core/api.dart';
import '../core/connectivity.dart';
import '../core/format.dart';
import 'geolocation.dart';
import 'gps_buffer.dart';
import 'gps_filter.dart';
import 'gps_point.dart';
import 'native_workout.dart';
import 'workout_socket.dart';

class WorkoutSnapshot {
  const WorkoutSnapshot({
    required this.workoutId,
    this.distance = 0,
    this.seconds = 0,
    this.movingSeconds = 0,
    this.pauseSeconds = 0,
    this.currentSpeed = 0,
    this.maxSpeed = 0,
    this.avgSpeed = 0,
    this.steps = 0,
    this.manualPaused = false,
    this.autoPaused = false,
    this.gpsReady = false,
    this.gpsError = '',
    this.points = const [],
    this.livePosition,
  });

  final int workoutId;
  final double distance;
  final int seconds;
  final int movingSeconds;
  final int pauseSeconds;
  final double currentSpeed;
  final double maxSpeed;
  final double avgSpeed;
  final int steps;
  final bool manualPaused;
  final bool autoPaused;
  final bool gpsReady;
  final String gpsError;
  final List<GpsPoint> points;
  final GpsPoint? livePosition;

  bool get paused => manualPaused || autoPaused;

  LiveSnapshot get live => LiveSnapshot(
        seconds: seconds,
        distance: distance,
        currentSpeed: currentSpeed,
        steps: steps,
        paused: paused,
      );
}

class _Session {
  _Session({
    required this.workoutId,
    required this.points,
    required this.startedAt,
    required this.distanceMeters,
  });

  final int workoutId;
  List<GpsPoint> points;
  final int startedAt;
  double distanceMeters;

  double distance = 0;
  int seconds = 0;
  int movingSeconds = 0;
  int pauseSeconds = 0;
  int totalPausedMs = 0;
  bool paused = false;
  int? pausedAt;
  bool autoPaused = false;
  int? autoPausedAt;
  int? lowSpeedSince;
  List<double> speedSamplesMps = [];
  double currentSpeed = 0;
  double maxSpeed = 0;
  double avgSpeed = 0;
  int steps = 0;
  int restoredSteps = 0;
  bool gpsReady = false;
  String gpsError = '';
  GpsPoint? livePosition;
  bool serverStale = false;
  bool anchorBuffered = false;
  bool finishing = false;

  Timer? timer;
  Timer? syncTimer;
  Timer? pollTimer;
  Timer? acquireTimer;
  Timer? stepsTimer;
  Timer? liveActivityTimer;
  StreamSubscription<Position>? gps;
  StreamSubscription<void>? reconnectSub;
}

/// Активная тренировка: GPS, автопауза, буфер точек, синхронизация с сервером.
class WorkoutTracker with WidgetsBindingObserver {
  WorkoutTracker._();
  static final instance = WorkoutTracker._();

  static const _syncInterval = Duration(seconds: 4);
  static const _pausedSyncInterval = Duration(seconds: 8);
  static const _batchSize = 80;
  static const _backgroundPoll = Duration(seconds: 4);
  static const _foregroundPoll = Duration(seconds: 8);
  static const _acquirePoll = Duration(milliseconds: 2500);
  static const _autoPauseGraceMs = 45000;
  static const _uiEmitMinMs = 1000;
  static const _persistMinMs = 10000;

  final snapshot = ValueNotifier<WorkoutSnapshot?>(null);
  final _commands = StreamController<Map<String, dynamic>>.broadcast();

  /// Команды сервера (`workout_force_stop` и т.п.).
  Stream<Map<String, dynamic>> get commands => _commands.stream;

  _Session? _s;
  int _lastUiEmitAt = 0;
  int _lastPersistAt = 0;
  Timer? _persistTimer;
  bool _flushInFlight = false;
  bool _pollInFlight = false;
  int _lastAnchorFlushAt = 0;
  bool _observing = false;

  int? get workoutId => _s?.workoutId;
  bool get isActive => _s != null;
  List<GpsPoint> get points => _s?.points ?? const [];

  int _now() => DateTime.now().millisecondsSinceEpoch;

  bool get _frozen => _s != null && (_s!.paused || _s!.autoPaused);

  int _totalPausedMsNow() {
    final s = _s!;
    var ms = s.totalPausedMs;
    if (s.paused && s.pausedAt != null) ms += _now() - s.pausedAt!;
    if (s.autoPaused && s.autoPausedAt != null) ms += _now() - s.autoPausedAt!;
    return ms;
  }

  void _syncElapsed() {
    final s = _s;
    if (s == null) return;
    final pausedMs = _totalPausedMsNow();
    final elapsed = ((_now() - s.startedAt - pausedMs) / 1000).floor();
    s.movingSeconds = elapsed < 0 ? 0 : elapsed;
    if (s.movingSeconds > s.seconds) s.seconds = s.movingSeconds;
    s.pauseSeconds = pausedMs ~/ 1000;
    s.avgSpeed = computeAvgSpeedKmh(s.distance, s.movingSeconds);
  }

  WorkoutSnapshot _buildSnapshot() {
    final s = _s!;
    return WorkoutSnapshot(
      workoutId: s.workoutId,
      distance: s.distance,
      seconds: s.seconds,
      movingSeconds: s.movingSeconds,
      pauseSeconds: s.pauseSeconds,
      currentSpeed: s.currentSpeed,
      maxSpeed: s.maxSpeed,
      avgSpeed: s.avgSpeed,
      steps: s.steps,
      manualPaused: s.paused,
      autoPaused: s.autoPaused,
      gpsReady: s.gpsReady,
      gpsError: s.gpsError,
      points: sampleEvenly(s.points, 400),
      livePosition: s.livePosition,
    );
  }

  void _emit({bool force = false}) {
    if (_s == null) return;
    final now = _now();
    if (!force && now - _lastUiEmitAt < _uiEmitMinMs) return;
    _lastUiEmitAt = now;
    _syncElapsed();
    final snap = _buildSnapshot();
    snapshot.value = snap;
    LiveActivitySync.sync(snap.live);
  }

  void _restartSyncTimer() {
    final s = _s;
    if (s == null) return;
    s.syncTimer?.cancel();
    s.syncTimer = Timer.periodic(
      s.paused || s.autoPaused ? _pausedSyncInterval : _syncInterval,
      (_) => _flushPointsToServer(),
    );
  }

  void _updateDisplaySpeed(GpsPoint pos) {
    final s = _s!;
    s.speedSamplesMps.add(pos.speedMps);
    if (s.speedSamplesMps.length > 6) {
      s.speedSamplesMps = s.speedSamplesMps.sublist(s.speedSamplesMps.length - 6);
    }
    final kmh = speedMpsToKmh(movingAverageSpeedMps(s.speedSamplesMps));
    s.currentSpeed = kmh;
    if (kmh > s.maxSpeed) s.maxSpeed = kmh;
  }

  void _processAutoPause(GpsPoint pos) {
    final s = _s!;
    if (s.paused || !s.gpsReady) return;
    if (s.points.isEmpty && _now() - s.startedAt < _autoPauseGraceMs) return;

    final mps = pos.speedMps;
    if (s.autoPaused) {
      if (mps >= gpsAutoResumeSpeedMps) {
        if (s.autoPausedAt != null) s.totalPausedMs += _now() - s.autoPausedAt!;
        s.autoPaused = false;
        s.autoPausedAt = null;
        s.lowSpeedSince = null;
        s.currentSpeed = speedMpsToKmh(mps);
        _restartSyncTimer();
      }
      return;
    }

    if (mps < gpsAutoPauseSpeedMps) {
      if (s.lowSpeedSince == null) {
        s.lowSpeedSince = _now();
      } else if (_now() - s.lowSpeedSince! >= gpsAutoPauseMs) {
        s.autoPaused = true;
        s.autoPausedAt = _now();
        s.currentSpeed = 0;
        s.lowSpeedSince = null;
        _restartSyncTimer();
      }
    } else {
      s.lowSpeedSince = null;
    }
  }

  void _onGpsPosition(GpsPoint pos) {
    final s = _s;
    if (s == null || s.finishing) return;

    final prevPaused = s.paused || s.autoPaused;
    final prevSpeed = s.currentSpeed;
    s.livePosition = pos;
    if (!s.gpsReady) {
      s.gpsReady = true;
      s.gpsError = '';
    }
    _ensureAnchorBuffered();
    _processAutoPause(pos);

    if (_frozen) {
      s.currentSpeed = 0;
      final pauseChanged = prevPaused != (s.paused || s.autoPaused);
      if (pauseChanged || (prevSpeed - s.currentSpeed).abs() > 0.3) _emit();
      return;
    }
    _updateDisplaySpeed(pos);

    final decision = shouldRecordGpsPoint(s.points.isEmpty ? null : s.points.last, pos);
    if (!decision.record) {
      if ((prevSpeed - s.currentSpeed).abs() > 0.5) _emit();
      return;
    }

    s.points = [...s.points, pos];
    s.distanceMeters += decision.segmentMeters;
    s.distance = (s.distanceMeters / 1000 * 1000).round() / 1000;
    s.gpsError = '';
    GpsBuffer.add(s.workoutId, pos).catchError((_) {});
    _schedulePersist();
    _emit(force: true);
  }

  Future<void> _pollPositionOnce() async {
    if (_s == null || _pollInFlight || _s!.finishing) return;
    _pollInFlight = true;
    try {
      _onGpsPosition(await getCurrentPositionQuick());
    } catch (_) {
      // GPS временно недоступен.
    } finally {
      _pollInFlight = false;
    }
  }

  void _restartPoll(Duration interval) {
    final s = _s;
    if (s == null) return;
    s.pollTimer?.cancel();
    s.pollTimer = Timer.periodic(interval, (_) => _pollPositionOnce());
  }

  Future<void> _ensureAnchorBuffered() async {
    final s = _s;
    if (s == null || s.livePosition == null || s.points.isNotEmpty || s.anchorBuffered) return;
    if (_now() - _lastAnchorFlushAt < 3000) return;
    _lastAnchorFlushAt = _now();
    s.anchorBuffered = true;
    await GpsBuffer.add(s.workoutId, s.livePosition!);
  }

  // —— Сохранение локально ——

  void _schedulePersist({bool force = false}) {
    if (_s == null) return;
    final now = _now();
    if (force || now - _lastPersistAt >= _persistMinMs) {
      _lastPersistAt = now;
      _persistTimer?.cancel();
      _persistTimer = null;
      persist();
      return;
    }
    _persistTimer ??= Timer(Duration(milliseconds: _persistMinMs - (now - _lastPersistAt)), () {
      _persistTimer = null;
      _lastPersistAt = _now();
      persist();
    });
  }

  void persist() {
    final s = _s;
    if (s == null) return;
    _syncElapsed();
    saveWorkoutLocal(s.workoutId, {
      'points': s.points.map((p) => p.toJson()).toList(),
      'startedAt': s.startedAt,
      'seconds': s.seconds,
      'movingSeconds': s.movingSeconds,
      'pauseSeconds': s.pauseSeconds,
      'maxSpeed': s.maxSpeed,
      'steps': s.steps,
      'paused': s.paused,
      'pausedAt': s.pausedAt,
      'totalPausedMs': s.totalPausedMs,
    });
  }

  // —— Отправка на сервер ——

  void _handleServerCommand(Map<String, dynamic> msg) {
    if (msg['type'] == 'workout_force_stop' && _s != null) {
      _s!.serverStale = true;
      freezeForFinish();
    }
    _commands.add(msg);
  }

  Future<void> _uploadBatch(List<Map<String, dynamic>> batch) async {
    final s = _s;
    if (s == null || batch.isEmpty) return;

    final seen = <String>{};
    final deduped = batch.where((p) => seen.add('${p['latitude']},${p['longitude']},${p['recorded_at']}')).toList();
    if (deduped.isEmpty) return;

    if (WorkoutSocket.isOpen) {
      try {
        await WorkoutSocket.sendPoints(deduped, s.steps);
        return;
      } catch (_) {}
    }
    if (!WorkoutSocket.isConnecting) {
      try {
        await WorkoutSocket.connect(s.workoutId, onCommand: _handleServerCommand);
        if (WorkoutSocket.isOpen) {
          await WorkoutSocket.sendPoints(deduped, s.steps);
          return;
        }
      } catch (_) {}
    }
    await Api.post('/api/workouts/${s.workoutId}/points', {
      'points': deduped,
      'steps_count': s.steps,
    });
  }

  Map<String, dynamic> _clampRecordedAt(GpsPoint point) {
    final s = _s!;
    if (point.recordedAt.millisecondsSinceEpoch < s.startedAt) {
      return point.copyWith(recordedAt: DateTime.fromMillisecondsSinceEpoch(s.startedAt)).toApi();
    }
    return point.toApi();
  }

  Future<void> _flushPointsToServer() async {
    if (_s == null || _s!.serverStale || _flushInFlight) return;
    _flushInFlight = true;
    try {
      var sentAny = false;
      for (var loops = 0; loops < 12; loops++) {
        final s = _s;
        if (s == null || s.serverStale) return;
        final pending = await GpsBuffer.pending(s.workoutId, limit: _batchSize);
        if (pending.isEmpty) {
          if (!sentAny && s.livePosition != null && s.points.isEmpty && !s.anchorBuffered) {
            await _ensureAnchorBuffered();
            continue;
          }
          return;
        }
        try {
          await _uploadBatch(pending.map((r) => _clampRecordedAt(r.point)).toList());
          await GpsBuffer.delete(pending.map((r) => r.id).toList());
          sentAny = true;
          if (pending.length < _batchSize) return;
        } catch (err) {
          if (err is ApiException &&
              (err.status == 404 ||
                  err.message.contains('не найдена') ||
                  err.message.contains('workout_not_active'))) {
            s.serverStale = true;
          }
          return;
        }
      }
    } finally {
      _flushInFlight = false;
    }
  }

  /// Выгрузить весь pending-буфер (при восстановлении сети / перед finish).
  Future<void> flushAllPending() async {
    for (var guard = 0; guard < 80; guard++) {
      final s = _s;
      if (s == null || s.serverStale) return;
      final before = await GpsBuffer.pending(s.workoutId, limit: 1);
      if (before.isEmpty) return;
      await _flushPointsToServer();
      final after = await GpsBuffer.pending(s.workoutId, limit: 1);
      if (after.isNotEmpty && after.first.id == before.first.id) return;
    }
  }

  // —— Жизненный цикл сессии ——

  Future<void> start(int workoutId, {int? serverStartedAt}) async {
    if (_s?.workoutId == workoutId) {
      _syncElapsed();
      _attachLiveActivity();
      WorkoutSocket.connect(workoutId, onCommand: _handleServerCommand).catchError((_) {});
      _flushPointsToServer();
      _emit(force: true);
      return;
    }

    stop();

    final saved = loadWorkoutLocal(workoutId);
    final savedPoints = (saved?['points'] as List?)?.map(GpsPoint.fromJson).whereType<GpsPoint>() ?? const [];
    final points = prepareTrackPoints(savedPoints);
    final localStart = toInt(saved?['startedAt']);
    final serverStart = (serverStartedAt ?? 0) > 0 ? serverStartedAt : null;
    final startedAt = localStart > 0 && serverStart != null
        ? (localStart < serverStart ? localStart : serverStart)
        : (localStart > 0 ? localStart : (serverStart ?? _now()));
    final distanceKm = haversineKm(points);
    final savedSeconds = toInt(saved?['seconds']);

    final s = _Session(
      workoutId: workoutId,
      points: points,
      startedAt: startedAt,
      distanceMeters: distanceKm * 1000,
    )
      ..distance = distanceKm
      ..seconds = savedSeconds
      ..movingSeconds = toInt(saved?['movingSeconds'] ?? savedSeconds)
      ..pauseSeconds = toInt(saved?['pauseSeconds'])
      ..totalPausedMs = toInt(saved?['totalPausedMs'])
      ..paused = saved?['paused'] == true
      ..pausedAt = saved?['pausedAt'] == null ? null : toInt(saved?['pausedAt'])
      ..maxSpeed = toDouble(saved?['maxSpeed'])
      ..steps = toInt(saved?['steps'])
      ..restoredSteps = toInt(saved?['steps'])
      ..gpsReady = points.isNotEmpty
      ..livePosition = points.isNotEmpty ? points.last : null;
    _s = s;

    if (!_observing) {
      WidgetsBinding.instance.addObserver(this);
      _observing = true;
    }

    _syncElapsed();
    _emit(force: true);
    ConnectivityService.instance.setWorkoutMode(true);

    // Сокет / буфер / GPS — параллельно, без ожидания на старте.
    unawaited(_boot(s));

    s.acquireTimer = Timer.periodic(_acquirePoll, (t) {
      if (_s != s) return t.cancel();
      if (s.gpsReady && s.livePosition != null) return t.cancel();
      _pollPositionOnce();
    });
    s.timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_s != s) return;
      if (!_frozen) _syncElapsed();
      _schedulePersist();
      _emit();
    });
    _restartSyncTimer();
    _restartPoll(_foregroundPoll);
    s.reconnectSub = ConnectivityService.instance.onReconnect.listen((_) {
      if (_s != s) return;
      WorkoutSocket.connect(s.workoutId, onCommand: _handleServerCommand)
          .then((_) => flushAllPending())
          .catchError((_) {});
    });
    _attachLiveActivity();
  }

  Future<void> _boot(_Session s) async {
    try {
      await GpsBuffer.clear(s.workoutId);
      if (s.points.isNotEmpty) {
        await GpsBuffer.addAll(
          s.workoutId,
          s.points.where((p) => p.recordedAt.millisecondsSinceEpoch >= s.startedAt),
        );
      }
    } catch (_) {}

    WorkoutSocket.connect(s.workoutId, onCommand: _handleServerCommand).catchError((_) {});

    try {
      await requestLocationPermission();
    } catch (err) {
      if (_s == s) {
        s.gpsError = '$err';
        _emit(force: true);
      }
    }

    try {
      await NativeWorkout.startSession();
      s.stepsTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
        if (_s != s) return;
        s.steps = s.restoredSteps + await NativeWorkout.getSteps();
      });
    } catch (_) {}

    if (_s != s) return;
    if (s.gpsError.isEmpty) {
      try {
        s.gps = startBackgroundTracking(_onGpsPosition);
        _pollPositionOnce();
      } catch (err) {
        if (_s == s) {
          s.gpsError = 'Не удалось запустить GPS';
          _emit(force: true);
        }
      }
    }
    _flushPointsToServer();
  }

  LiveSnapshot? _liveSnapshot() {
    if (_s == null) return null;
    _syncElapsed();
    return _buildSnapshot().live;
  }

  void _attachLiveActivity() {
    final s = _s;
    if (s == null) return;
    final snap = _liveSnapshot();
    if (snap != null) LiveActivitySync.ensure(snap);
    s.liveActivityTimer?.cancel();
    s.liveActivityTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      final snap = _liveSnapshot();
      if (snap != null) LiveActivitySync.sync(snap);
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_s == null) return;
    if (state == AppLifecycleState.resumed) {
      _restartPoll(_foregroundPoll);
      resume();
    } else if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      _restartPoll(_backgroundPoll);
      persist();
      final snap = _liveSnapshot();
      if (snap != null) LiveActivitySync.ensure(snap);
    }
  }

  void pause() {
    final s = _s;
    if (s == null || s.paused) return;
    if (s.autoPaused && s.autoPausedAt != null) {
      s.totalPausedMs += _now() - s.autoPausedAt!;
      s.autoPaused = false;
      s.autoPausedAt = null;
    }
    s.lowSpeedSince = null;
    s.paused = true;
    s.pausedAt = _now();
    s.currentSpeed = 0;
    _restartSyncTimer();
    persist();
    _emit(force: true);
    Api.post('/api/workouts/${s.workoutId}/pause').catchError((_) => null);
  }

  void resumeTracking() {
    final s = _s;
    if (s == null || !s.paused) return;
    if (s.pausedAt != null) s.totalPausedMs += _now() - s.pausedAt!;
    s.paused = false;
    s.pausedAt = null;
    _restartSyncTimer();
    _pollPositionOnce();
    persist();
    _emit(force: true);
    Api.post('/api/workouts/${s.workoutId}/resume').catchError((_) => null);
  }

  void togglePause() {
    final s = _s;
    if (s == null || s.autoPaused) return;
    s.paused ? resumeTracking() : pause();
  }

  /// После возврата из фона — обновить время и GPS.
  void resume() {
    final s = _s;
    if (s == null || s.finishing) return;
    _syncElapsed();
    _attachLiveActivity();
    if (!WorkoutSocket.isOpen) {
      WorkoutSocket.connect(s.workoutId, onCommand: _handleServerCommand).catchError((_) {});
    }
    _pollPositionOnce();
    _flushPointsToServer();
    _emit(force: true);
  }

  /// Остановить таймер и GPS при завершении (сессия остаётся для flush/finish).
  void freezeForFinish() {
    final s = _s;
    if (s == null || s.finishing) return;
    s.finishing = true;
    _syncElapsed();
    for (final t in [s.timer, s.syncTimer, s.pollTimer, s.acquireTimer]) {
      t?.cancel();
    }
    s.gps?.cancel();
    s.gps = null;
    s.currentSpeed = 0;
    _emit(force: true);
  }

  WorkoutSnapshot? finishSnapshot() {
    if (_s == null) return null;
    _syncElapsed();
    return _buildSnapshot();
  }

  void stop() {
    final s = _s;
    if (s == null) return;
    _persistTimer?.cancel();
    _persistTimer = null;
    for (final t in [s.timer, s.syncTimer, s.pollTimer, s.acquireTimer, s.stepsTimer, s.liveActivityTimer]) {
      t?.cancel();
    }
    s.gps?.cancel();
    s.reconnectSub?.cancel();
    LiveActivitySync.stop();
    NativeWorkout.stopSession();
    ConnectivityService.instance.setWorkoutMode(false);
    WorkoutSocket.disconnect();
    _s = null;
    snapshot.value = null;
  }
}
