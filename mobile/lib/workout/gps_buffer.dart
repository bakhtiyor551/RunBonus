import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import 'gps_point.dart';

/// Локальный буфер GPS-точек: пишем сразу, удаляем после подтверждения сервером.
class GpsBuffer {
  GpsBuffer._();

  static const _table = 'pending_points';
  static Database? _db;

  static Future<Database> _open() async {
    if (_db != null) return _db!;
    final dir = await getDatabasesPath();
    _db = await openDatabase(
      p.join(dir, 'runbonus_gps_buffer.db'),
      version: 1,
      onCreate: (db, _) async {
        await db.execute('''
          CREATE TABLE $_table (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workout_id INTEGER NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            speed_mps REAL,
            accuracy REAL,
            altitude REAL,
            course REAL,
            recorded_at TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )
        ''');
        await db.execute('CREATE INDEX idx_pending_workout ON $_table (workout_id, recorded_at)');
      },
    );
    return _db!;
  }

  static Map<String, Object?> _row(int workoutId, GpsPoint point) => {
        'workout_id': workoutId,
        'latitude': point.latitude,
        'longitude': point.longitude,
        'speed_mps': point.speedMps,
        'accuracy': point.accuracy,
        'altitude': point.altitude,
        'course': point.course,
        'recorded_at': point.recordedAt.toUtc().toIso8601String(),
        'created_at': DateTime.now().millisecondsSinceEpoch,
      };

  static Future<void> add(int workoutId, GpsPoint point) async {
    if (!point.isValidCoord) return;
    final db = await _open();
    await db.insert(_table, _row(workoutId, point));
  }

  static Future<void> addAll(int workoutId, Iterable<GpsPoint> points) async {
    final db = await _open();
    final batch = db.batch();
    for (final point in points) {
      if (point.isValidCoord) batch.insert(_table, _row(workoutId, point));
    }
    await batch.commit(noResult: true);
  }

  /// Ожидающие отправки точки тренировки (по времени записи).
  static Future<List<BufferedPoint>> pending(int workoutId, {int limit = 50}) async {
    final db = await _open();
    final rows = await db.query(
      _table,
      where: 'workout_id = ?',
      whereArgs: [workoutId],
      orderBy: 'recorded_at ASC, id ASC',
      limit: limit,
    );
    return rows.map(BufferedPoint.fromRow).toList();
  }

  static Future<void> delete(List<int> ids) async {
    if (ids.isEmpty) return;
    final db = await _open();
    await db.delete(_table, where: 'id IN (${List.filled(ids.length, '?').join(',')})', whereArgs: ids);
  }

  static Future<void> clear(int workoutId) async {
    final db = await _open();
    await db.delete(_table, where: 'workout_id = ?', whereArgs: [workoutId]);
  }
}

class BufferedPoint {
  BufferedPoint(this.id, this.point);

  final int id;
  final GpsPoint point;

  static BufferedPoint fromRow(Map<String, Object?> r) => BufferedPoint(
        r['id']! as int,
        GpsPoint(
          latitude: (r['latitude']! as num).toDouble(),
          longitude: (r['longitude']! as num).toDouble(),
          speedMps: (r['speed_mps'] as num?)?.toDouble() ?? 0,
          accuracy: (r['accuracy'] as num?)?.toDouble(),
          altitude: (r['altitude'] as num?)?.toDouble(),
          course: (r['course'] as num?)?.toDouble(),
          recordedAt: DateTime.parse(r['recorded_at']! as String),
        ),
      );
}
