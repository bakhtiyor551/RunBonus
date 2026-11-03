import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../services/challenges.dart';
import '../theme.dart';
import '../widgets/bottom_nav.dart';
import '../widgets/common.dart';
import '../widgets/forms.dart';

typedef Json = Map<String, dynamic>;

Json? _asJson(Object? v) => v is Map ? Map<String, dynamic>.from(v) : null;

class ChallengesPage extends StatefulWidget {
  const ChallengesPage({super.key});

  @override
  State<ChallengesPage> createState() => _ChallengesPageState();
}

class _ChallengesPageState extends State<ChallengesPage> {
  Json? _state;
  String? _error;
  bool _loading = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load().whenComplete(() {
      if (mounted) setState(() => _loading = false);
    });
  }

  Future<void> _load() async {
    try {
      final data = await fetchChallengeState();
      if (mounted) setState(() => _state = data);
    } catch (err) {
      if (mounted) setState(() => _error = errorMessage(err, 'Ошибка'));
    }
  }

  Future<void> _start(Object? levelId) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data = await startChallenge(levelId);
      if (mounted) setState(() => _state = data);
    } catch (err) {
      if (mounted) setState(() => _error = errorMessage(err, 'Не удалось начать'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _claim(Object challengeId) async {
    await showDetailSheet(
      context,
      title: 'Награда',
      builder: (_) => _ClaimSheet(
        challengeId: challengeId,
        onDone: (data) {
          if (data['challenge'] != null || data['nextLevel'] != null || data['levels'] != null) {
            if (mounted) setState(() => _state = data);
          }
        },
      ),
    );
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final ch = _asJson(_state?['challenge']);
    final levels = (_state?['levels'] as List?)?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? [];

    return TabPage(
      header: const AppHeader(),
      onRefresh: _load,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Expanded(child: PageTitle('Задания', subtitle: 'L1 → L5 · цель в км · срок · награда')),
              PrimaryButton(label: 'Мои награды', compact: true, onPressed: () => context.go('/my-rewards')),
            ],
          ),
          if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: ErrorBox(_error!)),
          if (_loading) const Loader(),
          if (!_loading && ch?['status'] == 'COMPLETED' && ch?['rewardClaimed'] != true)
            _Banner(
              title: 'Задание выполнено',
              text: '${formatKm(ch!['currentKm'])} / ${formatKm(ch['targetKm'])} KM — заберите награду',
              action: 'Забрать',
              onAction: _busy ? null : () => _claim(ch['id']),
              tone: RB.neon,
            ),
          if (!_loading && ch?['status'] == 'EXPIRED')
            _Banner(
              title: 'Время истекло',
              text: '${formatKm(ch!['currentKm'])} / ${formatKm(ch['targetKm'])} KM — прогресс сброшен',
              action: _busy ? '…' : 'Заново',
              onAction: _busy ? null : () => _start(ch['levelId']),
              tone: RB.error,
            ),
          if (!_loading && _state?['allDone'] == true)
            const _Banner(title: 'Все задания пройдены', text: 'Вы чемпион RunBonus', tone: RB.neon),
          for (final level in levels) ...[
            Builder(builder: (context) {
              final isCurrent = ch != null && toInt(ch['levelNum']) == toInt(level['levelNum']);
              final status = '${isCurrent ? ch['status'] : level['status'] ?? 'LOCKED'}';
              final canClaim = status == 'COMPLETED' && isCurrent && ch['rewardClaimed'] != true;
              final remaining = isCurrent ? _asJson(ch['remaining']) : null;
              return ChallengeTierCard(
                level: level,
                status: status,
                currentKm: isCurrent ? toDoubleOrNull(ch['currentKm']) : null,
                progressPercent: isCurrent ? toDouble(ch['progressPercent']) : 0,
                remainingLabel: isCurrent && status == 'ACTIVE' ? (remaining?['label'] as String?) : null,
                actionLabel: canClaim ? 'Забрать награду' : null,
                onAction: canClaim ? () => _claim(ch['id']) : null,
              );
            }),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.title, required this.text, required this.tone, this.action, this.onAction});
  final String title;
  final String text;
  final Color tone;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: GlassCard(
        borderColor: tone.withValues(alpha: 0.45),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: RB.headline(size: 18, color: tone)),
                  const SizedBox(height: 4),
                  Text(text, style: RB.body(size: 13, color: RB.onSurfaceVariant)),
                ],
              ),
            ),
            if (action != null) ...[
              const SizedBox(width: 12),
              PrimaryButton(label: action!, compact: true, onPressed: onAction),
            ],
          ],
        ),
      ),
    );
  }
}

/// Карточка уровня: «L1 · 50 / KM ACTIVE · награда».
class ChallengeTierCard extends StatelessWidget {
  const ChallengeTierCard({
    super.key,
    required this.level,
    required this.status,
    this.currentKm,
    this.progressPercent = 0,
    this.remainingLabel,
    this.actionLabel,
    this.onAction,
  });

