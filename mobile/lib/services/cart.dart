import 'package:flutter/foundation.dart';

import '../core/format.dart';
import '../core/storage.dart';

const _cartKey = 'rb_shop_cart';

class CartItem {
  CartItem({
    required this.productId,
    required this.name,
    required this.size,
    required this.color,
    required this.colorId,
    required this.price,
    required this.imageUrl,
    required this.quantity,
  });

  final Object productId;
  final String name;
  final String size;
  final String color;
  final Object? colorId;
  final double price;
  final String? imageUrl;
  int quantity;

  Map<String, dynamic> toJson() => {
        'productId': productId,
        'name': name,
        'size': size,
        'color': color,
        'color_id': colorId,
        'price': price,
        'image_url': imageUrl,
        'quantity': quantity,
      };

  static CartItem fromJson(Map<String, dynamic> j) => CartItem(
        productId: j['productId'],
        name: '${j['name'] ?? ''}',
        size: '${j['size'] ?? ''}',
        color: '${j['color'] ?? ''}',
        colorId: j['color_id'],
        price: toDouble(j['price']),
        imageUrl: j['image_url'] as String?,
        quantity: toInt(j['quantity']).clamp(1, 5),
      );
}

/// Корзина магазина (локально, как раньше localStorage).
class Cart extends ChangeNotifier {
  Cart._();
  static final instance = Cart._();

  List<CartItem> get items {
    final raw = Storage.getJson(_cartKey);
    if (raw is! List) return [];
    return raw.whereType<Map<String, dynamic>>().map(CartItem.fromJson).toList();
  }

  int get count => items.fold(0, (n, i) => n + i.quantity);

  Future<void> _save(List<CartItem> items) async {
    await Storage.setJson(_cartKey, items.map((i) => i.toJson()).toList());
    notifyListeners();
  }

  Future<void> add(CartItem item) async {
    final cart = items;
    final idx = cart.indexWhere(
      (i) => '${i.productId}' == '${item.productId}' && i.size == item.size && i.color == item.color,
    );
    if (idx >= 0) {
      cart[idx].quantity += item.quantity;
    } else {
      cart.add(item);
    }
    await _save(cart);
  }

  Future<void> setQuantity(int index, int quantity) async {
    final cart = items;
    if (index < 0 || index >= cart.length) return;
    cart[index].quantity = quantity.clamp(1, 5);
    await _save(cart);
  }

  Future<void> removeAt(int index) async {
    final cart = items;
    if (index < 0 || index >= cart.length) return;
    cart.removeAt(index);
    await _save(cart);
  }

  Future<void> clear() async {
    await Storage.remove(_cartKey);
    notifyListeners();
  }
}
