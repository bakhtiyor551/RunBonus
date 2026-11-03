import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../app_state.dart';
import '../../core/format.dart';
import '../../workout/gps_filter.dart';
import '../../workout/gps_point.dart';
import '../theme.dart';
import '../widgets/workout_map.dart';

class WorkoutResult {
  const WorkoutResult({required this.data, required this.trackPoints, required this.steps, required this.finishedAt});
  final Map<String, dynamic> data;
  final List<GpsPoint> trackPoints;
  final int steps;
  final DateTime finishedAt;
}

class _Split {
  const _Split(this.km, this.paceSec);
  final int km;
  final double paceSec;
}

int _estimateCalories(double km, int durationSec, int steps) {
  final fromDist = km * 65;
  final fromSteps = steps * 0.04;
  final fromTime = durationSec / 3600 * 280;
  return math.max(0, [fromDist, fromSteps, fromTime].reduce(math.max).round());
}

String _activityLabel(double? avgKmh) {
  if (avgKmh == null) return 'ПРОГУЛКА';
  if (avgKmh >= 10) return 'БЕГ';
  if (avgKmh >= 6) return 'ПРОГУЛКА';
  return 'ХОДЬБА';
}

List<_Split> _buildSplits(List<GpsPoint> track, double kmTotal, int durationSec) {
  if (kmTotal < 0.2 || track.length < 2) {
    return _fallbackSplits(kmTotal, durationSec);
  }
  final splits = <_Split>[];
  var cum = 0.0;
  var segStart = 0;
  var nextKm = 1;
  for (var i = 1; i < track.length; i++) {
    final a = track[i - 1];
    final b = track[i];
    cum += haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude) / 1000;
    while (cum >= nextKm && nextKm <= kmTotal.floor()) {
      final sec = math.max(1, (b.recordedAt.difference(track[segStart].recordedAt).inMilliseconds / 1000).round());
      splits.add(_Split(nextKm, sec.toDouble()));
      segStart = i;
      nextKm++;
    }
  }
  if (splits.isEmpty) return _fallbackSplits(kmTotal, durationSec);
  return splits.take(8).toList();
}

List<_Split> _fallbackSplits(double kmTotal, int durationSec) {
  if (kmTotal <= 0 || durationSec <= 0) return const [];
  final avg = durationSec / kmTotal;
  final whole = math.max(1, kmTotal.floor());
  return [for (var k = 1; k <= math.min(whole, 8); k++) _Split(k, avg)];
}

class WorkoutResultView extends StatefulWidget {
  const WorkoutResultView({super.key, required this.result, required this.onDone});
  final WorkoutResult result;
  final VoidCallback onDone;

  @override
  State<WorkoutResultView> createState() => _WorkoutResultViewState();
}

class _WorkoutResultViewState extends State<WorkoutResultView> {
  bool _detailsOpen = true;

