import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import Icon from '../components/Icon';
import QuantityStepper from '../components/QuantityStepper';
import { addToCart } from '../services/cart';
import { showToast } from '../utils/toast';

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [size, setSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api(`/api/mobile/products/${id}`)
      .then((p) => {
        setProduct(p);
        const first = (p.sizes || []).find((s) => s.in_stock);
        if (first) setSize(first.size);
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [id]);

  const addToCartAndGo = async () => {
    if (!size) {
      await showToast('Выберите размер');
      return;
    }
    addToCart({
      productId: product.id,
      name: product.name,
      size,
      color: product.color,
      price: product.price,
      image_url: product.image_url,
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

  const availableSizes = (product.sizes || []).filter((s) => s.in_stock);

  return (
    <IonPage>
      <AppHeader onBack={() => navigate(-1)} />
      <IonContent>
        <main className="rb-main">
          <div className="rb-shop-detail-hero glass-card">
            {product.image_url ? (
              <img src={product.image_url} alt="" />
            ) : (
              <Icon name="directions_run" filled style={{ fontSize: 72, color: 'var(--rb-neon)' }} />
            )}
          </div>

          <h1 className="rb-headline font-display" style={{ margin: '16px 0 4px' }}>
            {product.name}
          </h1>
          <p className="rb-display font-display" style={{ color: 'var(--rb-neon)', fontSize: 28, margin: '0 0 8px' }}>
            {product.price} сомони
          </p>
          {product.color && <p className="rb-text-muted">Цвет: {product.color}</p>}
          <p className="rb-text-muted" style={{ marginTop: 8 }}>
            {product.in_stock ? 'В наличии' : 'Нет в наличии'}
          </p>
          <p className="rb-text-muted" style={{ marginTop: 12, lineHeight: 1.5 }}>
            {product.description}
          </p>

          <section style={{ marginTop: 24 }}>
            <p className="rb-label" style={{ marginBottom: 8 }}>
              Размер
            </p>
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
          </section>

          <div style={{ marginTop: 20, marginBottom: 24 }}>
            <QuantityStepper label="Количество" value={quantity} onChange={setQuantity} />
          </div>

          <button type="button" className="rb-btn-primary" style={{ width: '100%' }} onClick={addToCartAndGo}>
            <Icon name="add_shopping_cart" />
            В корзину
          </button>
        </main>
      </IonContent>
    </IonPage>
  );
}
