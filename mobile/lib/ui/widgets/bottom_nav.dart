import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../services/cart.dart';
import '../../services/challenges.dart';
import '../theme.dart';

class _Tab {
  const _Tab(this.to, this.label, this.icon, {this.match = const [], this.exact = false, this.badge});
  final String to;
  final String label;
  final IconData icon;
  final List<String> match;
  final bool exact;
  final String? badge;

  bool matches(String path) {
    if (exact) return path == to;
    final prefixes = match.isEmpty ? [to] : match;
    return prefixes.any((p) => path == p || path.startsWith('$p/'));
  }
}

const _tabs = [
  _Tab('/', 'Главная', Icons.home_outlined, exact: true),
  _Tab('/leaderboard', 'Топ км', Icons.emoji_events_outlined),
  _Tab('/rewards', 'Задания', Icons.flag_outlined,
      badge: 'challenges', match: ['/rewards', '/my-rewards', '/challenges', '/milestones']),
  _Tab('/shop', 'Магазин', Icons.storefront_outlined, badge: 'cart', match: ['/shop', '/cart', '/orders']),
  _Tab('/profile', 'Профиль', Icons.person_outline),
];

class BottomNav extends StatefulWidget {
  const BottomNav({super.key});

  @override
  State<BottomNav> createState() => _BottomNavState();
}

class _BottomNavState extends State<BottomNav> {
  int _challengeBadge = 0;
  String? _loadedFor;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final path = GoRouterState.of(context).uri.path;
    if (path != _loadedFor) {
      _loadedFor = path;
      challengeBadgeCount().then((n) {
        if (mounted) setState(() => _challengeBadge = n);
      }).catchError((_) {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final path = GoRouterState.of(context).uri.path;
    return Container(
      padding: EdgeInsets.fromLTRB(8, 10, 8, MediaQuery.paddingOf(context).bottom + 10),
      decoration: BoxDecoration(
        color: RB.bg.withValues(alpha: 0.96),
        border: Border(top: BorderSide(color: RB.outline.withValues(alpha: 0.2))),
      ),
      child: ListenableBuilder(
        listenable: Cart.instance,
        builder: (context, _) {
          final cartCount = Cart.instance.count;
          return Row(
            children: [
              for (final tab in _tabs)
                Expanded(
                  child: _NavItem(
                    tab: tab,
                    active: tab.matches(path),
                    badge: switch (tab.badge) {
                      'challenges' => _challengeBadge > 0 ? '$_challengeBadge' : null,
                      'cart' => cartCount > 0 ? (cartCount > 9 ? '9+' : '$cartCount') : null,
                      _ => null,
                    },
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({required this.tab, required this.active, this.badge});
  final _Tab tab;
  final bool active;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final color = active ? RB.onNeon : RB.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Material(
        color: active ? RB.neon : Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => context.go(tab.to),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Badge(
                  isLabelVisible: badge != null,
                  label: Text(badge ?? '', style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700)),
                  backgroundColor: active ? RB.onNeon : RB.neon,
                  textColor: active ? RB.neon : RB.onNeon,
                  child: Icon(tab.icon, color: color, size: 24),
                ),
                const SizedBox(height: 4),
                Text(tab.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: RB.body(size: 11, weight: FontWeight.w600, color: color)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Каркас вкладки: шапка, контент с прокруткой, нижняя навигация.
class TabPage extends StatelessWidget {
  const TabPage({super.key, required this.child, this.header, this.onRefresh, this.padding = const EdgeInsets.fromLTRB(20, 20, 20, 32)});
  final Widget child;
  final PreferredSizeWidget? header;
  final Future<void> Function()? onRefresh;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    Widget body = SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: padding,
      child: child,
    );
    if (onRefresh != null) {
      body = RefreshIndicator(onRefresh: onRefresh!, color: RB.neon, backgroundColor: RB.surfaceHigh, child: body);
    }
    return Scaffold(
      appBar: header,
      body: body,
      bottomNavigationBar: const BottomNav(),
    );
  }
}
