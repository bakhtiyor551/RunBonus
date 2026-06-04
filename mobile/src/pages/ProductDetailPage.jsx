import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import Icon from '../components/Icon';
import QuantityStepper from '../components/QuantityStepper';
import ColorPicker from '../components/ColorPicker';
import ProductImageGallery, { buildProductImages } from '../components/ProductImageGallery';
import { addToCart } from '../services/cart';
import { showToast } from '../utils/toast';

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [size, setSize] = useState('');
  const [selectedColor, setSelectedColor] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);

  const colors = product?.colors?.length ? product.colors : product?.color ? [{ label: product.color }] : [];

  const displayImage = useMemo(() => {
    const imgs = buildProductImages(product, selectedColor);
    return imgs[0] || null;
  }, [product, selectedColor]);

  useEffect(() => {
    api(`/api/mobile/products/${id}`)
      .then((p) => {
        setProduct(p);
        const colorList = p.colors?.length ? p.colors : p.color ? [{ label: p.color }] : [];
        if (colorList.length) setSelectedColor(colorList[0]);
        const first = (p.sizes || []).find((s) => s.in_stock);
        setSize(first?.size || '');
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [id]);

  const availableSizes = useMemo(
    () => (product?.sizes || []).filter((s) => s.in_stock),
    [product]
  );

  const hasStock = availableSizes.length > 0;

  useEffect(() => {
    if (!product) return;
    const first = availableSizes[0];
    setSize(first?.size || '');
  }, [selectedColor?.id, selectedColor?.label, product?.id, availableSizes]);

  const addToCartAndGo = async () => {
    if (!hasStock) {
      await showToast('Нет в наличии');
      return;
    }
    if (!size) {
      await showToast('Выберите размер');
      return;
    }
    if (colors.length > 0 && !selectedColor?.label) {
      await showToast('Выберите цвет');
      return;
    }
    addToCart({
      productId: product.id,
      name: product.name,
      size,
      color: selectedColor?.label || product.color || '',
      color_id: selectedColor?.id ?? null,
      price: product.price,
      image_url: displayImage || product.image_url,
      quantity: Number(quantity) || 1,
    });
    navigate('/cart');
  };

  if (loading) {
    return (
      <IonPage>
        <AppHeader onBack={() => navigate(-1)} />
        <IonContent>
          <main className="rb-main">
            <p className="rb-text-muted">Загрузка…</p>
          </main>
        </IonContent>
      </IonPage>
    );
  }

  if (!product) {
    return (
      <IonPage>
        <AppHeader onBack={() => navigate(-1)} />
        <IonContent>
          <main className="rb-main">
            <p className="rb-text-muted">Товар не найден</p>
          </main>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <AppHeader onBack={() => navigate(-1)} />
      <IonContent>
        <main className="rb-main">
          <ProductImageGallery product={product} selectedColor={selectedColor} />

          {colors.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <ColorPicker
                colors={colors}
                value={selectedColor?.label}
                onChange={setSelectedColor}
              />
            </div>
          )}

          <h1 className="rb-headline font-display" style={{ margin: '16px 0 4px' }}>
            {product.name}
          </h1>
          {product.category_name && (
            <span className="rb-badge-live" style={{ marginBottom: 8, display: 'inline-block' }}>
              {product.category_name}
            </span>
          )}
          <p className="rb-display font-display" style={{ color: 'var(--rb-neon)', fontSize: 28, margin: '0 0 8px' }}>
            {product.price} сомони
          </p>
          <p
            className="rb-text-muted"
            style={{
              marginTop: 8,
              color: hasStock ? undefined : 'var(--rb-error)',
            }}
          >
            {hasStock ? 'В наличии' : 'Нет в наличии'}
          </p>
          <p className="rb-text-muted" style={{ marginTop: 12, lineHeight: 1.5 }}>
            {product.description}
          </p>

          <section style={{ marginTop: 24 }}>
            <p className="rb-label" style={{ marginBottom: 8 }}>
              Размер
            </p>
            {hasStock ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {availableSizes.map((s) => (
                  <button
                    key={s.size}
                    type="button"
                    className={`rb-size-chip${size === s.size ? ' rb-size-chip--active' : ''}`}
                    onClick={() => setSize(s.size)}
                  >
                    {s.size}
                  </button>
                ))}
              </div>
            ) : (
              <p className="rb-text-muted" style={{ margin: 0, color: 'var(--rb-error)' }}>
                Нет в наличии
              </p>
            )}
          </section>

          <div style={{ marginTop: 20, marginBottom: 24 }}>
            <QuantityStepper label="Количество" value={quantity} onChange={setQuantity} disabled={!hasStock} />
          </div>

          <button
            type="button"
            className="rb-btn-primary"
            style={{ width: '100%', opacity: hasStock ? 1 : 0.5 }}
            disabled={!hasStock}
            onClick={addToCartAndGo}
          >
            <Icon name="add_shopping_cart" />
            В корзину
          </button>
        </main>
      </IonContent>
    </IonPage>
  );
}
