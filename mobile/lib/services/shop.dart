import '../core/api.dart';
import '../core/format.dart';

typedef Json = Map<String, dynamic>;

/// id категории: число или строка (shoes, tshirt…). Сравниваем как строку.
String? normalizeCategoryId(Object? raw) {
  if (raw == null) return null;
  final s = '$raw'.trim();
  return s.isEmpty ? null : s;
}

const _legacyShoeCategoryIds = {'1', '2', '3', 'running', 'urban', 'trail'};

String? normalizeProductCategoryId(Object? raw) {
  final id = normalizeCategoryId(raw);
  if (id == null) return null;
  if (_legacyShoeCategoryIds.contains(id)) return 'shoes';
  return id;
}

const _categoryNameFallback = {'shoes': 'Кроссовки', 'tshirt': 'Футболки', 'shorts': 'Шорты'};
const _categorySortOrder = {'shoes': 10, 'tshirt': 20, 'shorts': 30};

class ShopCategory {
  const ShopCategory(this.id, this.name, this.sortOrder);
  final String id;
  final String name;
  final int sortOrder;
}

List<ShopCategory> _normalizeCategories(Object? list) {
  if (list is! List) return [];
  return list
      .whereType<Map>()
      .map((c) {
        final id = normalizeCategoryId(c['id'] ?? c['slug']);
        final name = '${c['name'] ?? ''}'.trim();
        if (id == null || name.isEmpty) return null;
        return ShopCategory(id, name, toInt(c['sort_order']));
      })
      .whereType<ShopCategory>()
      .toList();
}

String categoryLabelFromId(Object? id, List<ShopCategory> categories) {
  final key = normalizeProductCategoryId(id);
  if (key == null) return '';
  for (final c in categories) {
    if (c.id == key) return c.name;
  }
  return _categoryNameFallback[key] ?? _categoryNameFallback[key.toLowerCase()] ?? '';
}

String categoryLabelFromProduct(Json product, List<ShopCategory> categories) {
  final label = categoryLabelFromId(product['category_id'], categories);
  if (label.isNotEmpty) return label;
  return '${product['category_name'] ?? ''}'.trim();
}

List<ShopCategory> _categoriesFromProducts(List<Json> products) {
  final map = <String, ShopCategory>{};
  for (final p in products) {
    final id = normalizeProductCategoryId(p['category_id']);
    if (id == null) continue;
    final name = categoryLabelFromProduct(p, const []);
    if (name.isEmpty) continue;
    map[id] = ShopCategory(id, name, _categorySortOrder[id] ?? 999);
  }
  return map.values.toList()
    ..sort((a, b) {
      final byOrder = a.sortOrder.compareTo(b.sortOrder);
      return byOrder != 0 ? byOrder : a.name.compareTo(b.name);
    });
}

List<Json> _asProducts(Object? data) =>
    data is List ? data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : [];

Future<List<ShopCategory>> fetchShopCategories() async {
  final data = await Api.get('/api/mobile/shop-categories');
  return _normalizeCategories(data is List ? data : (data is Map ? data['categories'] : null));
}

String _categoryQuery(String? categoryId) {
  final id = normalizeProductCategoryId(categoryId);
  return id != null ? '?category_id=${Uri.encodeQueryComponent(id)}' : '';
}

Future<List<Json>> fetchShopProducts([String? categoryId]) async =>
    _asProducts(await Api.get('/api/mobile/products${_categoryQuery(categoryId)}'));

Future<({List<ShopCategory> categories, List<Json> products})> fetchShopCatalog([String? categoryId]) async {
  var categories = <ShopCategory>[];
  var products = <Json>[];

  try {
    final data = await Api.get('/api/mobile/shop-catalog${_categoryQuery(categoryId)}');
    if (data is Map) {
      categories = _normalizeCategories(data['categories']);
      products = _asProducts(data['products']);
    }
  } catch (_) {
    categories = await fetchShopCategories();
    products = await fetchShopProducts(categoryId);
  }

  if (categories.isEmpty) {
    try {
      categories = await fetchShopCategories();
    } catch (_) {}
  }
  if (categories.isEmpty && products.isNotEmpty) {
    categories = _categoriesFromProducts(products);
  }
  if (categories.isEmpty && categoryId == null) {
    try {
      final all = await fetchShopProducts();
      categories = _categoriesFromProducts(all);
      if (products.isEmpty) products = all;
    } catch (_) {}
  }

  products = products.map((p) {
    final next = Map<String, dynamic>.from(p);
    final id = normalizeProductCategoryId(p['category_id']);
    if (id != null) next['category_id'] = id;
    final label = categoryLabelFromProduct(p, categories);
    if (label.isNotEmpty) next['category_name'] = label;
    return next;
  }).toList();

  return (categories: categories, products: products);
}

// —— Товары: цвета, размеры, фото ——

