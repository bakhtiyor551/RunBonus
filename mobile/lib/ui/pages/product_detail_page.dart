import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../services/cart.dart';
import '../../services/shop.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/forms.dart';
import 'shop_page.dart';

class ProductDetailPage extends StatefulWidget {
  const ProductDetailPage({super.key, required this.productId});
  final String productId;

  @override
  State<ProductDetailPage> createState() => _ProductDetailPageState();
}

class _ProductDetailPageState extends State<ProductDetailPage> {
  Json? _product;
  Json? _color;
  String? _size;
  int _quantity = 1;
  int _imageIndex = 0;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    Api.get('/api/mobile/products/${widget.productId}').then((p) {
      if (!mounted || p is! Map) return;
      final product = Map<String, dynamic>.from(p);
      final first = productColors(product).firstOrNull;
      setState(() {
        _product = product;
        _color = first;
        _size = sizesForColor(product, first).firstOrNull?['size']?.toString();
      });
    }).catchError((_) {}).whenComplete(() {
      if (mounted) setState(() => _loading = false);
    });
  }

  void _selectColor(Json c) {
    setState(() {
      _color = c;
      _imageIndex = 0;
      _size = sizesForColor(_product, c).firstOrNull?['size']?.toString();
    });
  }

  void _back() => context.canPop() ? context.pop() : context.go('/shop');

  Future<void> _addToCart() async {
    final p = _product!;
    final colors = productColors(p);
    if (!productHasStock(p, _color)) return showToast(context, 'Нет в наличии');
    if (_size == null || _size!.isEmpty) return showToast(context, 'Выберите размер');
    if (colors.isNotEmpty && (_color?['label'] == null)) return showToast(context, 'Выберите цвет');
    final images = buildProductImages(p, _color);
    await Cart.instance.add(CartItem(
      productId: p['id'],
      name: '${p['name'] ?? ''}',
      size: _size!,
      color: '${_color?['label'] ?? p['color'] ?? ''}',
      colorId: _color?['id'],
      price: double.tryParse('${p['price']}') ?? 0,
      imageUrl: images.firstOrNull ?? Api.mediaUrl(p['image_url'] as String?),
      quantity: _quantity,
    ));
    if (mounted) context.go('/cart');
  }

  @override
  Widget build(BuildContext context) {
    final p = _product;
    Widget body;
    if (_loading) {
      body = const Loader();
    } else if (p == null) {
      body = Padding(padding: const EdgeInsets.all(20), child: Text('Товар не найден', style: RB.body(color: RB.onSurfaceVariant)));
    } else {
      final images = buildProductImages(p, _color);
      final current = images.isEmpty ? null : images[_imageIndex.clamp(0, images.length - 1)];
      final sizes = sizesForColor(p, _color);
      final hasStock = sizes.isNotEmpty;
      final colors = productColors(p);
      final category = '${p['category_name'] ?? ''}';

      body = SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(RB.radiusLg),
              child: AspectRatio(
                aspectRatio: 1,
                child: ColoredBox(color: RB.surfaceLow, child: ProductImage(key: ValueKey(current), url: current, iconSize: 72)),
              ),
            ),
            if (images.length > 1) ...[
              const SizedBox(height: 10),
              SizedBox(
                height: 64,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: images.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (context, i) => GestureDetector(
                    onTap: () => setState(() => _imageIndex = i),
                    child: Container(
                      width: 64,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: i == _imageIndex ? RB.neon : RB.outline, width: 2),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: ProductImage(url: images[i], iconSize: 20),
                    ),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 12),
            ColorPicker(colors: colors, value: _color?['label'] as String?, onChanged: _selectColor),
            Text('${p['name'] ?? ''}', style: RB.headline(size: 28)),
            if (category.isNotEmpty) ...[
              const SizedBox(height: 6),
              Align(alignment: Alignment.centerLeft, child: StatusPill(category, color: RB.neon)),
            ],
            const SizedBox(height: 8),
            Text('${formatPrice(p['price'])} сомони', style: RB.headline(size: 28, color: RB.neon)),
            const SizedBox(height: 8),
            Text(hasStock ? 'В наличии' : 'Нет в наличии', style: RB.body(color: hasStock ? RB.onSurfaceVariant : RB.error)),
            if ('${p['description'] ?? ''}'.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text('${p['description']}', style: RB.body(color: RB.onSurfaceVariant).copyWith(height: 1.5)),
            ],
            const SizedBox(height: 24),
            const FieldLabel('Размер'),
            if (hasStock)
              SizePicker(sizes: sizes, value: _size, onChanged: (s) => setState(() => _size = s))
            else
              Text('Нет в наличии', style: RB.body(color: RB.error)),
            const SizedBox(height: 20),
            Align(
              alignment: Alignment.centerLeft,
              child: QuantityStepper(
                label: 'Количество',
                value: _quantity,
                enabled: hasStock,
                onChanged: (q) => setState(() => _quantity = q),
              ),
            ),
            const SizedBox(height: 24),
            PrimaryButton(label: 'В корзину', icon: Icons.add_shopping_cart, onPressed: hasStock ? _addToCart : null),
          ],
        ),
      );
    }
    return Scaffold(appBar: AppHeader(onBack: _back), body: body);
  }
}
