import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'config.dart';
import 'device_id.dart';
import 'storage.dart';

const _tokenKey = 'token';
const _userCacheKey = 'rb_user_cache';
const _timeout = Duration(seconds: 30);

class ApiException implements Exception {
  ApiException(
    this.message, {
    this.status,
    this.code,
    this.data,
    this.isNetworkError = false,
  });

  final String message;
  final int? status;
  final String? code;
  final dynamic data;
  final bool isNetworkError;

  int? get workoutId {
    final d = data;
    if (d is Map) {
      final raw = d['workoutId'] ?? d['id'];
      if (raw != null) return int.tryParse('$raw');
    }
    return null;
  }

  @override
  String toString() => message;
}

bool isNetworkError(Object? err) {
  if (err == null) return true;
  if (err is ApiException) {
    if (err.isNetworkError) return true;
    return err.status == null || err.status == 0;
  }
  final msg = '$err';
  return RegExp(
    r'нет связи|network|failed to fetch|timeout|internet|offline|недоступен|ECONNREFUSED|ENOTFOUND|Unable to resolve host|SocketException',
    caseSensitive: false,
  ).hasMatch(msg);
}

/// Сообщение об ошибке для UI.
String errorMessage(Object? err, [String fallback = 'Ошибка запроса']) {
  if (err is ApiException) return err.message;
  final text = err?.toString() ?? '';
  return text.isEmpty ? fallback : text;
}

class Api {
  Api._();

  static final http.Client _client = http.Client();

  /// Сброс сессии (аккаунт открыт на другом устройстве).
  static void Function(String notice)? onForcedLogout;

  static String? get token => Storage.getString(_tokenKey);

  static Future<void> setToken(String? value) async {
    if (value != null && value.isNotEmpty) {
      await Storage.setString(_tokenKey, value);
    } else {
      await Storage.remove(_tokenKey);
      await cacheUser(null);
    }
  }

  static Future<void> cacheUser(Map<String, dynamic>? user) => Storage.setJson(_userCacheKey, user);

  static Map<String, dynamic>? cachedUser() {
    final data = Storage.getJson(_userCacheKey);
    return data is Map<String, dynamic> ? data : null;
  }

  static Future<dynamic> get(String path) => request('GET', path);

  static Future<dynamic> post(String path, [Map<String, dynamic>? body]) =>
      request('POST', path, body: body ?? const {});

  static Future<dynamic> patch(String path, Map<String, dynamic> body) =>
      request('PATCH', path, body: body);

  static Future<dynamic> delete(String path, [Map<String, dynamic>? body]) =>
      request('DELETE', path, body: body ?? const {});

  static Future<dynamic> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Duration timeout = _timeout,
  }) async {
    final deviceId = getDeviceId();
    var url = '$apiUrl$path';
    String? payload;

    // device_id и в query, и в теле — надёжнее заголовка за nginx.
    if (method == 'GET' || method == 'HEAD') {
      final sep = url.contains('?') ? '&' : '?';
      url = '$url${sep}device_id=${Uri.encodeQueryComponent(deviceId)}';
    } else {
      payload = jsonEncode({...?body, 'device_id': deviceId});
    }

    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Device-Id': deviceId,
    };
    final t = token;
    if (t != null && t.isNotEmpty) headers['Authorization'] = 'Bearer $t';

    http.Response res;
    try {
      final req = http.Request(method, Uri.parse(url))..headers.addAll(headers);
      if (payload != null) req.body = payload;
      res = await http.Response.fromStream(await _client.send(req).timeout(timeout));
    } on TimeoutException {
      throw ApiException('Нет связи с сервером. Проверьте интернет.', isNetworkError: true);
    } on SocketException {
      throw ApiException('Нет связи с сервером. Проверьте интернет.', isNetworkError: true);
    } on http.ClientException {
      throw ApiException('Нет связи с сервером. Проверьте интернет.', isNetworkError: true);
    }

    final text = utf8.decode(res.bodyBytes, allowMalformed: true);
    dynamic data = const <String, dynamic>{};
    if (text.isNotEmpty) {
      if (text.trimLeft().startsWith('<')) {
        throw ApiException(
          'Ошибка связи с сервером. Переустановите приложение или обратитесь в поддержку.',
          status: res.statusCode,
        );
      }
      try {
        data = jsonDecode(text);
      } catch (_) {
        data = const <String, dynamic>{};
      }
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      _throwApiError(data, res.statusCode);
    }
    return data;
  }

  static Never _throwApiError(dynamic data, int status) {
    final map = data is Map ? data : const {};
    if (map['code'] == 'DEVICE_MISMATCH') {
      final notice = (map['error'] as String?) ??
          'Аккаунт активен на другом телефоне. Войдите снова на этом устройстве.';
      setToken(null);
      onForcedLogout?.call(notice);
    }
    final message = map['error'] is String
        ? map['error'] as String
        : (status == 401 ? 'Ошибка авторизации' : 'Ошибка запроса');
    final code = map['code'] as String? ?? (map['error'] is String ? map['error'] as String : null);
    throw ApiException(message, status: status, code: code, data: data);
  }

  /// Выход: снимает привязку, если выход с основного телефона.
  static Future<void> logout() async {
    if (token == null) return;
    try {
      await post('/api/auth/logout');
    } catch (_) {
      // С «чужого» телефона logout может не пройти — локально всё равно выходим.
    }
    await setToken(null);
  }

  /// Публичный URL файла (аватары, фото товаров: /uploads → /api/uploads).
  static String? mediaUrl(String? path, {Object? cacheKey}) {
    if (path == null || path.trim().isEmpty) return null;
    var p = path.trim();
    if (!RegExp(r'^https?://', caseSensitive: false).hasMatch(p)) {
      if (p.startsWith('/uploads/')) p = '/api$p';
      p = '$apiUrl${p.startsWith('/') ? p : '/$p'}';
    }
    if (cacheKey != null) {
      p = '$p${p.contains('?') ? '&' : '?'}v=$cacheKey';
    }
    return p;
  }
}
