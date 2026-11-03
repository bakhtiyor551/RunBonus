import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../theme.dart';
import '../widgets/bottom_nav.dart';
import '../widgets/common.dart';
import 'shop_page.dart';

class _StatusMeta {
  const _StatusMeta(this.color, this.icon, this.hint);
  final Color color;
  final IconData icon;
  final String hint;
}

const _statusMeta = {
  'new': _StatusMeta(RB.neon, Icons.schedule, 'Ожидает подтверждения'),
  'confirmed': _StatusMeta(Color(0xFFA5B4FC), Icons.check_circle, 'Заказ подтверждён'),
  'paid': _StatusMeta(Color(0xFF7DD3FC), Icons.payments, 'Оплата получена'),
  'qr_issued': _StatusMeta(RB.neon, Icons.directions_run, 'Кроссовки привязаны, ждём доставку'),
  'delivered': _StatusMeta(Color(0xFF86EFAC), Icons.verified, 'Доставлен — кроссовки активированы'),
  'cancelled': _StatusMeta(RB.error, Icons.cancel, 'Заказ отменён'),
};

String _money(double v) => '${formatNumber(v)} с.';

class MyOrdersPage extends StatefulWidget {
  const MyOrdersPage({super.key});

  @override
  State<MyOrdersPage> createState() => _MyOrdersPageState();
}

