import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api.dart';
import '../../services/rewards.dart';
import '../theme.dart';
import 'common.dart';
import 'forms.dart';

typedef Json = Map<String, dynamic>;

const _defaultSizes = ['S', 'M', 'L', 'XL', 'XXL'];
const _defaultColors = ['Чёрный', 'Белый', 'Красный'];

String rewardTypeLabel(Object? type) => switch (type) {
      'DISCOUNT' => 'Скидка',
      'PRODUCT' => 'Подарок',
      'SPECIAL' => 'Специальный',
      'VIP' => 'VIP',
      _ => 'Награда',
    };

String _extractPromoCode(Object? result) {
  if (result is! Map) return '';
  for (final source in [result, result['selected'], result['selection']]) {
    if (source is! Map) continue;
    final code = source['promoCode'] ?? source['promo_code'] ?? (identical(source, result) ? source['code'] : null);
    if (code != null && '$code'.isNotEmpty) return '$code';
  }
  return '';
}

/// Открыть выбор подарка за контрольную точку. Возвращает true, если награда выбрана.
Future<bool> showRewardSelect(BuildContext context, Object milestoneId) async {
  var selected = false;
  await showDetailSheet(
    context,
    title: 'Подарок',
    builder: (_) => _RewardSelect(milestoneId: milestoneId, onSelected: () => selected = true),
  );
  return selected;
}

class _RewardSelect extends StatefulWidget {
  const _RewardSelect({required this.milestoneId, required this.onSelected});
  final Object milestoneId;
  final VoidCallback onSelected;

  @override
  State<_RewardSelect> createState() => _RewardSelectState();
}

class _RewardSelectState extends State<_RewardSelect> {
  Json? _details;
  bool _loading = true;
  String? _error;
  String? _rewardId;
  String? _size;
  String? _color;
  final _phone = TextEditingController();
  final _city = TextEditingController();
  final _address = TextEditingController();
  bool _confirming = false;
  bool _submitting = false;
  Object? _success;

  @override
  void initState() {
    super.initState();
    fetchRewardMilestone(widget.milestoneId).then((data) {
      if (!mounted) return;
      final first = _optionsOf(data).where((o) => o['inStock'] != false).firstOrNull;
      setState(() {
        _details = data;
        _rewardId = first != null ? '${first['id']}' : null;
      });
    }).catchError((Object err) {
      if (mounted) setState(() => _error = errorMessage(err, 'Не удалось загрузить подарки'));
    }).whenComplete(() {
      if (mounted) setState(() => _loading = false);
    });
  }

  @override
  void dispose() {
    _phone.dispose();
    _city.dispose();
    _address.dispose();
    super.dispose();
  }

  List<Json> _optionsOf(Json? d) =>
      (d?['options'] as List?)?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? [];

  Json? get _reward => _optionsOf(_details).where((o) => '${o['id']}' == _rewardId).firstOrNull;

  List<({String size, bool inStock})> _sizes(Json? reward) {
    final raw = reward?['sizes'];
    if (raw is! List || raw.isEmpty) return [for (final s in _defaultSizes) (size: s, inStock: true)];
    return [
      for (final item in raw)
        if (item is String)
          (size: item, inStock: true)
        else if (item is Map)
          (size: '${item['size']}', inStock: item['inStock'] != false && (item['available'] == null || (item['available'] as num) > 0)),
    ];
  }

  List<String> _colors(Json? reward) {
    final raw = reward?['colors'];
    if (raw is List && raw.isNotEmpty) return [for (final c in raw) c is Map ? '${c['name']}' : '$c'];
    return reward?['hasColors'] == true ? _defaultColors : const [];
  }

  void _beginConfirm() {
    final r = _reward;
    if (r == null) return setState(() => _error = 'Выберите подарок');
    if (r['inStock'] == false) return setState(() => _error = 'Этот подарок сейчас недоступен');
    if (r['requiresSize'] == true && _size == null) return setState(() => _error = 'Выберите размер');
    setState(() {
      _error = null;
      _confirming = true;
    });
  }

