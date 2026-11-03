import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api.dart';
import '../../core/phone.dart';
import '../../services/shop.dart';
import '../../workout/native_workout.dart';
import '../theme.dart';
import 'common.dart';

class FieldLabel extends StatelessWidget {
  const FieldLabel(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) =>
      Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(text.toUpperCase(), style: RB.label(size: 12)));
}

class LabeledField extends StatelessWidget {
  const LabeledField({
    super.key,
    required this.label,
    required this.controller,
    this.hint,
    this.keyboardType,
    this.maxLines = 1,
    this.onChanged,
    this.textCapitalization = TextCapitalization.sentences,
    this.maxLength,
  });
  final String label;
  final TextEditingController controller;
  final String? hint;
  final TextInputType? keyboardType;
  final int maxLines;
  final ValueChanged<String>? onChanged;
  final TextCapitalization textCapitalization;
  final int? maxLength;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FieldLabel(label),
          TextField(
            controller: controller,
            keyboardType: keyboardType,
            maxLines: maxLines,
            maxLength: maxLength,
            onChanged: onChanged,
            textCapitalization: textCapitalization,
            style: RB.body(size: 16),
            decoration: InputDecoration(hintText: hint, counterText: ''),
          ),
        ],
      ),
    );
  }
}

/// Номер телефона: префикс +992 и 9 цифр.
class PhoneInput extends StatelessWidget {
  const PhoneInput({super.key, required this.controller, this.label = 'Номер телефона', this.onChanged, this.autofocus = false});
  final TextEditingController controller;
  final String label;
  final ValueChanged<String>? onChanged;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FieldLabel(label),
          TextField(
            controller: controller,
            autofocus: autofocus,
            keyboardType: TextInputType.phone,
            autofillHints: const [AutofillHints.telephoneNumberNational],
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(phoneLocalLength)],
            onChanged: onChanged,
            style: RB.headline(size: 18, weight: FontWeight.w600),
            decoration: InputDecoration(
              hintText: '--- --- ---',
              prefixIcon: Padding(
                padding: const EdgeInsets.only(left: 16, right: 8),
                child: Text('+992', style: RB.headline(size: 18, weight: FontWeight.w600, color: RB.neon)),
              ),
              prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
            ),
          ),
        ],
      ),
    );
  }
}

/// Код из SMS: 6 ячеек поверх одного поля ввода (автозаполнение iOS + SMS Retriever на Android).
class OtpInput extends StatefulWidget {
  const OtpInput({super.key, required this.value, required this.onChanged, this.enabled = true});
  final String value;
  final ValueChanged<String> onChanged;
  final bool enabled;

  @override
  State<OtpInput> createState() => _OtpInputState();
}

class _OtpInputState extends State<OtpInput> {
  late final TextEditingController _controller = TextEditingController(text: widget.value);
  final _focus = FocusNode();
  StreamSubscription<String>? _sms;

