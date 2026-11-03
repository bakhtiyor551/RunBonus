/// Go API (production). nginx → контейнер runbonus-api :3000.
const productionApiUrl = 'https://runbonus.online';

/// Локальный/кастомный backend: `flutter run --dart-define=API_URL=http://10.0.2.2:3000`.
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
  // Старый Node слушал :3001 — на Go API это :3000.
  return clean.replaceFirst(RegExp(r':3001(/|$)'), r':3000$1');
}

String _resolveApiUrl() {
  if (_apiUrlFromEnv.isNotEmpty) return _normalizeApiUrl(_apiUrlFromEnv);
  // Debug и release по умолчанию на Go production; локально — через API_URL.
  return productionApiUrl;
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
