import 'dart:async';

import '../core/api.dart';
import '../core/format.dart';
import '../workout/geolocation.dart';
import '../workout/workout_tracker.dart';

class ActiveWorkoutSync {
  const ActiveWorkoutSync({this.workoutId, this.startedAt, this.stale = false, this.offline = false});

  final int? workoutId;
  final int? startedAt;
  final bool stale;
  final bool offline;
}

/// Сверяет локальное состояние с сервером: одна in_progress тренировка на пользователя.
Future<ActiveWorkoutSync> syncActiveWorkoutWithServer() async {
  final localId = getActiveWorkoutId();
  try {
    final data = await Api.get('/api/workouts/active').timeout(const Duration(seconds: 4));
    final map = data is Map ? data : const {};
    final rawId = map['workoutId'] ?? map['id'];
    final serverId = rawId != null ? toInt(rawId) : null;
    final startedAt = parseDate(map['started_at'])?.millisecondsSinceEpoch;

    if (serverId != null && serverId > 0) {
      final stale = localId != null && localId != serverId;
      if (stale) await clearWorkoutLocal(localId);
      await setActiveWorkoutId(serverId);
      return ActiveWorkoutSync(workoutId: serverId, startedAt: startedAt, stale: stale);
    }
    if (localId != null) {
      await clearWorkoutLocal(localId);
      await setActiveWorkoutId(null);
      return const ActiveWorkoutSync(stale: true);
    }
    return const ActiveWorkoutSync();
  } catch (_) {
    return ActiveWorkoutSync(
      workoutId: localId ?? WorkoutTracker.instance.workoutId,
      offline: true,
    );
  }
}
