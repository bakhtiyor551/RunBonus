import 'dart:io';

import 'package:flutter/foundation.dart';

/// Продакшен API (HTTPS). HTTP/IP nginx перенаправляет на этот домен.
const productionApiUrl = 'https://runbonus.online';

/// Задаётся при сборке: `flutter run --dart-define=API_URL=http://192.168.x.x:3001`.
const _apiUrlFromEnv = String.fromEnvironment('API_URL');

String _normalizeApiUrl(String url) {
  final clean = url.trim().replaceAll(RegExp(r'/$'), '');
  if (clean.isEmpty) return productionApiUrl;
  if (RegExp(r'^http://161\.129\.67\.147', caseSensitive: false).hasMatch(clean)) {
    return productionApiUrl;
  }
  if (RegExp(r'^http://runbonus\.online', caseSensitive: false).hasMatch(clean)) {
    return productionApiUrl;
  }
  return clean;
}

String _resolveApiUrl() {
  if (_apiUrlFromEnv.isNotEmpty) return _normalizeApiUrl(_apiUrlFromEnv);
  if (kReleaseMode) return productionApiUrl;
  // Эмулятор Android ходит на хост через 10.0.2.2, симулятор iOS — через localhost.
  if (Platform.isAndroid) return 'http://10.0.2.2:3001';
  return 'http://localhost:3001';
}

final String apiUrl = _resolveApiUrl();

/// Google AdMob: ID из --dart-define имеют приоритет над тестовыми.
class AdMobEnv {
  static const enabled = String.fromEnvironment('ADMOB_ENABLED', defaultValue: 'true') != 'false';
  static const forceTest = String.fromEnvironment('ADMOB_TEST') == 'true';

  static const _units = <String, String>{
    'google_home': String.fromEnvironment('ADMOB_GOOGLE_HOME'),
    'google_workout': String.fromEnvironment('ADMOB_GOOGLE_WORKOUT'),
    'google_shop': String.fromEnvironment('ADMOB_GOOGLE_SHOP'),
    'play_home': String.fromEnvironment('ADMOB_PLAY_HOME'),
    'play_workout': String.fromEnvironment('ADMOB_PLAY_WORKOUT'),
    'play_shop': String.fromEnvironment('ADMOB_PLAY_SHOP'),
  };

  static String unit(String network, String page) => _units['${network}_$page'] ?? '';
}
