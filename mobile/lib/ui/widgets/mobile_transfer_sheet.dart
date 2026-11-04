import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api.dart';
import '../../core/image_pick.dart';
import '../theme.dart';
import 'common.dart';
import 'forms.dart';

const _accountsFallback = [
  {'id': 'alif', 'provider': 'Alif Mobi', 'number': '+992 90 000 00 01', 'holder': 'RunBonus'},
  {'id': 'dc', 'provider': 'DC Wallet', 'number': '+992 90 000 00 02', 'holder': 'RunBonus'},
  {'id': 'eskhata', 'provider': 'Эсхата Онлайн', 'number': '+992 90 000 00 03', 'holder': 'RunBonus'},
];

class MobilePayment {
  const MobilePayment({required this.paymentDetails, required this.receiptBase64});
  final String paymentDetails;
  final String receiptBase64;
}

/// Мобильный перевод: счёт RunBonus, номер отправителя, чек.
class MobileTransferSheet extends StatefulWidget {
  const MobileTransferSheet({super.key, required this.totalAmount, required this.onConfirm});
  final String totalAmount;
  final Future<void> Function(MobilePayment payment) onConfirm;

  @override
  State<MobileTransferSheet> createState() => _MobileTransferSheetState();
}

class _MobileTransferSheetState extends State<MobileTransferSheet> {
  List<Map<String, dynamic>> _accounts = [for (final a in _accountsFallback) Map<String, dynamic>.from(a)];
  String? _recipientId;
  final _sender = TextEditingController();
  bool _confirmed = false;
  String? _receipt;
  Uint8List? _preview;
  bool _submitting = false;
  String? _formError;

