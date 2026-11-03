import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app_state.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../services/cart.dart';
import '../../services/shop.dart';
import '../theme.dart';
import '../widgets/ads.dart';
import '../widgets/bottom_nav.dart';
import '../widgets/common.dart';
import '../widgets/forms.dart';

String formatPrice(Object? price) => formatNumber(toDouble(price));

class ShopPage extends StatefulWidget {
  const ShopPage({super.key});

  @override
  State<ShopPage> createState() => _ShopPageState();
}

class _ShopPageState extends State<ShopPage> {
  List<ShopCategory> _categories = [];
  List<Json> _products = [];
  String? _categoryId;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final catalog = await fetchShopCatalog(_categoryId);
      if (!mounted) return;
      setState(() {
        _categories = catalog.categories;
        _products = catalog.products;
      });
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _categories = [];
        _products = [];
        _error = errorMessage(err, 'Не удалось загрузить каталог');
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _select(String? id) {
    if (id == _categoryId) return;
    setState(() => _categoryId = id);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final city = context.select<AppState, String?>((s) => s.user?['city'] as String?);
    final want = normalizeProductCategoryId(_categoryId);
    final products = want == null ? _products : _products.where((p) => normalizeProductCategoryId(p['category_id']) == want).toList();
    final tabs = <(String?, String)>[(null, 'Все'), for (final c in _categories) (c.id, c.name)];

    return TabPage(
      header: const AppHeader(),
      onRefresh: _load,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: Text('Магазин RunBonus', style: RB.headline(size: 28))),
              PrimaryButton(label: 'Заказы', compact: true, onPressed: () => context.go('/orders')),
              const SizedBox(width: 8),
              ListenableBuilder(
                listenable: Cart.instance,
                builder: (context, _) => Badge(
                  isLabelVisible: Cart.instance.count > 0,
                  label: Text('${Cart.instance.count}'),
                  backgroundColor: RB.neon,
                  textColor: RB.onNeon,
                  child: IconButton.filled(
                    onPressed: () => context.go('/cart'),
                    icon: const Icon(Icons.shopping_cart_outlined),
                    tooltip: 'Корзина',
                    style: IconButton.styleFrom(backgroundColor: RB.neon, foregroundColor: RB.onNeon),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text('Кроссовки с программой бонусов за километры. После доставки привяжите QR на главной.',
              style: RB.body(color: RB.onSurfaceVariant)),
          const SizedBox(height: 16),
          if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: ErrorBox(_error!, onRetry: _load)),
          if (tabs.length > 1)
            SizedBox(
              height: 40,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: tabs.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final (id, name) = tabs[i];
                  final active = id == _categoryId;
                  return ChoiceChip(
                    label: Text(name),
                    selected: active,
                    onSelected: (_) => _select(id),
                    showCheckmark: false,
                    selectedColor: RB.neon,
                    backgroundColor: RB.surfaceLow,
                    labelStyle: RB.body(weight: FontWeight.w600, color: active ? RB.onNeon : RB.onSurface),
                    side: BorderSide(color: active ? RB.neon : RB.outline),
                    shape: const StadiumBorder(),
                  );
                },
              ),
            ),
          const SizedBox(height: 16),
          if (_loading) const Loader(),
          if (!_loading && products.isEmpty && _error == null)
            Text(
              _categoryId != null ? 'В этой категории пока нет товаров. Назначьте категорию товару в админке.' : 'Товары скоро появятся',
              style: RB.body(color: RB.onSurfaceVariant),
            ),
          if (!_loading)
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: products.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.52,
              ),
              itemBuilder: (context, i) => _ProductCard(
                key: ValueKey(products[i]['id']),
                product: products[i],
                onOpen: () => context.push('/shop/${products[i]['id']}'),
              ),
            ),
          const SizedBox(height: 24),
          PageAdSlots(page: 'shop', city: city),
        ],
      ),
    );
  }
}

class ProductImage extends StatelessWidget {
  const ProductImage({super.key, required this.url, this.iconSize = 40, this.fit = BoxFit.cover});
  final String? url;
  final double iconSize;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final placeholder = Center(child: Icon(Icons.directions_run, size: iconSize, color: RB.neon));
    if (url == null) return placeholder;
    return CachedNetworkImage(
      imageUrl: url!,
      fit: fit,
      placeholder: (_, _) => const ColoredBox(color: RB.surfaceLow),
      errorWidget: (_, _, _) => placeholder,
    );
  }
}

class _ProductCard extends StatefulWidget {
  const _ProductCard({super.key, required this.product, required this.onOpen});
  final Json product;
  final VoidCallback onOpen;

  @override
  State<_ProductCard> createState() => _ProductCardState();
}

class _ProductCardState extends State<_ProductCard> {
  late Json? _color = productColors(widget.product).firstOrNull;

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final colors = productColors(p);
    final image = buildProductImages(p, _color).firstOrNull;
    final sizes = sizesForColor(p, _color).map((s) => '${s['size']}').toList();
    final inStock = productHasStock(p, _color);
    final labels = colors.map((c) => '${c['label'] ?? ''}').where((l) => l.isNotEmpty).toList();
    final colorsText = labels.length > 1 ? labels.join(', ') : (labels.firstOrNull ?? '${p['color'] ?? ''}');
    final category = '${p['category_name'] ?? ''}';

    return GlassCard(
      padding: EdgeInsets.zero,
      onTap: widget.onOpen,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: Stack(
              fit: StackFit.expand,
              children: [
                ClipRRect(
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(RB.radius)),
                  child: ColoredBox(color: RB.surfaceLow, child: ProductImage(url: image)),
                ),
                if (colors.length > 1)
                  Positioned(
                    left: 8,
                    bottom: 8,
                    child: Row(
                      children: [
                        for (final c in colors)
                          GestureDetector(
                            onTap: () => setState(() => _color = c),
                            child: Container(
                              width: 22,
                              height: 22,
                              margin: const EdgeInsets.only(right: 4),
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: hexForColor(c),
                                border: Border.all(
                                  width: 2,
                                  color: _color?['label'] == c['label'] && _color?['id'] == c['id'] ? RB.neon : Colors.white24,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (category.isNotEmpty) Text(category.toUpperCase(), style: RB.label(size: 10, color: RB.neon)),
                  Text('${p['name'] ?? ''}', maxLines: 2, overflow: TextOverflow.ellipsis, style: RB.body(size: 15, weight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text.rich(TextSpan(children: [
                    TextSpan(text: formatPrice(p['price']), style: RB.headline(size: 20, color: RB.neon)),
                    TextSpan(text: ' сомони', style: RB.body(size: 12, color: RB.neon)),
                  ])),
                  if (colorsText.isNotEmpty)
                    Text(labels.length > 1 ? 'Цвета: $colorsText' : 'Цвет: $colorsText',
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: RB.body(size: 11, color: RB.onSurfaceVariant)),
                  if (sizes.isNotEmpty)
                    Text('Размеры: ${sizes.join(', ')}',
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: RB.body(size: 11, color: RB.onSurfaceVariant)),
                  const Spacer(),
                  StatusPill(inStock ? 'В наличии' : 'Нет в наличии', color: inStock ? RB.neon : RB.error),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
