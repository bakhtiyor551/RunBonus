import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app_state.dart';
import '../../core/api.dart';
import '../../core/phone.dart';
import '../../services/cart.dart';
import '../../services/shop.dart';
import '../theme.dart';
import '../widgets/bottom_nav.dart';
import '../widgets/common.dart';
import '../widgets/forms.dart';
import '../widgets/mobile_transfer_sheet.dart';
import 'shop_page.dart';

class CartPage extends StatefulWidget {
  const CartPage({super.key});

  @override
  State<CartPage> createState() => _CartPageState();
}

class _CartPageState extends State<CartPage> {
  List<PaymentMethod> _payment = paymentMethodsFallback;
  List<DeliveryMethod> _delivery = deliveryMethodsFallback;
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _comment = TextEditingController();
  final _paymentDetails = TextEditingController();
  String _city = '';
  String _deliveryMethod = 'courier';
  String _paymentMethod = 'cash';
  bool _submitting = false;
  bool _done = false;

  @override
  void initState() {
    super.initState();
    final user = context.read<AppState>().user;
    final fullName = [user?['firstName'] ?? user?['first_name'], user?['lastName'] ?? user?['last_name']]
        .where((e) => e != null && '$e'.isNotEmpty)
        .join(' ');
    _name.text = fullName.isNotEmpty ? fullName : '${user?['name'] ?? ''}';
    _phone.text = toLocalPhoneDigits(user?['phone'] as String?);
    _city = '${user?['city'] ?? ''}';
    fetchCheckoutMethods().then((m) {
      if (!mounted) return;
      setState(() {
        _payment = m.payment;
        _delivery = m.delivery;
      });
    });
  }

  @override
  void dispose() {
    for (final c in [_name, _phone, _address, _comment, _paymentDetails]) {
      c.dispose();
    }
    super.dispose();
  }

  DeliveryMethod? get _selectedDelivery => _delivery.where((m) => m.id == _deliveryMethod).firstOrNull;

  String? _validate() {
    if (_name.text.trim().isEmpty) return 'Укажите имя';
    final phoneErr = phoneValidationMessage(_phone.text);
    if (phoneErr != null) return phoneErr;
    if (_city.trim().isEmpty) return 'Укажите город';
    final dm = _selectedDelivery;
    if (dm == null) return 'Выберите способ доставки';
    if (dm.requiresAddress && _address.text.trim().isEmpty) return 'Укажите адрес доставки';
    final pm = _payment.where((m) => m.id == _paymentMethod).firstOrNull;
    if (pm == null) return 'Выберите способ оплаты';
    if (_paymentMethod == 'bonus') return 'Оплата бонусами отключена. Выберите другой способ оплаты.';
    if (_paymentMethod != 'mobile' && pm.needsDetails && _paymentDetails.text.trim().isEmpty) {
      return pm.detailsLabel ?? 'Укажите данные для оплаты';
    }
    return null;
  }