  @override
  void initState() {
    super.initState();
    Api.get('/api/mobile/mobile-payment-accounts').then((data) {
      if (data is List && data.isNotEmpty && mounted) {
        setState(() => _accounts = data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList());
      }
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _sender.dispose();
    super.dispose();
  }

  Map<String, dynamic>? get _selected => _accounts.where((a) => '${a['id']}' == _recipientId).firstOrNull;

  Future<void> _pick(ImageSource source) async {
    try {
      final dataUrl = await pickImageDataUrl(source);
      if (dataUrl == null || !mounted) return;
      final bytes = dataUrlBytes(dataUrl);
      if (bytes != null && bytes.length > 4 * 1024 * 1024) return showToast(context, 'Файл не больше 4 МБ');
      setState(() {
        _receipt = dataUrl;
        _preview = bytes != null ? Uint8List.fromList(bytes) : null;
      });
    } catch (_) {
      if (mounted) showToast(context, 'Не удалось загрузить чек');
    }
  }

  String? _validate() {
    if (_selected == null) return 'Выберите кошелёк RunBonus для перевода';
    if (_sender.text.trim().isEmpty) return 'Укажите номер кошелька, с которого вы перевели';
    if (!_confirmed) return 'Подтвердите, что перевод выполнен';
    if (_receipt == null) return 'Загрузите чек транзакции';
    return null;
  }

  Future<void> _confirm() async {
    final err = _validate();
    if (err != null) {
      setState(() => _formError = err);
      return showToast(context, err);
    }
    final acc = _selected!;
    final details = ['На: ${acc['provider']} — ${acc['number']}', 'От: ${_sender.text.trim()}'].join('\n');
    setState(() {
      _formError = null;
      _submitting = true;
    });
    try {
      await widget.onConfirm(MobilePayment(paymentDetails: details, receiptBase64: _receipt!));
    } catch (e) {
      if (mounted) {
        final msg = errorMessage(e, 'Не удалось оформить заказ');
        setState(() => _formError = msg);
        showToast(context, msg);
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final acc = _selected;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text.rich(
          TextSpan(children: [
            const TextSpan(text: 'Переведите '),
            TextSpan(text: '${widget.totalAmount} сомони', style: RB.body(weight: FontWeight.w700, color: RB.neon)),
            const TextSpan(text: '. Выберите счёт RunBonus — откроется номер для перевода. Затем укажите свой номер и прикрепите чек.'),
          ]),
          style: RB.body(color: RB.onSurfaceVariant).copyWith(height: 1.5),
        ),
        const SizedBox(height: 16),
        const FieldLabel('Счёт RunBonus для перевода'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final a in _accounts)
              ChoiceChip(
                label: Text('${a['provider']}'),
                selected: '${a['id']}' == _recipientId,
                onSelected: (_) => setState(() => _recipientId = '${a['id']}'),
                showCheckmark: false,
                selectedColor: RB.neon.withValues(alpha: 0.15),
                side: BorderSide(color: '${a['id']}' == _recipientId ? RB.neon : RB.outline),
              ),
          ],
        ),
        const SizedBox(height: 12),
        if (acc != null)
          GlassCard(
            borderColor: RB.neon.withValues(alpha: 0.45),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${acc['provider']}', style: RB.body(size: 13, color: RB.onSurfaceVariant)),
                      SelectableText('${acc['number']}', style: RB.headline(size: 20)),
                      if (acc['holder'] != null) Text('${acc['holder']}', style: RB.body(size: 12, color: RB.onSurfaceVariant)),
                    ],
                  ),
                ),
                PrimaryButton(
                  label: 'Копировать',
                  icon: Icons.content_copy,
                  compact: true,
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: '${acc['number']}'));
                    showToast(context, 'Номер скопирован', success: true);
                  },
                ),
              ],
            ),
          )
        else
          Text('Нажмите на кошелёк выше, чтобы увидеть номер для перевода.', style: RB.body(size: 13, color: RB.onSurfaceVariant)),
        const SizedBox(height: 16),
        LabeledField(
          label: 'Ваш номер кошелька (с которого перевели)',
          controller: _sender,
          hint: '+992 …',
          keyboardType: TextInputType.phone,
        ),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: _confirmed,
          activeColor: RB.neon,
          checkColor: RB.onNeon,
          onChanged: (v) => setState(() => _confirmed = v ?? false),
          title: Text('Я перевёл деньги на выбранный счёт', style: RB.body()),
        ),
        const SizedBox(height: 8),
        const FieldLabel('Чек транзакции'),
        Container(
          height: _preview != null ? 220 : 120,
          decoration: RB.glass(),
          clipBehavior: Clip.antiAlias,
          child: _preview != null
              ? Image.memory(_preview!, fit: BoxFit.contain)
              : Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.receipt_long, size: 40, color: RB.neon),
                    const SizedBox(height: 6),
                    Text('Добавьте фото чека', style: RB.body(color: RB.onSurfaceVariant)),
                  ],
                ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(child: OutlineButtonRB(label: 'Из галереи', icon: Icons.photo_library_outlined, expand: true, onPressed: () => _pick(ImageSource.gallery))),
            const SizedBox(width: 8),
            Expanded(child: OutlineButtonRB(label: 'С камеры', icon: Icons.photo_camera_outlined, expand: true, onPressed: () => _pick(ImageSource.camera))),
          ],
        ),
        if (_preview != null)
          TextButton(
            onPressed: () => setState(() {
              _receipt = null;
              _preview = null;
            }),
            child: Text('Удалить фото', style: RB.body(color: RB.onSurfaceVariant)),
          ),
        if (_formError != null) ...[
          const SizedBox(height: 12),
          Text(_formError!, style: RB.body(size: 14, weight: FontWeight.w600, color: RB.error)),
        ],
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(child: OutlineButtonRB(label: 'Отмена', expand: true, onPressed: _submitting ? null : () => Navigator.pop(context))),
            const SizedBox(width: 10),
            Expanded(
              child: PrimaryButton(label: _submitting ? 'Отправка…' : 'Подтвердить заказ', compact: true, loading: _submitting, onPressed: _confirm),
            ),
          ],
        ),
      ],
    );
  }
}
