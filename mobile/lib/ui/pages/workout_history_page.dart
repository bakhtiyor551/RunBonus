import 'package:flutter/material.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/units.dart';
import '../theme.dart';
import '../widgets/bottom_nav.dart';
import '../widgets/common.dart';
import '../widgets/workout_detail_sheet.dart';

class WorkoutHistoryPage extends StatefulWidget {
  const WorkoutHistoryPage({super.key});

  @override
  State<WorkoutHistoryPage> createState() => _WorkoutHistoryPageState();
}

class _WorkoutHistoryPageState extends State<WorkoutHistoryPage> {
  List<Map<String, dynamic>> _workouts = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load().whenComplete(() {
      if (mounted) setState(() => _loading = false);
    });
  }

  Future<void> _load() async {
    try {
      final rows = await Api.get('/api/workouts/history');
      if (!mounted) return;
      setState(() {
        _workouts = (rows is List ? rows : const [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .where((w) => w['status'] != 'in_progress')
            .toList();
      });
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final units = getDistanceUnits();
    return TabPage(
      header: const AppHeader(showAvatar: false),
      onRefresh: _load,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const PageTitle('Тренировки', subtitle: 'Дистанция, время и статус проверки'),
          for (final w in _workouts) ...[
            _WorkoutRow(workout: w, units: units, onTap: () => showWorkoutDetail(context, w)),
            const SizedBox(height: 10),
          ],
          if (!_loading && _workouts.isEmpty)
            const GlassCard(
              child: EmptyState(
                icon: Icons.directions_run,
                title: 'Пока пусто',
                text: 'Пока нет завершённых тренировок. Начните бег с главной — километры появятся здесь.',
              ),
            ),
          if (_loading) const Loader(),
        ],
      ),
    );
  }
}

class _WorkoutRow extends StatelessWidget {
  const _WorkoutRow({required this.workout, required this.units, required this.onTap});
  final Map<String, dynamic> workout;
  final DistanceUnits units;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final km = toDouble(workout['distance_km']);
    final duration = toInt(workout['duration_seconds']);
    final avg = toDouble(workout['avg_speed']);
    final status = workout['status'];
    final meta = [
      formatWorkoutDate(workout['started_at']),
      if (km > 0) formatDistance(km, units),
      if (duration > 0) formatDuration(duration),
      if (avg > 0) formatSpeed(avg, units),
    ].join(' · ');
    return GlassCard(
      onTap: onTap,
      child: Row(
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
                Row(
                  children: [
                    Flexible(child: Text(dayLabel(workout['started_at']), style: RB.headline(size: 16))),
                    const SizedBox(width: 8),
                    StatusPill(formatWorkoutStatus(status), color: workoutStatusColor(status)),
                  ],
                ),
                const SizedBox(height: 4),
                Text(meta, style: RB.body(size: 12, color: RB.onSurfaceVariant)),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: RB.onSurfaceVariant),
        ],
      ),
    );
  }
}