  Future<void> _placeOrders([MobilePayment? mobile]) async {
    final items = Cart.instance.items;
    if (items.isEmpty) return showToast(context, 'Корзина пуста');
    setState(() => _submitting = true);
    final appState = context.read<AppState>();
    try {
      String? receiptUrl;
      if (_paymentMethod == 'mobile' && mobile != null) {
        final uploaded = await Api.post('/api/mobile/order-receipt', {'payment_receipt_base64': mobile.receiptBase64});
        receiptUrl = uploaded is Map ? uploaded['receipt_url'] as String? : null;
      }
      final payload = {
        'customer_name': _name.text.trim(),
        'phone': _phone.text.trim(),
        'city': _city.trim(),
        'address': _address.text.trim(),
        'delivery_method': _deliveryMethod,
        'comment': _comment.text.trim(),
        'payment_method': _paymentMethod,
        'payment_details': mobile?.paymentDetails ?? _paymentDetails.text.trim(),
        'payment_receipt_url': receiptUrl,
      };
      for (var i = 0; i < items.length; i++) {
        final item = items[i];
        await Api.post('/api/mobile/orders', {
          'product_id': item.productId,
          'size': item.size,
          'color': item.color,
          'color_id': item.colorId,
          'quantity': item.quantity,
          'apply_delivery_fee': i == 0,
          ...payload,
        });
      }
      await Cart.instance.clear();
      if (mounted) {
        if (mobile != null) Navigator.of(context).pop();
        setState(() => _done = true);
      }
      appState.refreshProfile();
    } catch (err) {
      if (mounted) showToast(context, errorMessage(err, 'Не удалось оформить заказ'));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _checkout(double total) async {
    if (Cart.instance.items.isEmpty) return showToast(context, 'Корзина пуста');
    final err = _validate();
    if (err != null) return showToast(context, err);
    if (_paymentMethod == 'mobile') {
      await showDetailSheet(
        context,
        title: 'Мобильный перевод',
        builder: (_) => MobileTransferSheet(totalAmount: formatPrice(total), onConfirm: _placeOrders),
      );
      return;
    }
    await _placeOrders();
  }

  @override
  Widget build(BuildContext context) {
    final header = AppHeader(onBack: () => context.go('/shop'));
    if (_done) {
      return TabPage(
        header: header,
        child: Padding(
          padding: const EdgeInsets.only(top: 40),
          child: Column(
            children: [
              const Icon(Icons.check_circle, size: 64, color: RB.neon),
              const SizedBox(height: 16),
              Text('Заказ оформлен', style: RB.headline(size: 24)),
              const SizedBox(height: 8),
              Text('Мы свяжемся с вами для подтверждения и оплаты.', textAlign: TextAlign.center, style: RB.body(color: RB.onSurfaceVariant)),
              const SizedBox(height: 24),
              PrimaryButton(label: 'Мои заказы', compact: true, onPressed: () => context.go('/orders')),
            ],
          ),
        ),
      );
    }

    return ListenableBuilder(
      listenable: Cart.instance,
      builder: (context, _) {
        final items = Cart.instance.items;
        final itemsTotal = items.fold<double>(0, (s, i) => s + i.price * i.quantity);
        final fee = _selectedDelivery?.price ?? 0;
        final total = itemsTotal + fee;
        return TabPage(
          header: header,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Корзина', style: RB.headline(size: 28)),
              const SizedBox(height: 16),
              if (items.isEmpty)
                GlassCard(
                  child: EmptyState(
                    icon: Icons.shopping_cart_outlined,
                    title: 'Корзина пуста',
                    action: PrimaryButton(label: 'В магазин', compact: true, onPressed: () => context.go('/shop')),
                  ),
                ),
              for (var i = 0; i < items.length; i++) ...[
                _CartRow(item: items[i], index: i),
                const SizedBox(height: 12),
              ],
              if (items.isNotEmpty) ...[
                const SizedBox(height: 8),
                GlassCard(
                  padding: const EdgeInsets.all(20),
                  child: AutofillGroup(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text('Оформление заказа', style: RB.headline(size: 18)),
                        const SizedBox(height: 16),
                        LabeledField(label: 'Имя', controller: _name, textCapitalization: TextCapitalization.words),
                        PhoneInput(controller: _phone, label: 'Телефон'),
                        CityPicker(value: _city, onChanged: (c) => setState(() => _city = c)),
                        if (_selectedDelivery?.requiresAddress ?? true) LabeledField(label: 'Адрес доставки', controller: _address),
                        if (_deliveryMethod == 'pickup')
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Text('Самовывоз — адрес не требуется. Мы сообщим, когда заказ будет готов.',
                                style: RB.body(size: 13, color: RB.onSurfaceVariant)),
                          ),
                        PaymentMethodPicker(
                          methods: _payment,
                          value: _paymentMethod,
                          detailsController: _paymentDetails,
                          onChanged: (id) => setState(() {
                            _paymentMethod = id;
                            if (id == 'mobile') _paymentDetails.clear();
                          }),
                        ),
                        LabeledField(label: 'Комментарий', controller: _comment, hint: 'Необязательно'),
                        Container(
                          padding: const EdgeInsets.all(14),
                          margin: const EdgeInsets.only(bottom: 16),
                          decoration: BoxDecoration(color: RB.surfaceHigh, borderRadius: BorderRadius.circular(RB.radius)),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Товары: ${formatPrice(itemsTotal)} сомони', style: RB.body(size: 13, color: RB.onSurfaceVariant)),
                              if (fee > 0)
                                Text('Доставка: ${formatPrice(fee)} сомони', style: RB.body(size: 13, color: RB.onSurfaceVariant)),
                              const SizedBox(height: 6),
                              Text('Итого: ${formatPrice(total)} сомони', style: RB.headline(size: 22)),
                            ],
                          ),
                        ),
                        DeliveryMethodPicker(methods: _delivery, value: _deliveryMethod, onChanged: (id) => setState(() => _deliveryMethod = id)),
                        const SizedBox(height: 8),
                        PrimaryButton(
                          label: _submitting ? 'Оформление…' : 'Оформить заказ',
                          loading: _submitting,
                          onPressed: () => _checkout(total),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _CartRow extends StatelessWidget {
  const _CartRow({required this.item, required this.index});
  final CartItem item;
  final int index;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              width: 64,
              height: 64,
              child: ColoredBox(color: RB.surfaceHigh, child: ProductImage(url: Api.mediaUrl(item.imageUrl), iconSize: 24)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.name, style: RB.body(size: 15, weight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text('Размер ${item.size}${item.color.isNotEmpty ? ' · ${item.color}' : ''}',
                    style: RB.body(size: 13, color: RB.onSurfaceVariant)),
                const SizedBox(height: 6),
                QuantityStepper(compact: true, value: item.quantity, onChanged: (q) => Cart.instance.setQuantity(index, q)),
                const SizedBox(height: 6),
                Text('${formatPrice(item.price * item.quantity)} сомони', style: RB.headline(size: 18, color: RB.neon)),
              ],
            ),
          ),
          CircleIconButton(icon: Icons.close, size: 36, tooltip: 'Удалить', onTap: () => Cart.instance.removeAt(index)),
        ],
      ),
    );
  }
}
