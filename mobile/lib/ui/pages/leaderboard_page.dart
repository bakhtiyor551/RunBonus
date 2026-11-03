import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app_state.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../theme.dart';
import '../widgets/bottom_nav.dart';
import '../widgets/common.dart';

class LeaderboardPage extends StatefulWidget {
  const LeaderboardPage({super.key});

  @override
  State<LeaderboardPage> createState() => _LeaderboardPageState();
}

class _LeaderboardPageState extends State<LeaderboardPage> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load().whenComplete(() {
      if (mounted) setState(() => _loading = false);
    });
  }

  Future<void> _load() async {
    try {
      final data = await Api.get('/api/leaderboard?limit=20');
      final items = data is Map ? data['items'] : null;
      if (!mounted) return;
      setState(() {
        _items = (items is List ? items : const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        _error = null;
      });
    } catch (err) {
      if (mounted) setState(() => _error = errorMessage(err, 'Ошибка загрузки'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AppState>().user;
    final myId = '${user?['id'] ?? user?['clientId'] ?? ''}';
    return TabPage(
      header: const AppHeader(showAvatar: false),
      onRefresh: _load,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const PageTitle('Топ км', subtitle: '20 клиентов с наибольшим пробегом'),
          for (final item in _items) ...[
            _LeaderRow(item: item, highlight: myId.isNotEmpty && '${item['id']}' == myId),
            const SizedBox(height: 8),
          ],
          if (!_loading && _items.isEmpty && _error == null)
            const GlassCard(
              child: EmptyState(
                icon: Icons.emoji_events_outlined,
                title: 'Пока нет рейтинга',
                text: 'После подтверждённых тренировок здесь появятся лидеры.',
              ),
            ),
          if (_error != null) ErrorBox(_error!, onRetry: _load),
          if (_loading) const Loader(),
        ],
      ),
    );
  }
}

class _LeaderRow extends StatelessWidget {
  const _LeaderRow({required this.item, required this.highlight});
  final Map<String, dynamic> item;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final name = '${item['name'] ?? ''}'.trim();
    final title = name.isNotEmpty ? name : '${item['label'] ?? item['id'] ?? ''}';
    final rank = toInt(item['rank']);
    final avatar = Api.mediaUrl(item['avatar_url'] as String?);
    final rankColor = switch (rank) {
      1 => const Color(0xFFFFD54F),
      2 => const Color(0xFFCFD8DC),
      3 => const Color(0xFFD7965B),
      _ => null,
    };
    return GlassCard(
      borderColor: highlight ? RB.neon.withValues(alpha: 0.5) : null,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: rankColor != null ? BoxDecoration(color: rankColor, shape: BoxShape.circle) : null,
            child: Text('$rank', style: RB.headline(size: 14, color: rankColor != null ? const Color(0xFF111111) : RB.onSurfaceVariant)),
          ),
          const SizedBox(width: 12),
          CircleAvatar(
            radius: 20,
            backgroundColor: RB.surfaceHighest,
            foregroundImage: avatar != null ? CachedNetworkImageProvider(avatar) : null,
            child: Text(title.isNotEmpty ? title.characters.first.toUpperCase() : '?', style: RB.headline(size: 16, color: RB.neon)),
          ),
          const SizedBox(width: 12),
          Expanded(child: Text(title, style: RB.body(size: 15, weight: FontWeight.w600), overflow: TextOverflow.ellipsis)),
          Text.rich(
            TextSpan(children: [
              TextSpan(text: formatKm(item['totalKm']), style: RB.headline(size: 18, color: highlight ? RB.neon : RB.onSurface)),
              TextSpan(text: ' км', style: RB.body(size: 12, color: RB.onSurfaceVariant)),
            ]),
          ),
        ],
      ),
    );
  }
}
