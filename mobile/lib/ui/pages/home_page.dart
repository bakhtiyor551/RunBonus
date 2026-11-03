import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app_state.dart';
import '../../core/api.dart';
import '../../core/connectivity.dart';
import '../../core/device_id.dart';
import '../../core/format.dart';
import '../../services/active_workout.dart';
import '../../services/challenges.dart';
import '../../workout/geolocation.dart';
import '../../workout/workout_tracker.dart';
import '../theme.dart';
import '../widgets/bottom_nav.dart';
import '../widgets/workout_detail_sheet.dart';

String _kmNum(Object? v) => formatNumber(toDouble(v), minFraction: 2, maxFraction: 2);

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  bool _starting = false;
  List<Map<String, dynamic>> _workouts = [];
  Map<String, dynamic>? _challenge = cachedHomeChallenge();
  int? _activeWorkoutId = WorkoutTracker.instance.workoutId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _refreshActiveWorkout() async {
    final sync = await syncActiveWorkoutWithServer();
    final next = sync.workoutId ?? WorkoutTracker.instance.workoutId;
    if (sync.offline && next == null) return;
    if (mounted) setState(() => _activeWorkoutId = next);
  }

  Future<void> _load() async {
    final results = await Future.wait<Object?>([
      Api.get('/api/workouts/history').catchError((_) => <dynamic>[]),
      fetchChallengeState().then<Map<String, dynamic>?>((v) => v).catchError((_) => null),
    ]);
    final history = results[0];
    final list = (history is List ? history : const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    final finished = list.where((w) => w['status'] != null && w['status'] != 'in_progress').toList();
    if (finished.isNotEmpty) await markFinishedWorkout();

    var state = results[1] as Map<String, dynamic>?;
    final next = state?['nextLevel'];
    if (finished.isNotEmpty && state != null && state['challenge'] == null && next is Map && next['canStart'] == true) {
      try {
        state = await startChallenge(next['levelId']);
      } catch (_) {}
    }
    if (finished.isNotEmpty && state?['challenge'] == null) {
      try {
        state = await startChallenge();
      } catch (_) {}
    }

    final ch = state?['challenge'];
    if (!mounted) return;
    setState(() {
      _workouts = list;
      if (ch is Map) _challenge = Map<String, dynamic>.from(ch);
    });
    if (ch is Map) cacheHomeChallenge(Map<String, dynamic>.from(ch));
    await _refreshActiveWorkout();
  }

  Future<void> _alert(String title, [String? text]) => showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(title, style: RB.headline(size: 18)),
          content: text != null ? Text(text, style: RB.body(color: RB.onSurfaceVariant)) : null,
          actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK'))],
        ),
      );

  Future<void> _openWorkout(int id) async {
    await setActiveWorkoutId(id);
    if (!mounted) return;
    setState(() => _activeWorkoutId = id);
    context.go('/workout');
  }

  Future<void> _startWorkout(bool shoesLocked) async {
    if (_starting) return;
    if (shoesLocked) return context.go('/orders');
    setState(() => _starting = true);
    final appState = context.read<AppState>();
    try {
      if (!ConnectivityService.instance.online.value) {
        await _alert('Нужно подключение к интернету');
        return;
      }
      final profile = await appState.refreshProfile();
      if (profile?['activeShoe'] == null || profile?['needsActivation'] == true) {
        await _alert('🔒 Тренировки недоступны', 'Для начала тренировки необходимо активировать RunBonus-кроссовки.');
        if (mounted) context.go('/orders');
        return;
      }
      final shoe = profile!['activeShoe'];
      final data = await Api.post('/api/workouts/start', {
        'shoeId': shoe is Map ? shoe['id'] : profile['activeShoeId'],
        'deviceId': getDeviceId(),
      });
      final rawId = data is Map ? (data['workoutId'] ?? data['id']) : null;
      if (rawId == null) throw ApiException('Сервер не вернул id тренировки');
      await _openWorkout(toInt(rawId));
    } catch (err) {
      if (err is ApiException && (err.code == 'ACTIVE_WORKOUT_EXISTS' || err.status == 409) && err.workoutId != null) {
        await _openWorkout(err.workoutId!);
        return;
      }
      await _alert(errorMessage(err, 'Не удалось начать тренировку'));
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AppState>().user;
    final finished = _workouts.where((w) => w['status'] != null && w['status'] != 'in_progress').toList();
    final lastWorkout = finished.firstOrNull;
    final hasFinished = finished.isNotEmpty || hasFinishedWorkoutFlag;
    final ch = _challenge;
    final showProgress = hasFinished && ch != null && const ['ACTIVE', 'COMPLETED', 'EXPIRED'].contains(ch['status']);
    final totalKm = finished.fold<double>(0, (s, w) => s + toDouble(w['distance_km']));
    final heroKm = showProgress && ch['currentKm'] != null
        ? toDouble(ch['currentKm'])
        : lastWorkout?['distance_km'] != null
            ? toDouble(lastWorkout!['distance_km'])
            : totalKm;
    final shoesLocked = user?['activeShoe'] == null || user?['needsActivation'] == true;

    Widget metricFooter;
    if (shoesLocked && _activeWorkoutId == null) {
      metricFooter = Padding(
        padding: const EdgeInsets.only(top: 18),
        child: Column(
          children: [
            Text('🔒 Тренировки недоступны', style: RB.body(size: 15, weight: FontWeight.w700, color: Colors.white.withValues(alpha: 0.92))),
            const SizedBox(height: 8),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 300),
              child: Text(
                'Для начала тренировки необходимо активировать RunBonus-кроссовки.',
                textAlign: TextAlign.center,
                style: RB.body(size: 13, color: Colors.white.withValues(alpha: 0.45)),
              ),
            ),
            const SizedBox(height: 14),
            OutlinedButton(
              onPressed: () => context.go('/orders'),
              style: OutlinedButton.styleFrom(
                backgroundColor: RB.neon.withValues(alpha: 0.14),
                side: BorderSide(color: RB.neon.withValues(alpha: 0.55)),
                foregroundColor: Colors.white,
                shape: const StadiumBorder(),
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                textStyle: RB.body(size: 12, weight: FontWeight.w700).copyWith(letterSpacing: 0.7),
              ),
              child: const Text('МОИ КРОССОВКИ'),
            ),
          ],
        ),
      );
    } else if (showProgress) {
      final remaining = ch['remaining'];
      final label = remaining is Map && remaining['label'] != null ? remaining['label'] : ch['name'];
      metricFooter = TextButton(
        onPressed: () => context.go('/rewards'),
        child: Text(
          '${_kmNum(ch['currentKm'])} / ${_kmNum(ch['targetKm'])} · ${label ?? ''}',
          textAlign: TextAlign.center,
          style: RB.body(size: 13, color: Color.lerp(RB.neon, Colors.white, 0.25)!),
        ),
      );
    } else {
      metricFooter = Padding(
        padding: const EdgeInsets.only(top: 16),
        child: Text(
          _activeWorkoutId != null
              ? 'Тренировка идёт'
              : lastWorkout != null
                  ? 'Последняя тренировка'
                  : 'Нажмите ▶ чтобы начать',
          style: RB.body(size: 13, color: Colors.white.withValues(alpha: 0.42)),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      bottomNavigationBar: const BottomNav(),
      body: RefreshIndicator(
        onRefresh: _load,
        color: RB.neon,
        backgroundColor: RB.surfaceHigh,
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: SizedBox(
              height: constraints.maxHeight,
              child: Stack(
                children: [
                  const Positioned.fill(child: _HomeBackground()),
                  SafeArea(
                    bottom: false,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 10, 20, 24),
                      child: Column(
                        children: [
                          _HomeHeader(onBonus: () => context.go('/rewards')),
                          Expanded(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: Text(
                                    _kmNum(heroKm),
                                    style: RB.headline(size: 84, color: Colors.white).copyWith(
                                      height: 0.92,
                                      letterSpacing: -3.5,
                                      fontFeatures: const [FontFeature.tabularFigures()],
                                    ),
                                  ),
                                ),
                                Container(
                                  width: 72,
                                  height: 3,
                                  margin: const EdgeInsets.fromLTRB(0, 14, 0, 12),
                                  decoration: BoxDecoration(
                                    color: RB.neon,
                                    borderRadius: BorderRadius.circular(999),
                                    boxShadow: [
                                      BoxShadow(color: RB.neon.withValues(alpha: 0.75), blurRadius: 14),
                                      BoxShadow(color: RB.neon.withValues(alpha: 0.35), blurRadius: 28),
                                    ],
                                  ),
                                ),
                                Text('KM',
                                    style: RB.body(size: 17, weight: FontWeight.w700, color: Colors.white.withValues(alpha: 0.45))
                                        .copyWith(letterSpacing: 2.4)),
                                metricFooter,
                              ],
                            ),
                          ),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              _Fab(icon: Icons.settings, tooltip: 'Настройки', onTap: () => context.go('/profile')),
                              const SizedBox(width: 28),
                              _PrimaryFab(
                                starting: _starting,
                                active: _activeWorkoutId != null,
                                onTap: () => _activeWorkoutId != null ? context.go('/workout') : _startWorkout(shoesLocked),
                              ),
                              const SizedBox(width: 28),
                              _Fab(
                                icon: Icons.description_outlined,
                                tooltip: 'История',
                                onTap: () => lastWorkout != null ? showWorkoutDetail(context, lastWorkout) : context.go('/workouts'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _HomeHeader extends StatelessWidget {
  const _HomeHeader({required this.onBonus});
  final VoidCallback onBonus;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          height: 44,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Text('Exercise', style: RB.headline(size: 22, color: Colors.white)),
              Positioned(
                right: 0,
                child: Material(
                  color: RB.neon,
                  shape: const StadiumBorder(),
                  child: InkWell(
                    customBorder: const StadiumBorder(),
                    onTap: onBonus,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(8, 6, 10, 6),
                      child: Row(
                        children: [
                          const Icon(Icons.star, size: 14, color: Color(0xFF111111)),
                          const SizedBox(width: 4),
                          Text('BONUS',
                              style: RB.body(size: 11, weight: FontWeight.w800, color: const Color(0xFF111111))
                                  .copyWith(letterSpacing: 0.44)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _HomeTab(label: 'Exercise', active: true, onTap: () {}),
            const SizedBox(width: 36),
            _HomeTab(label: 'Training', active: false, onTap: onBonus),
          ],
        ),
        Container(height: 1, margin: const EdgeInsets.only(bottom: 8), color: Colors.white.withValues(alpha: 0.08)),
      ],
    );
  }
}

class _HomeTab extends StatelessWidget {
  const _HomeTab({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: IntrinsicWidth(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 6, 2, 10),
              child: Text(label,
                  textAlign: TextAlign.center,
                  style: RB.body(size: 15, weight: FontWeight.w600, color: active ? Colors.white : Colors.white.withValues(alpha: 0.38))),
            ),
            Container(
              height: 2,
              decoration: active
                  ? BoxDecoration(
                      color: RB.neon,
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [BoxShadow(color: RB.neon.withValues(alpha: 0.65), blurRadius: 10)],
                    )
                  : null,
            ),
          ],
        ),
      ),
    );
  }
}

class _Fab extends StatelessWidget {
  const _Fab({required this.icon, required this.tooltip, required this.onTap});
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Container(
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          boxShadow: [BoxShadow(color: Color(0x73000000), blurRadius: 24, offset: Offset(0, 8))],
        ),
        child: Material(
          color: RB.surfaceHigh,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: SizedBox.square(dimension: 54, child: Icon(icon, color: Colors.white, size: 24)),
          ),
        ),
      ),
    );
  }
}

class _PrimaryFab extends StatelessWidget {
  const _PrimaryFab({required this.starting, required this.active, required this.onTap});
  final bool starting;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const dark = Color(0xFF111111);
    Widget content;
    if (starting) {
      content = const Icon(Icons.hourglass_empty, size: 40, color: dark);
    } else if (active) {
      content = const Icon(Icons.play_arrow, size: 44, color: dark);
    } else {
      content = Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < 3; i++) ...[
                if (i > 0) const SizedBox(width: 5),
                Container(width: 7, height: 7, decoration: const BoxDecoration(color: dark, shape: BoxShape.circle)),
              ],
            ],
          ),
          Text('∞', style: RB.body(size: 18, weight: FontWeight.w800, color: dark).copyWith(height: 1.1)),
        ],
      );
    }
    return Semantics(
      button: true,
      label: active ? 'Продолжить' : 'Начать тренировку',
      child: Opacity(
        opacity: starting ? 0.75 : 1,
        child: Container(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(color: RB.neon.withValues(alpha: 0.18), spreadRadius: 8),
              BoxShadow(color: RB.neon.withValues(alpha: 0.45), blurRadius: 36),
              const BoxShadow(color: Color(0x80000000), blurRadius: 40, offset: Offset(0, 16)),
            ],
          ),
          child: Material(
            color: RB.neon,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: starting ? null : onTap,
              child: SizedBox.square(dimension: 88, child: Center(child: content)),
            ),
          ),
        ),
      ),
    );
  }
}