  final Json level;
  final String status;
  final double? currentKm;
  final double progressPercent;
  final String? remainingLabel;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final (label, tone) = switch (status) {
      'ACTIVE' => ('KM ACTIVE', RB.neon),
      'COMPLETED' => ('KM DONE', const Color(0xFF00E5BC)),
      'EXPIRED' => ('KM EXPIRED', RB.error),
      _ => ('KM LOCKED', RB.onSurfaceVariant),
    };
    final locked = status != 'ACTIVE' && status != 'COMPLETED' && status != 'EXPIRED';
    final target = level['targetKm'];
    final name = '${level['name'] ?? ''}'.trim();
    final description = '${level['description'] ?? ''}'.trim();
    final deadline = level['deadlineDays'];

    return Opacity(
      opacity: locked ? 0.7 : 1,
      child: GlassCard(
        borderColor: status == 'ACTIVE' ? RB.neon.withValues(alpha: 0.45) : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text('L${level['levelNum']} · ${formatKm(target)}',
                    style: RB.headline(size: 20).copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
                const SizedBox(width: 10),
                StatusPill(label, color: tone),
              ],
            ),
            const SizedBox(height: 8),
            Text.rich(TextSpan(children: [
              TextSpan(text: name.isNotEmpty ? name : 'Задание ${formatKm(target)} км'),
              if (deadline != null) TextSpan(text: ' · $deadline дн.', style: RB.body(color: RB.onSurfaceVariant)),
            ]), style: RB.body(size: 15, weight: FontWeight.w600)),
            if (description.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(description, style: RB.body(size: 13, color: RB.onSurfaceVariant)),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                const Icon(Icons.card_giftcard, size: 16, color: RB.neon),
                const SizedBox(width: 6),
                Expanded(
                  child: Text('${level['exampleReward'] ?? 'Награда RunBonus'}', style: RB.body(size: 13, color: RB.neon)),
                ),
              ],
            ),
            if (status == 'ACTIVE' && currentKm != null) ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  Text.rich(TextSpan(children: [
                    TextSpan(text: formatKm(currentKm), style: RB.headline(size: 18)),
                    TextSpan(text: ' / ${formatKm(target)} км', style: RB.body(size: 13, color: RB.onSurfaceVariant)),
                  ])),
                  const Spacer(),
                  if (remainingLabel != null) ...[
                    const Icon(Icons.schedule, size: 14, color: RB.onSurfaceVariant),
                    const SizedBox(width: 4),
                    Text(remainingLabel!, style: RB.body(size: 12, color: RB.onSurfaceVariant)),
                  ],
                ],
              ),
              const SizedBox(height: 8),
              ProgressBar(value: progressPercent / 100),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 14),
              Align(
                alignment: Alignment.centerLeft,
                child: PrimaryButton(label: actionLabel!, icon: Icons.arrow_forward, compact: true, onPressed: onAction),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class ProgressBar extends StatelessWidget {
  const ProgressBar({super.key, required this.value, this.height = 8});
  final double value;
  final double height;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: LinearProgressIndicator(
        value: value.clamp(0, 1),
        minHeight: height,
        backgroundColor: Colors.white.withValues(alpha: 0.08),
        color: RB.neon,
      ),
    );
  }
}

class _ClaimSheet extends StatefulWidget {
  const _ClaimSheet({required this.challengeId, required this.onDone});
  final Object challengeId;
  final void Function(Json data) onDone;

  @override
  State<_ClaimSheet> createState() => _ClaimSheetState();
}

class _ClaimSheetState extends State<_ClaimSheet> {
  bool _loading = true;
  bool _saving = false;
  List<Json> _options = [];
  String _example = '';
  String? _selectedId;
  String? _size;
  String? _error;
  String _phase = 'pick';
  Json? _result;

  @override
  void initState() {
    super.initState();
    fetchChallengeRewards(widget.challengeId).then((data) {
      if (!mounted) return;
      final opts = (data['options'] as List?)?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? [];
      setState(() {
        _options = opts;
        _example = '${data['exampleReward'] ?? _asJson(data['challenge'])?['exampleReward'] ?? ''}';
        if (opts.isNotEmpty) _selectedId = '${opts.first['id']}';
      });
    }).catchError((Object err) {
      if (mounted) setState(() => _error = errorMessage(err, 'Ошибка'));
    }).whenComplete(() {
      if (mounted) setState(() => _loading = false);
    });
  }

  Json? get _selected => _options.where((o) => '${o['id']}' == _selectedId).firstOrNull;

