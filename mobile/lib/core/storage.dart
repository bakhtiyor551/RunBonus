import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Аналог localStorage: синхронное чтение после [init].
class Storage {
  Storage._();

  static late SharedPreferences _prefs;
  static late Directory _filesDir;

  static Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
    _filesDir = await getApplicationSupportDirectory();
  }

  static String? getString(String key) => _prefs.getString(key);

  static Future<void> setString(String key, String? value) async {
    if (value == null) {
      await _prefs.remove(key);
    } else {
      await _prefs.setString(key, value);
    }
  }

  static Future<void> remove(String key) => _prefs.remove(key);

  static dynamic getJson(String key) {
    final raw = _prefs.getString(key);
    if (raw == null) return null;
    try {
      return jsonDecode(raw);
    } catch (_) {
      return null;
    }
  }

  static Future<void> setJson(String key, Object? value) async {
    if (value == null) {
      await _prefs.remove(key);
    } else {
      await _prefs.setString(key, jsonEncode(value));
    }
  }

  /// Крупные данные (трек тренировки) — в файл, а не в prefs.
  static File _file(String name) => File('${_filesDir.path}/$name.json');

  static Map<String, dynamic>? readFileJson(String name) {
    final file = _file(name);
    if (!file.existsSync()) return null;
    try {
      final data = jsonDecode(file.readAsStringSync());
      return data is Map<String, dynamic> ? data : null;
    } catch (_) {
      return null;
    }
  }

  static Future<void> writeFileJson(String name, Map<String, dynamic> data) async {
    try {
      await _file(name).writeAsString(jsonEncode(data), flush: true);
    } catch (_) {}
  }

  static Future<void> deleteFile(String name) async {
    final file = _file(name);
    if (file.existsSync()) await file.delete();
  }
}
