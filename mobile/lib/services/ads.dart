import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import '../core/api.dart';
import '../core/config.dart';
import '../core/storage.dart';

const _googleAdsCacheKey = 'rb_google_ads_enabled';

/// Тестовые ID Google AdMob (замените через --dart-define или в админке).
const _testBanner = {
  'ios': 'ca-app-pub-3940255089942544/2934735716',
  'android': 'ca-app-pub-3940255089942544/6300978111',
};

/// Настройки рекламы с сервера (админ может отключить Google AdMob).
class AdsConfig {
  AdsConfig._();
  static final instance = AdsConfig._();

  final googleAllowed = ValueNotifier<bool>(Storage.getString(_googleAdsCacheKey) != '0');

  Map<String, dynamic> _config = const {
    'admob_enabled': true,
    'admob_test_mode': false,
    'partner_ads_enabled': true,
    'units': {'google': {}, 'play': {}},
  };
  bool _admobInitialized = false;

  bool get testMode => AdMobEnv.forceTest || _config['admob_test_mode'] == true;

  bool get admobEnabled => AdMobEnv.enabled && _config['admob_enabled'] != false && googleAllowed.value;

  String unitId(String network, String page) {
    final units = _config['units'];
    if (units is Map) {
      final byNetwork = units[network];
      if (byNetwork is Map) {
        final fromServer = '${byNetwork[page] ?? ''}'.trim();
        if (fromServer.isNotEmpty && !testMode) return fromServer;
      }
    }
    final fromEnv = AdMobEnv.unit(network, page);
    if (fromEnv.isNotEmpty && !testMode) return fromEnv;
    return _testBanner[Platform.isIOS ? 'ios' : 'android']!;
  }

  Future<void> refresh() async {
    try {
      final data = await Api.get('/api/mobile/ads/config');
      if (data is Map<String, dynamic>) {
        _config = {..._config, ...data};
        googleAllowed.value = data['google_ads_enabled'] != false;
        await Storage.setString(_googleAdsCacheKey, googleAllowed.value ? '1' : '0');
      }
    } catch (_) {}
    if (admobEnabled) await _initAdMob();
  }

  Future<void> _initAdMob() async {
    if (_admobInitialized) return;
    try {
      await MobileAds.instance.initialize();
      _admobInitialized = true;
    } catch (err) {
      debugPrint('[AdMob] init failed: $err');
    }
  }
}

/// Партнёрские баннеры RunBonus из админки.
Future<List<Map<String, dynamic>>> fetchAdBanners(String placement, {String? city}) async {
  final params = {'placement': placement, if (city != null && city.trim().isNotEmpty) 'city': city.trim()};
  try {
    final data = await Api.get('/api/mobile/ads/banners?${Uri(queryParameters: params).query}');
    return data is List ? data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : [];
  } catch (_) {
    return [];
  }
}

void trackAdEvent(Object? campaignId, String eventType) {
  if (campaignId == null) return;
  Api.post('/api/mobile/ads/event', {'campaign_id': campaignId, 'event_type': eventType}).catchError((_) => null);
}
