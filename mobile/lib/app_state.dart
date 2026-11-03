import 'package:flutter/foundation.dart';

import 'core/api.dart';
import 'core/connectivity.dart';
import 'services/active_workout.dart';
import 'services/ads.dart';
import 'services/push.dart';
import 'workout/geolocation.dart';
import 'workout/workout_tracker.dart';

typedef User = Map<String, dynamic>;

/// Сессия пользователя: вход, профиль, выход.
class AppState extends ChangeNotifier {
  AppState() {
    Api.onForcedLogout = _onForcedLogout;
    ConnectivityService.instance.online.addListener(_onOnlineChanged);
  }

  User? _user;
  bool _loading = true;

  /// Сообщение для экрана входа (например, «аккаунт активен на другом телефоне»).
  String? authNotice;

  /// После регистрации — сразу в магазин.
  bool openShopAfterAuth = false;

  /// Редирект в магазин без активации — один раз за запуск.
  bool shopRedirectDone = false;

  User? get user => _user;
  bool get loading => _loading;
  bool get isAuthenticated => _user != null;

  bool get needsActivation => _user != null && (_user!['needsActivation'] == true || _user!['activeShoe'] == null);

  Future<void> bootstrap() async {
    if (Api.token == null) {
      _loading = false;
      notifyListeners();
      return;
    }
    try {
      final profile = Map<String, dynamic>.from(await Api.get('/api/auth/me') as Map);
      await Api.cacheUser(profile);
      _user = profile;
    } catch (err) {
      if (err is ApiException && (err.status == 401 || err.code == 'DEVICE_MISMATCH')) {
        await Api.setToken(null);
      } else {
        final cached = Api.cachedUser();
        if (cached != null) {
          _user = cached;
        } else if (!isNetworkError(err)) {
          await Api.setToken(null);
        }
      }
    }
    _loading = false;
    notifyListeners();
    if (_user != null) _afterLogin();
  }

  void _afterLogin() {
    AdsConfig.instance.refresh();
    PushService.instance.init();
    if (needsActivation) return;
    syncActiveWorkoutWithServer().then((sync) {
      final id = sync.workoutId;
      if (id != null) WorkoutTracker.instance.start(id, serverStartedAt: sync.startedAt);
    });
  }

  Future<void> onAuth(Map<String, dynamic> data) async {
    await Api.setToken(data['token'] as String?);
    final user = Map<String, dynamic>.from(data['user'] as Map);
    await Api.cacheUser(user);
    _user = user;
    if (data['message'] is String) authNotice = data['message'] as String;
    if (data['isNew'] == true || user['isNew'] == true) openShopAfterAuth = true;
    notifyListeners();
    _afterLogin();
  }

  void setUser(User profile) {
    _user = profile;
    Api.cacheUser(profile);
    notifyListeners();
  }

  /// Обновить профиль с сервера; при ошибке остаётся кэш.
  Future<User?> refreshProfile() async {
    try {
      final profile = Map<String, dynamic>.from(await Api.get('/api/auth/me') as Map);
      setUser(profile);
      return profile;
    } catch (_) {
      return _user;
    }
  }

  void _onOnlineChanged() {
    if (ConnectivityService.instance.online.value && _user != null) {
      refreshProfile();
      AdsConfig.instance.refresh();
    }
  }

  void _onForcedLogout(String notice) {
    authNotice = notice;
    final id = getActiveWorkoutId();
    WorkoutTracker.instance.stop();
    if (id != null) clearWorkoutLocal(id);
    setActiveWorkoutId(null);
    _user = null;
    notifyListeners();
  }

  Future<void> logout() async {
    await PushService.instance.unregister();
    await Api.logout();
    _user = null;
    shopRedirectDone = false;
    notifyListeners();
  }
}