  @override
  void initState() {
    super.initState();
    _sms = NativeWorkout.smsCodes().listen((code) {
      final digits = code.replaceAll(RegExp(r'\D'), '');
      if (digits.length >= 6) _set(digits.substring(0, 6));
    }, onError: (_) {});
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  @override
  void didUpdateWidget(OtpInput old) {
    super.didUpdateWidget(old);
    if (widget.value != _controller.text) _controller.text = widget.value;
  }

  void _set(String v) {
    _controller.text = v;
    widget.onChanged(v);
  }

  @override
  void dispose() {
    _sms?.cancel();
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _focus.requestFocus(),
      child: Stack(
        children: [
          Opacity(
            opacity: 0,
            child: TextField(
              controller: _controller,
              focusNode: _focus,
              enabled: widget.enabled,
              autofillHints: const [AutofillHints.oneTimeCode],
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              onChanged: widget.onChanged,
              showCursor: false,
              enableInteractiveSelection: false,
            ),
          ),
          ListenableBuilder(
            listenable: Listenable.merge([_controller, _focus]),
            builder: (context, _) {
              final text = _controller.text;
              return Row(
                children: [
                  for (var i = 0; i < 6; i++) ...[
                    if (i > 0) const SizedBox(width: 8),
                    Expanded(
                      child: AspectRatio(
                        aspectRatio: 0.82,
                        child: Container(
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: RB.surfaceLow,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              width: 1.5,
                              color: _focus.hasFocus && (i == text.length || (i == 5 && text.length == 6))
                                  ? RB.neon
                                  : (i < text.length ? RB.neon.withValues(alpha: 0.4) : RB.outline),
                            ),
                          ),
                          child: Text(i < text.length ? text[i] : '', style: RB.headline(size: 26)),
                        ),
                      ),
                    ),
                  ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

const tajikistanCities = [
  'Айни', 'Балджуван', 'Бохтар', 'Бустон', 'Ванж', 'Варзоб', 'Восе', 'Вахдат', 'Вахш', 'Гафуров', 'Гиссар',
  'Горная Матча', 'Дангара', 'Дардж', 'Джаббор Расулов', 'Джиликуль', 'Джиргиталь', 'Душанбе', 'Ёвон', 'Зарнисор',
  'Зафарабад', 'Исфара', 'Истаравшан', 'Истиклол', 'Калаи Хумб', 'Канибадам', 'Колхозобад', 'Кубодиён', 'Куляб',
  'Лахш', 'Левакант', 'Мургаб', 'Норак', 'Нурек', 'Обигарм', 'Пенджикент', 'Пяндж', 'Рашт', 'Рогун', 'Рудаки',
  'Рушан', 'Сарбанд', 'Спитамен', 'Табошар', 'Турсунзада', 'Файзабад', 'Фархор', 'Хамадони', 'Хисор', 'Ховалинг',
  'Хорог', 'Худжанд', 'Шахринав', 'Шахритус',
];

class CityPicker extends StatelessWidget {
  const CityPicker({super.key, required this.value, required this.onChanged, this.label = 'Город'});
  final String value;
  final ValueChanged<String> onChanged;
  final String label;

  Future<void> _open(BuildContext context) async {
    final city = await showDetailSheet<String>(context, title: 'Города Таджикистана', builder: (_) => _CityList(selected: value));
    if (city != null) onChanged(city);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FieldLabel(label),
          InkWell(
            borderRadius: BorderRadius.circular(RB.radius),
            onTap: () => _open(context),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: RB.surfaceLow,
                borderRadius: BorderRadius.circular(RB.radius),
                border: Border.all(color: RB.outline),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      value.isEmpty ? 'Выберите город' : value,
                      style: RB.body(size: 16, color: value.isEmpty ? RB.onSurfaceVariant.withValues(alpha: 0.6) : RB.onSurface),
                    ),
                  ),
                  const Icon(Icons.expand_more, color: RB.onSurfaceVariant),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CityList extends StatefulWidget {
  const _CityList({required this.selected});
  final String selected;

  @override
  State<_CityList> createState() => _CityListState();
}

class _CityListState extends State<_CityList> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final q = _query.trim().toLowerCase();
    final list = q.isEmpty ? tajikistanCities : tajikistanCities.where((c) => c.toLowerCase().contains(q)).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          autofocus: true,
          onChanged: (v) => setState(() => _query = v),
          decoration: const InputDecoration(hintText: 'Поиск города', prefixIcon: Icon(Icons.search)),
        ),
        const SizedBox(height: 8),
        if (list.isEmpty)
          Padding(padding: const EdgeInsets.all(12), child: Text('Город не найден', style: RB.body(color: RB.onSurfaceVariant)))
        else
          for (final city in list)
            ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 4),
              title: Text(city, style: RB.body(size: 16, color: city == widget.selected ? RB.neon : RB.onSurface)),
              trailing: city == widget.selected ? const Icon(Icons.check, color: RB.neon) : null,
              onTap: () => Navigator.pop(context, city),
            ),
      ],
    );
  }
}

const qtyMin = 1;
const qtyMax = 5;

class QuantityStepper extends StatelessWidget {
  const QuantityStepper({super.key, required this.value, required this.onChanged, this.label, this.compact = false, this.enabled = true});
  final int value;
  final ValueChanged<int> onChanged;
  final String? label;
  final bool compact;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final qty = value.clamp(qtyMin, qtyMax);
    Widget btn(IconData icon, bool on, VoidCallback cb, String tip) => IconButton(
          onPressed: enabled && on ? cb : null,
          icon: Icon(icon, size: compact ? 18 : 22),
          tooltip: tip,
          visualDensity: compact ? VisualDensity.compact : null,
          style: IconButton.styleFrom(backgroundColor: RB.surfaceHigh, foregroundColor: RB.onSurface),
        );
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (label != null) ...[Text(label!.toUpperCase(), style: RB.label(size: 12)), const SizedBox(width: 12)],
        btn(Icons.remove, qty > qtyMin, () => onChanged(qty - 1), 'Уменьшить'),
        SizedBox(width: compact ? 28 : 40, child: Text('$qty', textAlign: TextAlign.center, style: RB.headline(size: compact ? 16 : 20))),
        btn(Icons.add, qty < qtyMax, () => onChanged(qty + 1), 'Увеличить'),
      ],
    );
  }
}

const _labelHex = {
  'black': 0xFF1A1A1A,
  'white': 0xFFF5F5F5,
  'green': 0xFF22C55E,
  'grey': 0xFF6B7280,
  'gray': 0xFF6B7280,
  'orange': 0xFFF97316,
  'neon': 0xFFC3F400,
  'red': 0xFFEF4444,
  'blue': 0xFF3B82F6,
};

/// Цвет образца: hex из админки или по названию (black, white…).
Color hexForColor(Map<String, dynamic> c) {
  final hex = '${c['hex_code'] ?? ''}';
  if (RegExp(r'^#[0-9A-Fa-f]{3,8}$').hasMatch(hex)) {
    var h = hex.substring(1);
    if (h.length == 3 || h.length == 4) h = h.split('').map((ch) => '$ch$ch').join();
    if (h.length == 6) h = 'FF$h';
    if (h.length == 8) {
      // CSS #RRGGBBAA → ARGB
      if (hex.length == 9) h = h.substring(6) + h.substring(0, 6);
      return Color(int.parse(h, radix: 16));
    }
  }
  final key = '${c['label'] ?? ''}'.toLowerCase().replaceAll(RegExp('[^a-z]'), ' ');
  for (final e in _labelHex.entries) {
    if (key.contains(e.key)) return Color(e.value);
  }
  return const Color(0xFF444444);
}

