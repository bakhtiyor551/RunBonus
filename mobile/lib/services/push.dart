import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/device_id.dart';

/// FCM: регистрация токена на сервере и переход по нажатию на уведомление.
class PushService {
  PushService._();
  static final instance = PushService._();

  void Function(String path)? onNavigate;

  bool _firebaseReady = false;
  bool _initialized = false;
  String? _token;

  /// Firebase настроен только если в проект положены google-services.json / GoogleService-Info.plist.
  Future<void> initFirebase() async {
    try {
      await Firebase.initializeApp();
      _firebaseReady = true;
    } catch (err) {
      debugPrint('[Push] Firebase not configured: $err');
    }
  }

  Future<void> init() async {
    if (!_firebaseReady || _initialized) return;
    _initialized = true;
    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) return;

      // Бэкенд (firebase-admin) шлёт по FCM-токену; register()/onRegistered отдают FID и для него не подходят.
      // ignore: deprecated_member_use
      final token = await messaging.getToken();
      if (token != null) await _register(token);
      // ignore: deprecated_member_use
      messaging.onTokenRefresh.listen(_register);

      FirebaseMessaging.onMessageOpenedApp.listen(_handleTap);
      final initial = await messaging.getInitialMessage();
      if (initial != null) _handleTap(initial);
    } catch (err) {
      debugPrint('[Push] init failed: $err');
      _initialized = false;
    }
  }

  Future<void> _register(String token) async {
    _token = token;
    try {
      await Api.post('/api/mobile/push/register', {
        'token': token,
        'platform': Platform.isIOS ? 'ios' : 'android',
        'device_id': getDeviceId(),
      });
    } catch (err) {
      debugPrint('[Push] token register failed: $err');
    }
  }

  void _handleTap(RemoteMessage message) {
    final data = message.data;
    final type = data['type'];
    final path = data['path'];
    if (type == 'order_status') {
      onNavigate?.call('/orders');
      return;
    }
    if (type == 'reward_unlocked' || type == 'reward_selected' || type == 'reward_status') {
      onNavigate?.call(path is String && path.startsWith('/') ? path : '/rewards');
      return;
    }
    if (path is String && path.startsWith('/')) {
      onNavigate?.call(path);
      return;
    }
    final url = data['url'];
    if (url is String && RegExp(r'^https?://', caseSensitive: false).hasMatch(url)) {
      launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    }
  }

  Future<void> unregister() async {
    final token = _token;
    if (token == null) return;
    try {
      await Api.delete('/api/mobile/push/register', {'token': token});
    } catch (_) {}
    _token = null;
    _initialized = false;
  }
}
