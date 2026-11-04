import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import 'app_state.dart';
import 'core/connectivity.dart';
import 'core/storage.dart';
import 'router.dart';
import 'services/push.dart';
import 'ui/theme.dart';
import 'ui/widgets/common.dart';
import 'workout/geolocation.dart';
import 'workout/workout_tracker.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Storage.init();
  Intl.defaultLocale = 'ru';
  await initializeDateFormatting('ru');
  await PushService.instance.initFirebase();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness: Brightness.dark,
    systemNavigationBarColor: RB.bg,
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  ConnectivityService.instance.start();

  final state = AppState();
  runApp(ChangeNotifierProvider.value(value: state, child: RunBonusApp(state: state)));
  state.bootstrap();
}

class RunBonusApp extends StatefulWidget {
  const RunBonusApp({super.key, required this.state});
  final AppState state;

  @override
  State<RunBonusApp> createState() => _RunBonusAppState();
}

class _RunBonusAppState extends State<RunBonusApp> {
  late final GoRouter _router = buildRouter(widget.state);

  @override
  void initState() {
    super.initState();
    PushService.instance.onNavigate = (path) => _router.go(path);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'RunBonus',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      scaffoldMessengerKey: rootScaffoldMessengerKey,
      locale: const Locale('ru'),
      supportedLocales: const [Locale('ru')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      routerConfig: _router,
      builder: (context, child) {
        final loading = context.select<AppState, bool>((s) => s.loading);
        return Stack(
          children: [
            if (loading) const SplashView() else child ?? const SizedBox.shrink(),
            const _OfflineOverlay(),
          ],
        );
      },
    );
  }
}

/// Без интернета: во время тренировки — плашка, иначе — полноэкранная заставка.
class _OfflineOverlay extends StatelessWidget {
  const _OfflineOverlay();

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: ConnectivityService.instance.online,
      builder: (context, online, _) {
        if (online) return const SizedBox.shrink();
        return ValueListenableBuilder<WorkoutSnapshot?>(
          valueListenable: WorkoutTracker.instance.snapshot,
          builder: (context, snap, _) {
            final activeWorkout = snap != null || getActiveWorkoutId() != null;
            if (!activeWorkout) return const Positioned.fill(child: SplashView(offline: true));
            final insets = MediaQuery.paddingOf(context);
            return Positioned(
              left: 16,
              right: 16,
              bottom: insets.bottom + 80,
              child: Material(
                color: const Color(0xEB141812),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(color: RB.neon.withValues(alpha: 0.25)),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Row(
                    children: [
                      const Icon(Icons.wifi_off, size: 18, color: RB.neon),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Нет интернета — тренировка продолжается, данные сохранятся локально',
                          style: RB.body(size: 13, weight: FontWeight.w500),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }
}