class ColorPicker extends StatelessWidget {
  const ColorPicker({super.key, required this.colors, required this.value, required this.onChanged});
  final List<Map<String, dynamic>> colors;
  final String? value;
  final ValueChanged<Map<String, dynamic>> onChanged;

  @override
  Widget build(BuildContext context) {
    if (colors.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const FieldLabel('Цвет'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final c in colors)
                _Chip(
                  active: value == c['label'],
                  onTap: () => onChanged(c),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 18,
                        height: 18,
                        decoration: BoxDecoration(
                          color: hexForColor(c),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white24),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text('${c['label'] ?? ''}', style: RB.body(weight: FontWeight.w600)),
                      if (value == c['label']) ...[const SizedBox(width: 4), const Icon(Icons.check, size: 16, color: RB.neon)],
                      if (c['image_url'] is String && (c['image_url'] as String).isNotEmpty) ...[
                        const SizedBox(width: 8),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: CachedNetworkImage(
                            imageUrl: Api.mediaUrl(c['image_url'] as String)!,
                            width: 28,
                            height: 28,
                            fit: BoxFit.cover,
                            errorWidget: (_, _, _) => const SizedBox.shrink(),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.active, required this.onTap, required this.child});
  final bool active;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: active ? RB.neon.withValues(alpha: 0.12) : RB.surfaceLow,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: active ? RB.neon : RB.outline),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10), child: child),
      ),
    );
  }
}

/// Выбор размера (чипы).
class SizePicker extends StatelessWidget {
  const SizePicker({super.key, required this.sizes, required this.value, required this.onChanged});
  final List<Map<String, dynamic>> sizes;
  final String? value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final s in sizes)
          _Chip(
            active: value == '${s['size']}',
            onTap: () => onChanged('${s['size']}'),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minWidth: 24),
              child: Text('${s['size']}',
                  textAlign: TextAlign.center,
                  style: RB.headline(size: 15, color: value == '${s['size']}' ? RB.neon : RB.onSurface)),
            ),
          ),
      ],
    );
  }
}

class _OptionTile extends StatelessWidget {
  const _OptionTile({required this.icon, required this.title, required this.active, required this.onTap, this.subtitle});
  final IconData icon;
  final String title;
  final String? subtitle;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: _Chip(
        active: active,
        onTap: onTap,
        child: Row(
          children: [
            Icon(icon, color: active ? RB.neon : RB.onSurfaceVariant),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: RB.body(size: 15, weight: FontWeight.w600)),
                  if (subtitle != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(subtitle!, style: RB.body(size: 12, color: RB.onSurfaceVariant)),
                    ),
                ],
              ),
            ),
            if (active) const Icon(Icons.check_circle, color: RB.neon, size: 20),
          ],
        ),
      ),
    );
  }
}

const _paymentIcons = {
  'cash': Icons.payments_outlined,
  'card': Icons.credit_card,
  'mobile': Icons.smartphone,
  'bank': Icons.account_balance_outlined,
  'delivery': Icons.local_shipping_outlined,
};

class PaymentMethodPicker extends StatelessWidget {
  const PaymentMethodPicker({
    super.key,
    required this.methods,
    required this.value,
    required this.onChanged,
    required this.detailsController,
  });
  final List<PaymentMethod> methods;
  final String value;
  final ValueChanged<String> onChanged;
  final TextEditingController detailsController;

  @override
  Widget build(BuildContext context) {
    final selected = methods.where((m) => m.id == value).firstOrNull;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const FieldLabel('Способ оплаты'),
          for (final m in methods)
            _OptionTile(
              icon: _paymentIcons[m.id] ?? Icons.payments_outlined,
              title: m.label,
              active: m.id == value,
              onTap: () => onChanged(m.id),
            ),
          if (selected?.needsDetails == true) ...[
            const SizedBox(height: 4),
            LabeledField(
              label: selected!.detailsLabel ?? 'Реквизиты',
              hint: selected.detailsLabel,
              controller: detailsController,
            ),
          ],
        ],
      ),
    );
  }
}

class DeliveryMethodPicker extends StatelessWidget {
  const DeliveryMethodPicker({super.key, required this.methods, required this.value, required this.onChanged});
  final List<DeliveryMethod> methods;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const FieldLabel('Способ доставки'),
          for (final m in methods)
            _OptionTile(
              icon: m.id == 'pickup' ? Icons.store_outlined : Icons.local_shipping_outlined,
              title: m.label,
              subtitle: m.price > 0 ? '+${m.price % 1 == 0 ? m.price.toInt() : m.price} сомони' : 'Бесплатно',
              active: m.id == value,
              onTap: () => onChanged(m.id),
            ),
        ],
      ),
    );
  }
}