/// Фон: перспективная сетка, неоновое свечение, намёк на маршрут.
class _HomeBackground extends StatelessWidget {
  const _HomeBackground();

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        fit: StackFit.expand,
        children: [
          Transform(
            alignment: const Alignment(0, -0.2),
            transform: Matrix4.identity()
              ..setEntry(3, 2, 1 / 600)
              ..rotateX(0.21)
              ..scaleByDouble(1.15, 1.15, 1, 1),
            child: Opacity(opacity: 0.9, child: CustomPaint(painter: _GridPainter())),
          ),
          Align(
            alignment: const Alignment(0, -0.24),
            child: FractionallySizedBox(
              widthFactor: 1.2,
              child: AspectRatio(
                aspectRatio: 520 / 360,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      colors: [
                        RB.neon.withValues(alpha: 0.22),
                        RB.neon.withValues(alpha: 0.06),
                        RB.neon.withValues(alpha: 0),
                      ],
                      stops: const [0, 0.42, 0.7],
                    ),
                  ),
                ),
              ),
            ),
          ),
          CustomPaint(painter: _RoutePainter()),
        ],
      ),
    );
  }
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.045)
      ..strokeWidth = 1;
    const step = 28.0;
    final pad = size.width * 0.1;
    for (var x = -pad; x < size.width + pad; x += step) {
      canvas.drawLine(Offset(x, -pad), Offset(x, size.height + pad), paint);
    }
    for (var y = -pad; y < size.height + pad; y += step) {
      canvas.drawLine(Offset(-pad, y), Offset(size.width + pad, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _RoutePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final top = size.height * 0.46;
    final left = size.width * 0.12;
    final right = size.width * 0.92;
    final w = right - left;
    final path = Path()
      ..moveTo(left, top + 100)
      ..cubicTo(left + w * 0.25, top + 40, left + w * 0.45, top + 110, left + w * 0.6, top + 50)
      ..cubicTo(left + w * 0.75, top - 5, left + w * 0.9, top + 30, right, top);
    canvas.drawPath(
      path,
      Paint()
        ..color = RB.neon.withValues(alpha: 0.12)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
