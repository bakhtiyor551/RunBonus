import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app_state.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/units.dart';
import '../../services/active_workout.dart';
import '../../services/challenges.dart';
import '../../workout/geolocation.dart';
import '../../workout/gps_buffer.dart';
import '../../workout/gps_filter.dart';
import '../../workout/gps_point.dart';
import '../../workout/native_workout.dart';
import '../../workout/workout_socket.dart';
import '../../workout/workout_tracker.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/hold_to_stop.dart';
import '../widgets/workout_map.dart';
import 'workout_result_view.dart';

const _ink = Color(0xFF111111);

class WorkoutPage extends StatefulWidget {
  const WorkoutPage({super.key});

  @override
  State<WorkoutPage> createState() => _WorkoutPageState();
}

class _WorkoutPageState extends State<WorkoutPage> {
  final _tracker = WorkoutTracker.instance;
  final _mapController = WorkoutMapController();
  final _units = getDistanceUnits();
  int? _workoutId;
  bool _syncing = true;
  bool _finishing = false;
  WorkoutResult? _result;
  StreamSubscription<Map<String, dynamic>>? _commands;

  @override
  void initState() {
    super.initState();
    _commands = _tracker.commands.listen(_onCommand);
    _init();
  }

  @override
  void dispose() {
    _commands?.cancel();
    super.dispose();
  }

