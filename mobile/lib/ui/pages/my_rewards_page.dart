import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../services/rewards.dart';
import '../theme.dart';
import '../widgets/bottom_nav.dart';
import '../widgets/common.dart';
import '../widgets/reward_select_sheet.dart';
import 'progress_page.dart';

const _statusLabels = {
  'AVAILABLE': 'Можно выбрать',
  'CHOOSING': 'Выберите подарок',
  'SELECTED': 'Выбрано',
  'PROCESSING': 'Обрабатывается',
  'READY': 'Готово',
  'DELIVERED': 'Получена',
  'CANCELLED': 'Отменено',
  'LOCKED': 'Недоступно',
};

String _rewardLabel(Object? reward) {
  if (reward == null) return 'Подарок RunBonus';
  if (reward is String) return reward;
  if (reward is Map) return '${reward['name'] ?? reward['title'] ?? reward['description'] ?? 'Подарок RunBonus'}';
  return 'Подарок RunBonus';
}

class MyRewardsPage extends StatefulWidget {
  const MyRewardsPage({super.key});

  @override
  State<MyRewardsPage> createState() => _MyRewardsPageState();
}

class _MyRewardsPageState extends State<MyRewardsPage> {
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

  List<Map<String, dynamic>> _list(Object? v) =>
      (v is List ? v : const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

  Future<void> _load() async {
    try {
      List<Map<String, dynamic>> items;
      try {
        final mine = await fetchMyRewards();
        items = _list(mine is List ? mine : (mine is Map ? mine['items'] : null));
      } catch (_) {
        final data = await fetchRewardsProgress();
        items = _list(data['milestones']).where((m) => m['status'] != null && m['status'] != 'LOCKED').toList();
      }
      if (mounted) {
        setState(() {
          _items = items;
          _error = null;
        });
      }
    } catch (err) {
      if (mounted) setState(() => _error = errorMessage(err, 'Не удалось загрузить награды'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final count = _items.length;
    return TabPage(
      header: AppHeader(showAvatar: false, onBack: () => context.canPop() ? context.pop() : context.go('/rewards')),
      onRefresh: _load,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          GlassCard(
            child: Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(color: RB.neon.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
                  child: const Icon(Icons.redeem, color: RB.neon, size: 28),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('МОИ НАГРАДЫ', style: RB.label()),
                      Text('История подарков', style: RB.headline(size: 22)),
                      Text(
                        count > 0
                            ? '$count ${count == 1 ? 'запись' : 'записей'}'
                            : 'Пока пусто — бегайте и открывайте контрольные точки',
                        style: RB.body(size: 13, color: RB.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (_loading) const Loader(),
          if (_error != null) ErrorBox(_error!, onRetry: _load),
          if (!_loading && _error == null && _items.isEmpty)
            GlassCard(
              child: EmptyState(
                icon: Icons.redeem,
                title: 'Пока нет открытых наград',
                text: 'Продолжайте бегать — первый подарок появится здесь.',
                action: PrimaryButton(label: 'К наградам', compact: true, onPressed: () => context.go('/rewards')),
              ),
            ),
          for (final item in _items) ...[
            _RewardHistoryCard(
              item: item,
              onChoose: () async {
                if (await showRewardSelect(context, item['milestone_id'] ?? item['id'])) _load();
              },
            ),
            const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}

class _RewardHistoryCard extends StatelessWidget {
  const _RewardHistoryCard({required this.item, required this.onChoose});
  final Map<String, dynamic> item;
  final VoidCallback onChoose;

  @override
  Widget build(BuildContext context) {
    final milestone = item['milestone'] is Map ? item['milestone'] as Map : null;
    final distance = item['distance'] ?? item['distance_km'] ?? milestone?['distance'];
    final name = item['name'] ?? item['milestone_name'] ?? milestone?['name'];
    final status = item['status'];
    final reward = item['reward'] ?? item['reward_name'];
    final promo = item['promoCode'] ?? item['promo_code'] ?? (reward is Map ? reward['promoCode'] : null);
    final color = rewardStatusColor(status);

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${formatNumber(toDouble(distance), maxFraction: 1)} КМ', style: RB.label()),
                    Text('${name ?? ''}', style: RB.headline(size: 18)),
                  ],
                ),
              ),
              StatusPill(_statusLabels[status] ?? '${status ?? ''}', color: color),
            ],
          ),
          const SizedBox(height: 6),
          Text(_rewardLabel(reward), style: RB.body(color: RB.onSurfaceVariant)),
          if (promo != null && '$promo'.isNotEmpty) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: SelectableText('$promo', style: RB.headline(size: 18, color: RB.neon).copyWith(letterSpacing: 1.5))),
                PrimaryButton(
                  label: 'Копировать',
                  compact: true,
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: '$promo'));
                    showToast(context, 'Скопировано', success: true);
                  },
                ),
              ],
            ),
          ],
          const SizedBox(height: 10),
          if (canOpenMilestone(status))
            PrimaryButton(label: 'Выбрать подарок', compact: true, onPressed: onChoose)
          else
            Row(
              children: [
                Icon(status == 'DELIVERED' ? Icons.check_circle : Icons.local_shipping_outlined, size: 18, color: color),
                const SizedBox(width: 6),
                Text(_statusLabels[status] ?? 'В обработке', style: RB.body(size: 13, color: color)),
              ],
            ),
        ],
      ),
    );
  }
}
