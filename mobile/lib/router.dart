import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'app_state.dart';
import 'ui/pages/cart_page.dart';
import 'ui/pages/challenges_page.dart';
import 'ui/pages/home_page.dart';
import 'ui/pages/leaderboard_page.dart';
import 'ui/pages/login_page.dart';
import 'ui/pages/my_orders_page.dart';
import 'ui/pages/my_rewards_page.dart';
import 'ui/pages/product_detail_page.dart';
import 'ui/pages/profile_page.dart';
import 'ui/pages/progress_page.dart';
import 'ui/pages/shop_page.dart';
import 'ui/pages/workout_history_page.dart';
import 'ui/pages/workout_page.dart';

const _legacyRedirects = {
  '/progress': '/rewards',
  '/activate': '/shop',
  '/summary': '/',
  '/wallet': '/rewards',
  '/history': '/workouts',
};

bool _onShopFlow(String path) => path == '/shop' || path.startsWith('/shop/') || path == '/cart' || path == '/orders';

GoRouter buildRouter(AppState state) {
  return GoRouter(
    refreshListenable: state,
    initialLocation: '/',
    redirect: (context, s) {
      final path = s.uri.path;
      if (!state.isAuthenticated) return path == '/login' ? null : '/login';
      if (path == '/login') return '/';
      final legacy = _legacyRedirects[path];
      if (legacy != null) return legacy;

      // Без активации — при каждом запуске сначала магазин; дальше можно смотреть другие разделы.
      if (state.needsActivation) {
        final force = state.openShopAfterAuth;
        if (!state.shopRedirectDone || force) {
          state.shopRedirectDone = true;
          state.openShopAfterAuth = false;
          if (!_onShopFlow(path)) return '/shop';
        }
      } else {
        state.shopRedirectDone = false;
        state.openShopAfterAuth = false;
      }
      return null;
    },
    errorBuilder: (context, s) => const _RedirectHome(),
    routes: [
      GoRoute(path: '/login', builder: (_, _) => const LoginPage()),
      GoRoute(path: '/', builder: (_, _) => const HomePage()),
      GoRoute(path: '/profile', builder: (_, _) => const ProfilePage()),
      GoRoute(path: '/workout', builder: (_, _) => const WorkoutPage()),
      GoRoute(path: '/rewards', builder: (_, _) => const ChallengesPage()),
      GoRoute(path: '/challenges', builder: (_, _) => const ChallengesPage()),
      GoRoute(
        path: '/milestones',
        builder: (_, s) => ProgressPage(milestoneId: s.uri.queryParameters['milestone']),
      ),
      GoRoute(path: '/my-rewards', builder: (_, _) => const MyRewardsPage()),
      GoRoute(path: '/workouts', builder: (_, _) => const WorkoutHistoryPage()),
      GoRoute(path: '/leaderboard', builder: (_, _) => const LeaderboardPage()),
      GoRoute(path: '/shop', builder: (_, _) => const ShopPage()),
      GoRoute(path: '/shop/:id', builder: (_, s) => ProductDetailPage(productId: s.pathParameters['id']!)),
      GoRoute(path: '/cart', builder: (_, _) => const CartPage()),
      GoRoute(path: '/orders', builder: (_, _) => const MyOrdersPage()),
    ],
  );
}

class _RedirectHome extends StatefulWidget {
  const _RedirectHome();

  @override
  State<_RedirectHome> createState() => _RedirectHomeState();
}

class _RedirectHomeState extends State<_RedirectHome> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.go('/');
    });
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