  Future<void> _alert(String text) => showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          content: Text(text, style: RB.body(size: 15)),
          actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK'))],
        ),
      );

  Future<void> _attach(int id, {int? startedAt}) async {
    await setActiveWorkoutId(id);
    if (!mounted) return;
    setState(() {
      _workoutId = id;
      _syncing = false;
    });
    await _tracker.start(id, serverStartedAt: startedAt);
  }

  Future<void> _init() async {
    final localHint = getActiveWorkoutId() ?? _tracker.workoutId;
    // Если id известен — сразу показываем экран, не ждём сеть.
    if (localHint != null) unawaited(_attach(localHint));

    final syncFuture = syncActiveWorkoutWithServer();
    ActiveWorkoutSync? sync;
    try {
      sync = await syncFuture.timeout(const Duration(milliseconds: 3500));
    } on TimeoutException {
      if (localHint == null) {
        final late = await syncFuture.catchError((_) => const ActiveWorkoutSync());
        if (!mounted) return;
        if (late.workoutId != null) return _attach(late.workoutId!, startedAt: late.startedAt);
        context.go('/');
      }
      return;
    }
    if (!mounted) return;

    if (sync.workoutId == null) {
      if (sync.stale && localHint != null) {
        await _alert('Сохранённая тренировка на сервере не найдена (уже завершена). Начните новую с главной.');
      }
      if (!mounted) return;
      if (sync.stale || localHint == null) {
        _tracker.stop();
        context.go('/');
      }
      return;
    }

    if (sync.stale && localHint != null && localHint != sync.workoutId) {
      _alert('Подключена актуальная тренировка с сервера.');
    }
    if (sync.workoutId != localHint) await _attach(sync.workoutId!, startedAt: sync.startedAt);
  }

  Future<void> _onCommand(Map<String, dynamic> cmd) async {
    if (cmd['type'] != 'workout_force_stop') return;
    final id = _workoutId;
    _tracker.stop();
    if (id != null) {
      await clearWorkoutLocal(id);
      await GpsBuffer.clear(id).catchError((_) {});
    }
    await setActiveWorkoutId(null);
    if (!mounted) return;
    await _alert('${cmd['message'] ?? 'Пробежка аннулирована'}');
    if (mounted) context.go('/');
  }

  Future<void> _minimizeOrHome() async {
    final snap = _tracker.snapshot.value;
    if (snap != null) await LiveActivitySync.ensure(snap.live);
    _tracker.persist();
    if (Platform.isAndroid) {
      await NativeWorkout.minimizeApp();
    } else if (mounted) {
      context.go('/');
    }
  }

  Future<void> _finish() async {
    final id = _workoutId;
    if (_finishing || id == null) return;
    setState(() => _finishing = true);
    final appState = context.read<AppState>();

    _tracker.freezeForFinish();
    final snap = _tracker.finishSnapshot() ?? _tracker.snapshot.value;

    var points = prepareTrackPoints(_tracker.points);
    if (points.length < 2) {
      try {
        final pos = await getCurrentPosition();
        points = prepareTrackPoints([..._tracker.points, pos]);
      } catch (_) {}
    }
    points = sampleEvenly(points, 400);

    try {
      await _tracker.flushAllPending();
      await WorkoutSocket.disconnect();
      final raw = await Api.post('/api/workouts/$id/finish', {
        'points': points.map((p) => p.toApi()).toList(),
        'distance_km': snap?.distance ?? 0,
        'duration_seconds': snap?.seconds ?? 0,
        'moving_seconds': snap?.movingSeconds ?? 0,
        'pause_seconds': snap?.pauseSeconds ?? 0,
        'steps_count': snap?.steps ?? 0,
        'max_speed': snap?.maxSpeed ?? 0,
        'avg_speed': snap?.avgSpeed ?? 0,
      });
      final data = Map<String, dynamic>.from(raw is Map ? raw : const {});
      _tracker.stop();
      await clearWorkoutLocal(id);
      await GpsBuffer.clear(id).catchError((_) {});
      await setActiveWorkoutId(null);
      unawaited(appState.refreshProfile());

      // После первой завершённой тренировки — задание и флаг для карточки на главной.
      var challenge = data['challenge'] is Map ? Map<String, dynamic>.from(data['challenge'] as Map) : null;
      await markFinishedWorkout();
      if (challenge == null) {
        try {
          var state = await fetchChallengeState();
          if (state['challenge'] == null) {
            final next = state['nextLevel'];
            state = await startChallenge(next is Map ? next['levelId'] : null);
          }
          final ch = state['challenge'];
          if (ch is Map) challenge = Map<String, dynamic>.from(ch);
        } catch (_) {}
      }
      if (challenge != null) await cacheHomeChallenge(challenge);
      if (!mounted) return;

      if (data['challenge_completed'] == true || challenge?['status'] == 'COMPLETED') {
        context.go('/rewards');
        return;
      }
      final unlocked = data['rewards_unlocked'];
      final popup = data['reward_popup'];
      if (((unlocked is List && unlocked.isNotEmpty) || popup != null) && challenge?['status'] != 'ACTIVE') {
        final first = popup ?? (unlocked as List).first;
        final milestoneId = first is Map ? (first['milestoneId'] ?? first['milestone_id'] ?? first['id']) : null;
        context.go(milestoneId != null ? '/milestones?milestone=$milestoneId' : '/milestones');
        return;
      }
      setState(() {
        _result = WorkoutResult(
          data: data,
          trackPoints: points,
          steps: snap?.steps ?? 0,
          finishedAt: DateTime.now(),
        );
      });
    } catch (err) {
      if (err is ApiException && err.code == 'DEVICE_MISMATCH') {
        if (mounted) setState(() => _finishing = false);
        return;
      }
      final msg = err is ApiException ? err.message : '$err';
      if (err is ApiException &&
          (err.status == 404 || err.code == 'WORKOUT_NOT_ACTIVE' || msg.contains('уже завершена') || msg.contains('не найдена'))) {
        _tracker.stop();
        await clearWorkoutLocal(id);
        await GpsBuffer.clear(id).catchError((_) {});
        await setActiveWorkoutId(null);
        final sync = await syncActiveWorkoutWithServer();
        if (!mounted) return;
        await _alert(sync.workoutId != null
            ? 'Эта тренировка недоступна. На главной откройте текущую активную тренировку.'
            : 'Тренировка не найдена. Начните новую с главной.');
        if (mounted) context.go('/');
        return;
      }
      if (!mounted) return;
      await _alert(err is ApiException && err.code == 'DEVICE_REQUIRED' ? 'Обновите приложение RunBonus и повторите вход.' : msg);
      if (!mounted) return;
      setState(() => _finishing = false);
      unawaited(_tracker.start(id));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_result != null) {
      return WorkoutResultView(result: _result!, onDone: () => context.go('/'));
    }
    if (_syncing || _workoutId == null) {
      return Scaffold(
        appBar: const AppHeader(showAvatar: false),
        body: Padding(
          padding: const EdgeInsets.only(top: 48),
          child: Align(
            alignment: Alignment.topCenter,
            child: Text('Синхронизация тренировки…', style: RB.body(color: RB.onSurfaceVariant)),
          ),
        ),
      );
    }

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _minimizeOrHome();
      },
      child: ValueListenableBuilder<WorkoutSnapshot?>(
        valueListenable: _tracker.snapshot,
        builder: (context, live, _) => _buildLive(live),
      ),
    );
  }

  Widget _buildLive(WorkoutSnapshot? live) {
    final distKm = live?.distance ?? 0;
    final seconds = live?.seconds ?? 0;
    final speedKmh = live?.currentSpeed ?? 0;

    String? distValue;
    var distUnit = 'км';
    if (distKm >= 0.01) {
      if (distKm < 1 && _units != DistanceUnits.imperial) {
        distValue = '${(distKm * 1000).round()}';
        distUnit = 'м';
      } else {
        distValue = (_units == DistanceUnits.imperial ? distKm * 0.621371 : distKm).toStringAsFixed(2);
        distUnit = _units == DistanceUnits.imperial ? 'ми' : 'км';
      }
    }

    String? speedValue;
    var speedUnit = _units == DistanceUnits.imperial ? 'mph' : 'км/ч';
    if (speedKmh >= 0.3) {
      speedValue = (_units == DistanceUnits.imperial ? speedKmh * 0.621371 : speedKmh).toStringAsFixed(1);
    }

    final status = live == null
        ? ''
        : live.autoPaused
            ? 'Автопауза'
            : live.manualPaused
                ? 'Пауза'
                : live.gpsReady
                    ? ''
                    : 'Ожидание GPS…';
    final toast = (live?.gpsError.isNotEmpty ?? false) ? live!.gpsError : status;
    final topInset = MediaQuery.paddingOf(context).top;
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return Scaffold(
      backgroundColor: Colors.transparent,
      extendBody: true,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Карта на весь экран — хедер/футер только поверх, без своих фонов.
          Positioned.fill(
            child: WorkoutMap(
              points: live?.points ?? const <GpsPoint>[],
              livePosition: live?.livePosition,
              controller: _mapController,
            ),
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Material(
              type: MaterialType.transparency,
              child: Padding(
                padding: EdgeInsets.fromLTRB(12, topInset + 8, 12, 12),
                child: Stack(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(4, 28, 4, 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Expanded(flex: 10, child: _Stat(label: 'Дистанция', value: distValue, unit: distUnit)),
                          Expanded(flex: 12, child: _Stat(label: 'Время', value: formatDuration(seconds), big: true)),
                          Expanded(flex: 10, child: _Stat(label: 'Скорость', value: speedValue, unit: speedUnit)),
                        ],
                      ),
                    ),
                    Positioned(
                      left: -2,
                      top: 2,
                      child: Material(
                        color: Colors.white.withValues(alpha: 0.9),
                        shape: const CircleBorder(),
                        elevation: 2,
                        shadowColor: const Color(0x40000000),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: _minimizeOrHome,
                          child: const SizedBox.square(dimension: 36, child: Icon(Icons.arrow_back, color: _ink, size: 20)),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (toast.isNotEmpty)
            Positioned(
              top: topInset + 118,
              left: 0,
              right: 0,
              child: IgnorePointer(
                child: Center(
                  child: Container(
                    constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.86),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(color: const Color(0xD1141414), borderRadius: BorderRadius.circular(999)),
                    child: Text(toast, textAlign: TextAlign.center, style: RB.body(size: 13, color: Colors.white)),
                  ),
                ),
              ),
            ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Material(
              type: MaterialType.transparency,
              child: Padding(
                padding: EdgeInsets.fromLTRB(16, 14, 16, 14 + bottomInset),
                child: Center(
                  child: HoldToStopButton(
                    onStop: _finish,
                    enabled: !_finishing,
                    label: _finishing ? 'Завершение…' : 'Удерживайте для завершения',
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, this.unit, this.big = false});
  final String label;
  final String? value;
  final String? unit;
  final bool big;

  @override
  Widget build(BuildContext context) {
    const shadow = [Shadow(color: Color(0xCCFFFFFF), blurRadius: 10)];
    final style = RB.body(size: big ? 32 : 26, weight: FontWeight.w700, color: _ink).copyWith(
      fontStyle: FontStyle.italic,
      letterSpacing: -0.9,
      height: 1.05,
      fontFeatures: const [FontFeature.tabularFigures()],
      shadows: shadow,
    );
    return Column(
      children: [
        FittedBox(
          fit: BoxFit.scaleDown,
          child: value == null
              ? Text('—', style: style.copyWith(color: const Color(0xFF888888), fontStyle: FontStyle.normal))
              : Text.rich(TextSpan(children: [
                  TextSpan(text: value),
                  if (unit != null)
                    WidgetSpan(
                      alignment: PlaceholderAlignment.top,
                      child: Padding(
                        padding: const EdgeInsets.only(left: 3),
                        child: Text(unit!,
                            style: RB.body(size: 14, weight: FontWeight.w600, color: const Color(0xFF444444))
                                .copyWith(shadows: shadow)),
                      ),
                    ),
                ]), style: style),
        ),
        const SizedBox(height: 6),
        Text(label.toUpperCase(),
            style: RB.body(size: 11, weight: FontWeight.w600, color: const Color(0xFF555555))
                .copyWith(letterSpacing: 0.9, shadows: shadow)),
      ],
    );
  }
}