List<Json> productColors(Json? product) {
  if (product == null) return [];
  final colors = product['colors'];
  if (colors is List && colors.isNotEmpty) {
    return colors.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }
  final color = product['color'];
  if (color is String && color.isNotEmpty) return [{'label': color}];
  return [];
}

/// Размеры в наличии для выбранного цвета (или общие, если цвета без своих размеров).
List<Json> sizesForColor(Json? product, Json? selectedColor) {
  if (product == null) return [];
  final colors = productColors(product);
  final perColorCatalog = colors.any((c) => c['id'] != null && c['sizes'] is List && (c['sizes'] as List).isNotEmpty);

  List<dynamic> source;
  if (perColorCatalog) {
    Json? color;
    if (selectedColor?['id'] != null) {
      color = colors.firstWhere((c) => '${c['id']}' == '${selectedColor!['id']}', orElse: () => selectedColor!);
    } else {
      color = colors.firstWhere((c) => c['label'] == selectedColor?['label'], orElse: () => selectedColor ?? {});
    }
    source = color['sizes'] as List? ?? const [];
  } else {
    source = product['sizes'] as List? ?? const [];
  }
  return source.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).where((s) => s['in_stock'] == true || s['in_stock'] == 1).toList();
}

bool productHasStock(Json? product, [Json? selectedColor]) => sizesForColor(product, selectedColor).isNotEmpty;

List<String> buildProductImages(Json? product, Json? selectedColor) {
  final urls = <String>[];
  final colorImage = selectedColor?['image_url'];
  if (colorImage is String && colorImage.trim().isNotEmpty) {
    urls.add(colorImage);
  } else {
    final images = product?['images'];
    if (images is List) urls.addAll(images.whereType<String>());
    final main = product?['image_url'];
    if (main is String) urls.add(main);
  }
  final seen = <String>{};
  return urls
      .map((u) => u.trim())
      .where((u) => u.isNotEmpty && seen.add(u))
      .map((u) => Api.mediaUrl(u)!)
      .toList();
}

// —— Оплата и доставка ——

class PaymentMethod {
  const PaymentMethod(this.id, this.label, {this.needsDetails = false, this.detailsLabel});
  final String id;
  final String label;
  final bool needsDetails;
  final String? detailsLabel;

  static PaymentMethod fromJson(Map m) {
    final id = '${m['id']}';
    return PaymentMethod(
      id,
      '${m['label'] ?? id}',
      needsDetails: id != 'mobile' && m['needsDetails'] == true,
      detailsLabel: m['detailsLabel'] as String?,
    );
  }
}

class DeliveryMethod {
  const DeliveryMethod(this.id, this.label, {this.requiresAddress = true, this.price = 0});
  final String id;
  final String label;
  final bool requiresAddress;
  final double price;

  static DeliveryMethod fromJson(Map m) => DeliveryMethod(
        '${m['id']}',
        '${m['label'] ?? m['id']}',
        requiresAddress: m['requiresAddress'] != false,
        price: toDouble(m['price']),
      );
}

/// Запасной список, если API недоступен. Оплата бонусами отключена — магазин за деньги.
const paymentMethodsFallback = [
  PaymentMethod('cash', 'Наличные при доставке'),
  PaymentMethod('delivery', 'Доставка'),
  PaymentMethod('card', 'Банковская карта', needsDetails: true, detailsLabel: 'Номер карты или последние 4 цифры'),
  PaymentMethod('mobile', 'Мобильный перевод'),
  PaymentMethod('bank', 'Перевод на расчётный счёт', needsDetails: true, detailsLabel: 'Банк или ФИО плательщика'),
];

const deliveryMethodsFallback = [
  DeliveryMethod('courier', 'Доставка курьером', price: 25),
  DeliveryMethod('pickup', 'Самовывоз', requiresAddress: false),
];

Future<({List<PaymentMethod> payment, List<DeliveryMethod> delivery})> fetchCheckoutMethods() async {
  try {
    final results = await Future.wait([
      Api.get('/api/mobile/payment-methods'),
      Api.get('/api/mobile/delivery-methods'),
    ]);
    final payRaw = results[0] is List ? results[0] as List : (results[0] is Map ? results[0]['methods'] : null);
    final payment = (payRaw is List ? payRaw : const [])
        .whereType<Map>()
        .map(PaymentMethod.fromJson)
        .where((m) => m.id != 'bonus')
        .toList();
    final delivery = (results[1] is List ? results[1] as List : const [])
        .whereType<Map>()
        .map(DeliveryMethod.fromJson)
        .toList();
    return (
      payment: payment.isEmpty ? paymentMethodsFallback : payment,
      delivery: delivery.isEmpty ? deliveryMethodsFallback : delivery,
    );
  } catch (_) {
    return (payment: paymentMethodsFallback, delivery: deliveryMethodsFallback);
  }
}