  @override
  Widget build(BuildContext context) {
    final r = widget.result.data;
    final user = context.watch<AppState>().user;
    final km = toDouble(r['distance_km']);
    final durationSec = toInt(r['duration_seconds']);
    final steps = r['steps_count'] != null ? toInt(r['steps_count']) : widget.result.steps;
    final avgKmh = durationSec > 0 && km > 0 ? km / durationSec * 3600 : toDoubleOrNull(r['avg_speed']);
    final avgPaceSec = km > 0.01 && durationSec > 0 ? durationSec / km : null;
    final calories = _estimateCalories(km, durationSec, steps);
    final splits = _buildSplits(widget.result.trackPoints, km, durationSec);
    final goalPace = avgPaceSec != null ? (avgPaceSec * 1.02).roundToDouble() : 600.0;
    final slowPace = avgPaceSec != null ? avgPaceSec * 2.2 : 1200.0;
    final fastPace = avgPaceSec != null ? avgPaceSec * 0.45 : 140.0;

    final status = r['status'];
    final approved = status == 'approved';
    final pending = status == null || status == 'pending' || status == 'processing';
    final gpsLabel = approved
        ? 'ПРОВЕРЕННЫЙ GPS'
        : pending
            ? 'ПРОВЕРКА GPS'
            : status == 'suspicious'
                ? 'НА ПРОВЕРКЕ'
                : 'НЕ ЗАСЧИТАНО';
    final approvedKm = toDouble(r['approvedDistanceKm'] ?? r['approved_distance_km'] ?? km);
    final shownKm = approvedKm > 0 ? approvedKm : km;

    final name = '${user?['name'] ?? ''}'.trim().isNotEmpty
        ? '${user!['name']}'
        : [user?['firstName'] ?? user?['first_name'], user?['lastName'] ?? user?['last_name']]
            .where((e) => e != null && '$e'.isNotEmpty)
            .join(' ');
    final displayName = name.isEmpty ? 'Бегун RunBonus' : name;
    final initial = (name.isNotEmpty ? name : '${user?['phone'] ?? 'R'}').trim().characters.first.toUpperCase();
    final when = widget.result.finishedAt;
    final whenLabel = '${DateFormat('d MMM y', 'ru').format(when)} · ${DateFormat.Hm('ru').format(when)}';

    final unlocked = r['rewards_unlocked'];
    final dim = Colors.white.withValues(alpha: 0.45);
    final topInset = MediaQuery.paddingOf(context).top;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) widget.onDone();
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF0A0A0A),
        body: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                height: (MediaQuery.sizeOf(context).height * 0.38).clamp(240, 340) + topInset,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    WorkoutMap(points: widget.result.trackPoints, follow: false, gradient: true),
                    Positioned(
                      left: 14,
                      right: 14,
                      top: topInset + 10,
                      child: Row(
                        children: [
                          _MapChip(onTap: widget.onDone, child: const Icon(Icons.chevron_left, color: Colors.white)),
                          const Spacer(),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(color: const Color(0xE0141414), borderRadius: BorderRadius.circular(999)),
                            child: Row(
                              children: [
                                Container(width: 7, height: 7, decoration: const BoxDecoration(color: RB.neon, shape: BoxShape.circle)),
                                const SizedBox(width: 6),
                                Text(gpsLabel, style: RB.body(size: 11, weight: FontWeight.w700, color: RB.neon).copyWith(letterSpacing: 0.6)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    Positioned(
                      left: 16,
                      bottom: 30,
                      child: IgnorePointer(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Душанбе', style: RB.headline(size: 34, color: Colors.white).copyWith(
                              shadows: const [Shadow(color: Colors.black54, blurRadius: 12)],
                            )),
                            Text('МАРШРУТ ТАДЖИКИСТАН', style: RB.body(size: 11, weight: FontWeight.w700, color: RB.neon).copyWith(letterSpacing: 1.2)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Transform.translate(
                offset: const Offset(0, -18),
                child: Container(
                  decoration: const BoxDecoration(
                    color: Color(0xFF141414),
                    borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                  ),
                  padding: EdgeInsets.fromLTRB(18, 10, 18, 28 + MediaQuery.paddingOf(context).bottom),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Center(
                        child: Container(
                          width: 42,
                          height: 4,
                          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(999)),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Stack(
                            clipBehavior: Clip.none,
                            children: [
                              Container(
                                width: 48,
                                height: 48,
                                alignment: Alignment.center,
                                decoration: const BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: RadialGradient(
                                    center: Alignment(-0.4, -0.4),
                                    colors: [Color(0xFF7C5CFF), Color(0xFF2A1F4D)],
                                    stops: [0, 0.7],
                                  ),
                                ),
                                child: Text(initial, style: RB.headline(size: 18, color: Colors.white)),
                              ),
                              Positioned(
                                right: -2,
                                bottom: -2,
                                child: Container(
                                  width: 18,
                                  height: 18,
                                  decoration: const BoxDecoration(color: RB.neon, shape: BoxShape.circle),
                                  child: const Icon(Icons.check, size: 12, color: Color(0xFF111111)),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(displayName, style: RB.body(size: 15, weight: FontWeight.w700, color: Colors.white)),
                                const SizedBox(height: 2),
                                Text(whenLabel, style: RB.body(size: 12, color: dim)),
                              ],
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Row(
                                children: [
                                  Container(width: 6, height: 6, decoration: const BoxDecoration(color: RB.neon, shape: BoxShape.circle)),
                                  const SizedBox(width: 5),
                                  Text(_activityLabel(avgKmh), style: RB.body(size: 10, weight: FontWeight.w700, color: RB.neon).copyWith(letterSpacing: 1)),
                                ],
                              ),
                              Text('${shownKm.toStringAsFixed(2)} КМ',
                                  style: RB.headline(size: 28, color: Colors.white).copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
                              if (!approved && km > 0)
                                Text('GPS: ${km.toStringAsFixed(2)} км', style: RB.body(size: 11, color: Colors.white.withValues(alpha: 0.4))),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 22),
                      Row(
                        children: [
                          _ResultStat(value: formatPaceTicks(avgPaceSec), label: 'СР. ТЕМП'),
                          _ResultStat(value: formatClock(durationSec), label: 'ВРЕМЯ'),
                          _ResultStat(value: '$calories', label: 'КАЛОРИИ'),
                        ],
                      ),
                      const SizedBox(height: 20),
                      Container(
                        height: 8,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(999),
                          gradient: const LinearGradient(colors: [
                            Color(0xFFFF2D55),
                            Color(0xFFFFCC00),
                            RB.neon,
                            Color(0xFF00E5BC),
                            Color(0xFF00D4FF),
                          ]),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Медленно ${formatPaceTicks(slowPace)}', style: RB.body(size: 11, color: dim)),
                          Text('Быстро ${formatPaceTicks(fastPace)}', style: RB.body(size: 11, color: dim)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () => setState(() => _detailsOpen = !_detailsOpen),
                        style: TextButton.styleFrom(foregroundColor: Colors.white.withValues(alpha: 0.5)),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text('Подробнее', style: RB.body(size: 13, color: Colors.white.withValues(alpha: 0.5))),
                            const SizedBox(width: 6),
                            Container(width: 6, height: 6, decoration: const BoxDecoration(color: Color(0xFFFF2D55), shape: BoxShape.circle)),
                            Icon(_detailsOpen ? Icons.expand_less : Icons.expand_more),
                          ],
                        ),
                      ),
                      if (_detailsOpen) ..._splitsSection(splits, avgPaceSec, goalPace),
                      if (unlocked is List && unlocked.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text(
                            'Новые награды: ${unlocked.map((e) => e is Map ? (e['name'] ?? '${e['distance']} км') : '$e').join(', ')}',
                            style: RB.body(size: 13, color: RB.neon),
                          ),
                        ),
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: widget.onDone,
                        style: FilledButton.styleFrom(
                          backgroundColor: RB.neon,
                          foregroundColor: const Color(0xFF111111),
                          shape: const StadiumBorder(),
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          textStyle: RB.headline(size: 16),
                        ),
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [Text('Готово'), SizedBox(width: 8), Icon(Icons.arrow_forward, size: 20)],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _splitsSection(List<_Split> splits, double? avgPaceSec, double goalPace) {
    final rows = splits.isNotEmpty ? splits : [_Split(1, avgPaceSec ?? goalPace)];
    final dim = Colors.white.withValues(alpha: 0.4);
    return [
      Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          children: [
            SizedBox(width: 28, child: Text('КМ', style: RB.body(size: 11, weight: FontWeight.w600, color: dim))),
            Text('ТЕМП', style: RB.body(size: 11, weight: FontWeight.w600, color: dim)),
          ],
        ),
      ),
      for (final s in rows)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(
            children: [
              SizedBox(
                width: 28,
                child: Text('${s.km}', style: RB.body(size: 14, weight: FontWeight.w700, color: Colors.white.withValues(alpha: 0.7))),
              ),
              Expanded(
                child: LayoutBuilder(builder: (context, c) {
                  final ratio = (goalPace / (s.paceSec > 0 ? s.paceSec : goalPace)).clamp(0.35, 1.0);
                  return Container(
                    height: 28,
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(8)),
                    alignment: Alignment.centerLeft,
                    child: Container(
                      width: c.maxWidth * ratio,
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      alignment: Alignment.centerLeft,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        gradient: const LinearGradient(colors: [Color(0xFF00BCD4), Color(0xFF00E5BC)]),
                      ),
                      child: Text(formatPaceTicks(s.paceSec), style: RB.body(size: 12, weight: FontWeight.w700, color: const Color(0xFF041816))),
                    ),
                  );
                }),
              ),
              const SizedBox(width: 10),
              Text('Цель сплита ${formatPaceTicks(goalPace)}', style: RB.body(size: 11, color: dim)),
            ],
          ),
        ),
    ];
  }
}

class _ResultStat extends StatelessWidget {
  const _ResultStat({required this.value, required this.label});
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(value, style: RB.headline(size: 22, color: Colors.white).copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
          const SizedBox(height: 4),
          Text(label, style: RB.body(size: 10, weight: FontWeight.w700, color: Colors.white.withValues(alpha: 0.4)).copyWith(letterSpacing: 1)),
        ],
      ),
    );
  }
}

class _MapChip extends StatelessWidget {
  const _MapChip({required this.onTap, required this.child});
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xD9141414),
      shape: const CircleBorder(),
      child: InkWell(customBorder: const CircleBorder(), onTap: onTap, child: SizedBox.square(dimension: 40, child: Center(child: child))),
    );
  }
}
