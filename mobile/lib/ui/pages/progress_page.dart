import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../services/rewards.dart';
import '../theme.dart';
import '../widgets/bottom_nav.dart';
import '../widgets/common.dart';
import '../widgets/reward_select_sheet.dart';

const _userVisible = {
  'LOCKED': 'Закрыто',
  'AVAILABLE': 'Доступно',
  'CHOOSING': 'Выберите',
  'SELECTED': 'Выбрано',
  'PROCESSING': 'Обработка',
  'READY': 'Готово',
  'DELIVERED': 'Получено',
  'CANCELLED': 'Отменено',
};

bool canOpenMilestone(Object? status) => status == 'AVAILABLE' || status == 'CHOOSING';
bool _isClaimed(Object? status) => const ['SELECTED', 'PROCESSING', 'READY', 'DELIVERED'].contains(status);

Color rewardStatusColor(Object? status) => switch (status) {
      'AVAILABLE' || 'CHOOSING' => RB.neon,
      'DELIVERED' || 'READY' => const Color(0xFF00E5BC),
      'SELECTED' || 'PROCESSING' => const Color(0xFF00D4FF),
      'CANCELLED' => RB.error,
      _ => RB.onSurfaceVariant,
    };

String _statusText(Map<String, dynamic> m) {
  final status = m['status'];
  if (status == 'DELIVERED') return 'Получено';
  if (_isClaimed(status)) return _userVisible[status] ?? 'Получено';
  if (canOpenMilestone(status)) return 'Доступно';
  if (status == 'LOCKED') return '${formatKm(m['remainingKm'])} км';
  return _userVisible[status] ?? '${status ?? ''}';
}

class ProgressPage extends StatefulWidget {
  const ProgressPage({super.key, this.milestoneId});
  final String? milestoneId;

  @override
  State<ProgressPage> createState() => _ProgressPageState();
}

class _ProgressPageState extends State<ProgressPage> {
  Map<String, dynamic>? _progress;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load().then((data) {
      final id = widget.milestoneId;
      if (data == null || id == null || !mounted) return;
      final m = _milestones(data).where((e) => '${e['id']}' == id).firstOrNull;
      if (m == null || canOpenMilestone(m['status'])) _open(id);
    }).whenComplete(() {
      if (mounted) setState(() => _loading = false);
    });
  }

  List<Map<String, dynamic>> _milestones(Map<String, dynamic>? p) =>
      (p?['milestones'] as List?)?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? [];

  Future<Map<String, dynamic>?> _load() async {
    try {
      final data = await fetchRewardsProgress();
      if (mounted) {
        setState(() {
          _progress = data;
          _error = null;
        });
      }
      return data;
    } catch (err) {
      if (mounted) setState(() => _error = errorMessage(err, 'Не удалось загрузить награды'));
      return null;
    }
  }

  Future<void> _open(Object id) async {
    final selected = await showRewardSelect(context, id);
    if (widget.milestoneId != null && mounted) context.go('/milestones');
    if (selected) _load();
  }

  @override
  Widget build(BuildContext context) {
    final milestones = _milestones(_progress);
    final claimable = milestones.where((m) => canOpenMilestone(m['status'])).length;
    return TabPage(
      header: const AppHeader(showAvatar: false),
      onRefresh: _load,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: PageTitle(
                  'Награды',
                  subtitle: '${formatKm(_progress?['totalDistance'])} км · '
                      '${claimable > 0 ? '$claimable доступно' : 'накопите км для подарков'}',
                ),
              ),
              PrimaryButton(label: 'Мои', compact: true, onPressed: () => context.go('/my-rewards')),
            ],
          ),
          if (claimable > 0)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: GlassCard(
                borderColor: RB.neon.withValues(alpha: 0.4),
                child: Row(
                  children: [
                    const Icon(Icons.redeem, color: RB.neon),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        claimable == 1
                            ? 'Есть доступная награда — нажмите карточку, чтобы выбрать подарок'
                            : '$claimable награды ждут выбора',
                        style: RB.body(size: 13),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          if (_loading) const Loader(),
          if (_error != null) ErrorBox(_error!, onRetry: _load),
          if (!_loading && _error == null && milestones.isEmpty)
            const GlassCard(child: EmptyState(icon: Icons.redeem, title: 'Контрольные точки пока не настроены.')),
          for (final m in milestones) ...[
            _MilestoneCard(milestone: m, onTap: canOpenMilestone(m['status']) ? () => _open(m['id']) : null),
            const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}

class _MilestoneCard extends StatelessWidget {
  const _MilestoneCard({required this.milestone, this.onTap});
  final Map<String, dynamic> milestone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final status = milestone['status'];
    final color = rewardStatusColor(status);
    final reward = milestone['reward'];
    final rewardName = reward is Map ? reward['name'] : null;
    return Opacity(
      opacity: status == 'LOCKED' ? 0.7 : 1,
      child: GlassCard(
        onTap: onTap,
        borderColor: onTap != null ? RB.neon.withValues(alpha: 0.4) : null,
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
              child: Icon(
                status == 'LOCKED' ? Icons.lock_outline : (_isClaimed(status) ? Icons.check_circle : Icons.redeem),
                color: color,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text('${formatKm(milestone['distance'])} км', style: RB.headline(size: 18)),
                      const SizedBox(width: 8),
                      StatusPill(_statusText(milestone), color: color),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text('${milestone['name'] ?? ''}', style: RB.body(size: 13, color: RB.onSurfaceVariant)),
                  if (rewardName != null) Text('$rewardName', style: RB.body(size: 13, color: RB.neon)),
                  if (onTap != null) Text('Нажмите, чтобы выбрать', style: RB.body(size: 12, weight: FontWeight.w600, color: RB.neon)),
                ],
              ),
            ),
            if (onTap != null) const Icon(Icons.chevron_right, color: RB.neon),
          ],
        ),
      ),
    );
  }
}