  Future<void> _submit() async {
    setState(() => _error = null);
    final selected = _selected;
    if (_options.isNotEmpty && selected == null) return setState(() => _error = 'Выберите награду');
    if (selected?['requiresSize'] == true && _size == null) return setState(() => _error = 'Выберите размер');
    setState(() => _saving = true);
    try {
      final data = await claimChallengeReward(widget.challengeId, {
        'rewardId': ?selected?['id'],
        'size': ?_size,
      });
      if (!mounted) return;
      setState(() {
        _result = data;
        _phase = data['nextLevel'] != null ? 'next' : 'success';
      });
      widget.onDone(data);
    } catch (err) {
      if (mounted) setState(() => _error = errorMessage(err, 'Не удалось получить награду'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _startNext() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final data = await startChallenge(_asJson(_result?['nextLevel'])?['levelId']);
      widget.onDone(data);
      if (mounted) Navigator.pop(context);
    } catch (err) {
      if (mounted) setState(() => _error = errorMessage(err, 'Не удалось начать задание'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final reward = _asJson(_result?['reward']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_loading) const Loader(padding: EdgeInsets.all(24)),
        if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: ErrorBox(_error!)),
        if (_phase == 'pick' && !_loading) ...[
          Text('🎁 Выберите награду', style: RB.body(color: RB.onSurfaceVariant)),
          const SizedBox(height: 12),
          if (_options.isEmpty)
            GlassCard(child: Text(_example.isNotEmpty ? _example : 'Награда RunBonus', style: RB.body(weight: FontWeight.w700))),
          for (final opt in _options) ...[
            Opacity(
              opacity: opt['inStock'] == false ? 0.4 : 1,
              child: GlassCard(
                borderColor: '${opt['id']}' == _selectedId ? RB.neon : null,
                onTap: opt['inStock'] == false
                    ? null
                    : () => setState(() {
                          _selectedId = '${opt['id']}';
                          _size = null;
                        }),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${opt['type'] ?? ''}'.toUpperCase(), style: RB.label(size: 10)),
                          const SizedBox(height: 4),
                          Text('${opt['name'] ?? ''}', style: RB.body(size: 15, weight: FontWeight.w700)),
                          if (opt['discountPercent'] != null)
                            Text('Скидка ${opt['discountPercent']}%', style: RB.body(size: 13, color: RB.neon)),
                        ],
                      ),
                    ),
                    if ('${opt['id']}' == _selectedId) const Icon(Icons.check_circle, color: RB.neon),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
          if (_selected?['requiresSize'] == true && (_selected?['sizes'] as List?)?.isNotEmpty == true) ...[
            const SizedBox(height: 4),
            const FieldLabel('Размер'),
            SizePicker(
              sizes: (_selected!['sizes'] as List)
                  .whereType<Map>()
                  .where((s) => s['inStock'] != false)
                  .map((s) => <String, dynamic>{'size': s['size']})
                  .toList(),
              value: _size,
              onChanged: (s) => setState(() => _size = s),
            ),
          ],
          const SizedBox(height: 16),
          PrimaryButton(label: _saving ? 'Отправка…' : 'Забрать награду', loading: _saving, onPressed: _submit),
        ],
        if (_phase == 'success') ...[
          const Icon(Icons.check_circle, size: 56, color: RB.neon),
          const SizedBox(height: 12),
          Text('Награда получена', textAlign: TextAlign.center, style: RB.headline(size: 22)),
          const SizedBox(height: 6),
          Text('${reward?['name'] ?? ''}', textAlign: TextAlign.center, style: RB.body(color: RB.onSurfaceVariant)),
          if (reward?['promoCode'] != null) ...[
            const SizedBox(height: 12),
            Center(
              child: SelectableText('${reward!['promoCode']}', style: RB.headline(size: 22, color: RB.neon).copyWith(letterSpacing: 2)),
            ),
          ],
          const SizedBox(height: 16),
          PrimaryButton(label: 'Закрыть', onPressed: () => Navigator.pop(context)),
        ],
        if (_phase == 'next') ...[
          Text('Награда получена: ${reward?['name'] ?? ''}', style: RB.body(color: RB.onSurfaceVariant)),
          const SizedBox(height: 12),
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('СЛЕДУЮЩЕЕ ЗАДАНИЕ', style: RB.label(size: 11)),
                const SizedBox(height: 8),
                Text('🎯 ${formatKm(_asJson(_result?['nextLevel'])?['targetKm'])} KM', style: RB.headline(size: 22)),
                const SizedBox(height: 4),
                Text('⏱️ ${_asJson(_result?['nextLevel'])?['deadlineDays'] ?? ''} дней', style: RB.body(color: RB.onSurfaceVariant)),
              ],
            ),
          ),
          const SizedBox(height: 16),
          PrimaryButton(label: _saving ? 'Старт…' : 'Продолжить', loading: _saving, onPressed: _startNext),
          const SizedBox(height: 8),
          OutlineButtonRB(label: 'Позже', expand: true, onPressed: () => Navigator.pop(context)),
        ],
      ],
    );
  }
}