class _MyOrdersPageState extends State<MyOrdersPage> {
  List<Map<String, dynamic>> _orders = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await Api.get('/api/mobile/my-orders');
      _orders = data is List ? data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : [];
    } catch (_) {
      _orders = [];
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final active = _orders.where((o) => o['status'] != 'cancelled' && o['status'] != 'delivered').length;
    return TabPage(
      header: AppHeader(onBack: () => context.go('/shop')),
      onRefresh: _load,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('МАГАЗИН RUNBONUS', style: RB.label()),
                    const SizedBox(height: 6),
                    Text('Мои заказы', style: RB.headline(size: 30)),
                  ],
                ),
              ),
              if (!_loading && _orders.isNotEmpty)
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('${_orders.length} всего', style: RB.body(size: 13, color: RB.onSurfaceVariant)),
                    if (active > 0) Text('$active в работе', style: RB.body(size: 13, color: RB.neon)),
                  ],
                ),
            ],
          ),
          const SizedBox(height: 20),
          if (_loading) const Loader(),
          if (!_loading && _orders.isEmpty)
            GlassCard(
              child: EmptyState(
                icon: Icons.shopping_bag,
                title: 'Пока нет заказов',
                text: 'Выберите кроссовки в магазине — после доставки они активируются автоматически.',
                action: PrimaryButton(label: 'Открыть магазин', icon: Icons.storefront, compact: true, onPressed: () => context.go('/shop')),
              ),
            ),
          for (final o in _orders) ...[_OrderCard(order: o), const SizedBox(height: 16)],
        ],
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});
  final Map<String, dynamic> order;

  void _call(String phone) => launchUrl(Uri(scheme: 'tel', path: phone));

  @override
  Widget build(BuildContext context) {
    final o = order;
    final status = '${o['status'] ?? 'new'}';
    final meta = _statusMeta[status] ?? _statusMeta['new']!;
    final qty = toInt(o['quantity']) > 0 ? toInt(o['quantity']) : 1;
    final unit = toDouble(o['price']);
    final fee = toDouble(o['delivery_fee']);
    final total = toDouble(o['total_amount']) > 0 ? toDouble(o['total_amount']) : unit * qty + fee;
    final subtitle = [
      if (o['size'] != null && '${o['size']}'.isNotEmpty) 'Размер ${o['size']}',
      ?(o['product_color'] ?? o['order_color']),
      if (qty > 1) '$qty шт.',
    ].join(' · ');
    final address = [o['city'], o['address']].where((e) => e != null && '$e'.isNotEmpty).join(', ');

    Widget fact(IconData icon, String label, Widget value) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 16, color: RB.onSurfaceVariant),
              const SizedBox(width: 8),
              SizedBox(width: 110, child: Text(label, style: RB.body(size: 13, color: RB.onSurfaceVariant))),
              Expanded(child: value),
            ],
          ),
        );
    Text val(Object? v) => Text('${v ?? '—'}', style: RB.body(size: 13, weight: FontWeight.w600));
    Widget phoneLink(String phone) => GestureDetector(
          onTap: () => _call(phone),
          child: Text(phone, style: RB.body(size: 13, weight: FontWeight.w600, color: RB.neon)),
        );

    return GlassCard(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text('ЗАКАЗ ', style: RB.label()),
              Text('#${o['id']}', style: RB.headline(size: 18)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(999), border: Border.all(color: meta.color)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(meta.icon, size: 14, color: meta.color),
                  const SizedBox(width: 4),
                  Text('${o['status_label'] ?? status}', style: RB.body(size: 12, weight: FontWeight.w700, color: meta.color)),
                ]),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: SizedBox.square(
                  dimension: 64,
                  child: ColoredBox(color: RB.surfaceHigh, child: ProductImage(url: Api.mediaUrl(o['product_image'] as String?), iconSize: 26)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${o['product_name'] ?? 'Товар'}', style: RB.headline(size: 16)),
                    const SizedBox(height: 4),
                    Text(subtitle.isEmpty ? '—' : subtitle, style: RB.body(size: 13, color: RB.onSurfaceVariant)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: meta.color.withValues(alpha: 0.33)),
            ),
            child: Row(children: [
              Icon(Icons.info_outline, size: 16, color: meta.color),
              const SizedBox(width: 8),
              Expanded(child: Text(meta.hint, style: RB.body(size: 13))),
            ]),
          ),
          const SizedBox(height: 14),
          fact(Icons.payments_outlined, 'Оплата', val(o['payment_method_label'] ?? o['payment_method'])),
          fact(Icons.local_shipping_outlined, 'Доставка', val(o['delivery_method_label'] ?? o['delivery_method'])),
          if (address.isNotEmpty) fact(Icons.location_on_outlined, 'Адрес', val(address)),
          if (o['customer_name'] != null) fact(Icons.person_outline, 'Получатель', val(o['customer_name'])),
          if (o['phone'] != null) fact(Icons.call_outlined, 'Телефон', phoneLink('${o['phone']}')),
          if (o['assigned_shoe_code'] != null)
            fact(Icons.directions_run, 'Код кроссовок',
                Text('${o['assigned_shoe_code']}', style: RB.headline(size: 14, color: RB.neon))),
          if (o['comment'] != null && '${o['comment']}'.isNotEmpty) fact(Icons.chat_outlined, 'Комментарий', val(o['comment'])),
          const Divider(height: 20),
          StatRow(label: 'Товар${qty > 1 ? ' × $qty' : ''}', value: _money(unit * qty)),
          if (fee > 0) StatRow(label: 'Доставка', value: _money(fee)),
          StatRow(label: 'Итого', value: _money(total), highlight: true),
          const SizedBox(height: 8),
          if (o['courier_name'] != null)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: RB.surfaceHigh, borderRadius: BorderRadius.circular(12)),
              child: Row(
                children: [
                  const Icon(Icons.local_shipping, color: RB.neon),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('КУРЬЕР', style: RB.label()),
                      Text('${o['courier_name']}', style: RB.body(weight: FontWeight.w700)),
                    ]),
                  ),
                  if (o['courier_phone'] != null)
                    PrimaryButton(
                      label: '${o['courier_phone']}',
                      icon: Icons.call,
                      compact: true,
                      onPressed: () => _call('${o['courier_phone']}'),
                    ),
                ],
              ),
            )
          else if (status != 'cancelled' && status != 'delivered')
            Row(children: [
              const Icon(Icons.hourglass_empty, size: 16, color: RB.onSurfaceVariant),
              const SizedBox(width: 8),
              Expanded(child: Text('Курьер будет назначен после подтверждения заказа', style: RB.body(size: 13, color: RB.onSurfaceVariant))),
            ]),
          if (status == 'delivered')
            Row(children: [
              const Icon(Icons.check_circle, size: 18, color: Color(0xFF86EFAC)),
              const SizedBox(width: 8),
              Text('Можно начинать тренировки', style: RB.body(weight: FontWeight.w600, color: const Color(0xFF86EFAC))),
            ]),
          const SizedBox(height: 12),
          Row(children: [
            const Icon(Icons.calendar_today, size: 14, color: RB.onSurfaceVariant),
            const SizedBox(width: 6),
            Text(formatDateTimeLong(o['created_at']), style: RB.body(size: 12, color: RB.onSurfaceVariant)),
          ]),
        ],
      ),
    );
  }
}