  Future<void> _submit() async {
    final r = _reward;
    if (r == null) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    String? trimmed(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
    try {
      final result = await selectReward({
        'milestoneId': widget.milestoneId,
        'rewardId': r['id'],
        if (r['requiresSize'] == true) 'size': _size,
        'color': ?_color,
        'phone': ?trimmed(_phone),
        'address': ?trimmed(_address),
        'city': ?trimmed(_city),
      });
      widget.onSelected();
      if (mounted) {
        setState(() {
          _success = result ?? const <String, dynamic>{};
          _confirming = false;
        });
      }
    } catch (err) {
      if (mounted) {
        setState(() {
          _error = errorMessage(err, 'Не удалось выбрать подарок');
          _confirming = false;
        });
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final milestone = _details?['milestone'] is Map ? _details!['milestone'] as Map : null;
    final reward = _reward;
    final children = <Widget>[
      Text(milestone?['distance'] != null ? '${milestone!['distance']} км достигнуто'.toUpperCase() : 'ПОДАРОК', style: RB.label()),
      const SizedBox(height: 4),
      Text(_confirming ? 'Вы уверены?' : '${milestone?['name'] ?? 'Выберите награду'}', style: RB.headline(size: 22)),
      const SizedBox(height: 16),
      if (_loading) const Loader(padding: EdgeInsets.all(24)),
      if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: ErrorBox(_error!)),
    ];

    if (_success != null) {
      final success = _success is Map ? _success as Map : const {};
      final promo = _extractPromoCode(success);
      final successReward = success['reward'] is Map ? success['reward'] as Map : null;
      final selected = success['selected'] is Map ? success['selected'] as Map : null;
      final type = successReward?['type'] ?? reward?['type'] ?? selected?['type'];
      children.addAll([
        const Icon(Icons.check_circle, size: 56, color: RB.neon),
        const SizedBox(height: 12),
        Text('Награда выбрана', textAlign: TextAlign.center, style: RB.headline(size: 22)),
        const SizedBox(height: 4),
        Text('${reward?['name'] ?? selected?['name'] ?? ''}', textAlign: TextAlign.center, style: RB.body(color: RB.onSurfaceVariant)),
        const SizedBox(height: 16),
        if (type == 'DISCOUNT')
          GlassCard(
            child: Column(
              children: [
                Text('ВАШ ПРОМОКОД', style: RB.label()),
                const SizedBox(height: 6),
                SelectableText(promo.isNotEmpty ? promo : 'Код появится в «Мои награды»',
                    textAlign: TextAlign.center, style: RB.headline(size: promo.isNotEmpty ? 24 : 16, color: RB.neon)),
                const SizedBox(height: 12),
                OutlineButtonRB(
                  label: 'Скопировать',
                  onPressed: promo.isEmpty
                      ? null
                      : () {
                          Clipboard.setData(ClipboardData(text: promo));
                          showToast(context, 'Скопировано', success: true);
                        },
                ),
              ],
            ),
          )
        else
          Text('Мы обрабатываем заказ — статус смотрите в «Мои награды»',
              textAlign: TextAlign.center, style: RB.body(color: RB.onSurfaceVariant)),
        const SizedBox(height: 16),
        PrimaryButton(label: 'Готово', onPressed: () => Navigator.pop(context)),
      ]);
    } else if (_confirming) {
      children.addAll([
        Text('После подтверждения изменить выбранную награду нельзя.', style: RB.body(color: RB.onSurfaceVariant)),
        const SizedBox(height: 12),
        GlassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(rewardTypeLabel(reward?['type']).toUpperCase(), style: RB.label()),
              const SizedBox(height: 4),
              Text('${reward?['name'] ?? ''}', style: RB.headline(size: 18)),
              if (_size != null) Text('Размер: $_size', style: RB.body(color: RB.onSurfaceVariant)),
              if (_color != null) Text('Цвет: $_color', style: RB.body(color: RB.onSurfaceVariant)),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: OutlineButtonRB(label: 'Отмена', expand: true, onPressed: _submitting ? null : () => setState(() => _confirming = false)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: PrimaryButton(label: _submitting ? 'Сохраняем…' : 'Подтвердить', compact: true, loading: _submitting, onPressed: _submit),
            ),
          ],
        ),
      ]);
    } else if (!_loading && _details != null) {
      final sizes = _sizes(reward);
      final colors = _colors(reward);
      children.addAll([
        if (_details!['canSelect'] == false)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: GlassCard(
              child: Row(
                children: [
                  const Icon(Icons.lock_outline, color: RB.neon),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Выбор пока недоступен', style: RB.body(weight: FontWeight.w700)),
                        const SizedBox(height: 4),
                        Text('Награду можно выбрать, когда контрольная точка станет доступной.',
                            style: RB.body(size: 13, color: RB.onSurfaceVariant)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        for (final option in _optionsOf(_details)) ...[
          _RewardOption(
            option: option,
            active: '${option['id']}' == _rewardId,
            onTap: option['inStock'] == false
                ? null
                : () => setState(() {
                      _rewardId = '${option['id']}';
                      _size = null;
                      _color = null;
                    }),
          ),
          const SizedBox(height: 8),
        ],
        if (reward?['requiresSize'] == true) ...[
          const SizedBox(height: 8),
          const FieldLabel('Выберите размер'),
          SizePicker(
            sizes: [for (final s in sizes) if (s.inStock) {'size': s.size}],
            value: _size,
            onChanged: (s) => setState(() => _size = s),
          ),
        ],
        if (colors.isNotEmpty) ...[
          const SizedBox(height: 12),
          const FieldLabel('Цвет'),
          SizePicker(
            sizes: [for (final c in colors) {'size': c}],
            value: _color,
            onChanged: (c) => setState(() => _color = c),
          ),
        ],
        if (reward != null && reward['type'] != 'DISCOUNT') ...[
          const SizedBox(height: 16),
          LabeledField(label: 'Телефон', controller: _phone, hint: '+992…', keyboardType: TextInputType.phone),
          LabeledField(label: 'Город', controller: _city, hint: 'Ваш город'),
          LabeledField(label: 'Адрес', controller: _address, hint: 'Куда доставить подарок', maxLines: 3),
        ],
        const SizedBox(height: 12),
        PrimaryButton(label: 'Выбрать', onPressed: _details!['canSelect'] == false || reward == null ? null : _beginConfirm),
      ]);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children);
  }
}

class _RewardOption extends StatelessWidget {
  const _RewardOption({required this.option, required this.active, required this.onTap});
  final Json option;
  final bool active;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final disabled = option['inStock'] == false;
    final description = '${option['description'] ?? ''}'.trim();
    return Opacity(
      opacity: disabled ? 0.5 : 1,
      child: GlassCard(
        borderColor: active ? RB.neon : null,
        onTap: onTap,
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(rewardTypeLabel(option['type']).toUpperCase(), style: RB.label(size: 10)),
                  const SizedBox(height: 4),
                  Text('${option['name'] ?? ''}', style: RB.body(size: 15, weight: FontWeight.w700)),
                  if (description.isNotEmpty) Text(description, style: RB.body(size: 13, color: RB.onSurfaceVariant)),
                  if (option['discountPercent'] != null && option['discountPercent'] != 0)
                    Text('Скидка ${option['discountPercent']}%', style: RB.body(size: 13, color: RB.neon)),
                  if (disabled) Text('${option['unavailableReason'] ?? 'Нет в наличии'}', style: RB.body(size: 12, color: RB.error)),
                ],
              ),
            ),
            Icon(active ? Icons.radio_button_checked : Icons.radio_button_unchecked, color: active ? RB.neon : RB.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}
