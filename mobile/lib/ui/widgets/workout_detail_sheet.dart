import 'package:flutter/material.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/units.dart';
import '../../workout/gps_point.dart';
import '../theme.dart';
import 'common.dart';
import 'workout_map.dart';

String formatWorkoutStatus(Object? status) => switch (status) {
      'approved' => 'Засчитано',
      'rejected' || 'rejected_no_fund' => 'Не засчитано',
      'suspicious' => 'На проверке',
      'in_progress' => 'В процессе',
      'pending' => 'Обрабатывается',
      null || '' => '—',
      _ => '$status',
    };

Color workoutStatusColor(Object? status) => switch (status) {
      'approved' => RB.neon,
      'in_progress' => const Color(0xFF00D4FF),
      'suspicious' || 'pending' => const Color(0xFFFFCC00),
      _ => RB.error,
    };

Future<void> showWorkoutDetail(BuildContext context, Map<String, dynamic> workout) =>
    showDetailSheet(context, title: 'Тренировка', builder: (_) => _WorkoutDetail(workout: workout));

class _WorkoutDetail extends StatefulWidget {
  const _WorkoutDetail({required this.workout});
  final Map<String, dynamic> workout;

  @override
  State<_WorkoutDetail> createState() => _WorkoutDetailState();
}

class _WorkoutDetailState extends State<_WorkoutDetail> {
  List<GpsPoint>? _points;

  @override
  void initState() {
    super.initState();
    Api.get('/api/workouts/${widget.workout['id']}/points').then((data) {
      final list = data is Map ? data['points'] : null;
      final points = (list is List ? list : const []).map(GpsPoint.fromJson).whereType<GpsPoint>().toList();
      if (mounted) setState(() => _points = points);
    }).catchError((_) {
      if (mounted) setState(() => _points = const []);
    });
  }

  @override
  Widget build(BuildContext context) {
    final w = widget.workout;
    final units = getDistanceUnits();
    final km = toDoubleOrNull(w['distance_km']);
    final duration = toInt(w['duration_seconds']);
    final avg = toDouble(w['avg_speed']);
    final max = toDouble(w['max_speed']);
    final steps = toInt(w['steps_count']);
    final status = w['status'];
    final reason = w['reject_reason'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: RB.neon.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.directions_run, color: RB.neon),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(formatWorkoutStatus(status), style: RB.body(size: 15, weight: FontWeight.w700, color: workoutStatusColor(status))),
                  Text('№ ${w['id']}', style: RB.body(size: 12, color: RB.onSurfaceVariant)),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        ClipRRect(
          borderRadius: BorderRadius.circular(RB.radius),
          child: SizedBox(
            height: 220,
            child: _points == null
                ? Center(child: Text('Загрузка маршрута…', style: RB.body(color: RB.onSurfaceVariant)))
                : WorkoutMap(points: _points!, follow: false),
          ),
        ),
        const SizedBox(height: 20),
        Center(child: Text(km != null ? formatDistance(km, units) : '—', style: RB.headline(size: 44, color: RB.neon))),
        Center(child: Text('дистанция', style: RB.body(color: RB.onSurfaceVariant))),
        const SizedBox(height: 12),
        StatRow(label: 'Длительность', value: duration > 0 ? formatDuration(duration) : '—'),
        StatRow(label: 'Начало', value: formatDateTime(w['started_at'])),
        StatRow(label: 'Завершение', value: formatDateTime(w['finished_at'])),
        if (avg > 0) StatRow(label: 'Средняя скорость', value: formatSpeed(avg, units)),
        if (max > 0) StatRow(label: 'Макс. скорость', value: formatSpeed(max, units)),
        if (steps > 0) StatRow(label: 'Шаги', value: '$steps'),
        StatRow(label: 'Проверка', value: formatWorkoutStatus(status), highlight: status == 'approved'),
        if (reason is String && reason.isNotEmpty) ...[
          const SizedBox(height: 12),
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('ПРИЧИНА', style: RB.label(color: RB.error)),
                const SizedBox(height: 6),
                Text(reason, style: RB.body()),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
