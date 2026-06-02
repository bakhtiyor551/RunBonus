import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import { cartCount } from '../services/cart';

function ProductCard({ product, onOpen, onAr }) {
  const sizes = (product.sizes || []).filter((s) => s.in_stock).map((s) => s.size);
  const hasAr = product.slug === 'urban-sprint';
  return (
    <div className="glass-card rb-shop-card rb-shop-card--wrap">
    <button type="button" className="rb-shop-card__tap" onClick={() => onOpen(product.id)}>
      <div className="rb-shop-card__img">
        {product.image_url ? (
          <img src={product.image_url} alt="" />
        ) : (
          <Icon name="directions_run" filled style={{ fontSize: 40, color: 'var(--rb-neon)' }} />
        )}
      </div>
      <div className="rb-shop-card__body">
        <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600 }}>{product.name}</h3>
        <p className="rb-display font-display" style={{ margin: '0 0 6px', fontSize: 22, color: 'var(--rb-neon)' }}>
          {product.price} <span style={{ fontSize: 14 }}>сомони</span>
        </p>
        {product.color && (
          <p className="rb-text-muted" style={{ margin: '0 0 4px', fontSize: 12 }}>
            Цвет: {product.color}
          </p>
        )}
        {sizes.length > 0 && (
          <p className="rb-label" style={{ margin: 0, textTransform: 'none', fontSize: 11 }}>
            Размеры: {sizes.join(', ')}
          </p>
        )}
        <span className="rb-badge-live" style={{ marginTop: 8, fontSize: 10 }}>
          {product.in_stock ? 'В наличии' : 'Нет в наличии'}
        </span>
      </div>
    </button>
    {hasAr && (
      <button
        type="button"
        className="rb-shop-card__ar-btn"
        onClick={(e) => {
          e.stopPropagation();
          onAr(product);
        }}
      >
        <Icon name="view_in_ar" />
        Примерить в AR
      </button>
    )}
    </div>
  );
}

export default function ShopPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cartItems, setCartItems] = useState(cartCount());

  useEffect(() => {
    api('/api/mobile/products')
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const refresh = () => setCartItems(cartCount());
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  return (
    <IonPage>
      <AppHeader />
      <IonContent>
        <main className="rb-main">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
            <h1 className="rb-headline font-display" style={{ margin: 0 }}>
              Магазин RunBonus
            </h1>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button type="button" className="rb-btn-pill" style={{ padding: '8px 12px', fontSize: 12 }} onClick={() => navigate('/orders')}>
                Заказы
              </button>
              <button
                type="button"
                className="rb-btn-pill"
                style={{ padding: '8px 12px', fontSize: 12, position: 'relative' }}
                onClick={() => navigate('/cart')}
              >
                <Icon name="shopping_cart" />
                {cartItems > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      background: 'var(--rb-neon)',
                      color: 'var(--rb-on-neon)',
                      borderRadius: 10,
                      fontSize: 10,
                      minWidth: 18,
                      height: 18,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                    }}
                  >
                    {cartItems}
                  </span>
                )}
              </button>
            </div>
          </div>
          <p className="rb-text-muted" style={{ marginBottom: 16 }}>
            Кроссовки с программой бонусов за километры. После доставки привяжите QR на главной или во вкладке «Бег».
          </p>

          <button
            type="button"
            className="glass-card rb-urban-ar-banner"
            style={{ width: '100%', marginBottom: 24, padding: 16, textAlign: 'left', border: 'none', cursor: 'pointer', color: 'inherit' }}
            onClick={() => navigate('/shop/ar/urban-sprint')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Icon name="view_in_ar" filled style={{ fontSize: 36, color: 'var(--rb-neon)' }} />
              <div>
                <strong className="font-display" style={{ fontSize: 17 }}>
                  Примерь Urban Sprint у себя дома
                </strong>
                <p className="rb-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  AR-примерка и 3D-обзор 360° · 4 цвета
                </p>
              </div>
              <Icon name="chevron_right" style={{ marginLeft: 'auto' }} />
            </div>
          </button>

          {loading && <p className="rb-text-muted">Загрузка…</p>}
          {!loading && !products.length && <p className="rb-text-muted">Товары скоро появятся</p>}

          <div className="rb-shop-grid">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onOpen={(id) => navigate(`/shop/${id}`)}
                onAr={(prod) =>
                  navigate(`/shop/ar/${prod.slug || 'urban-sprint'}`, { state: { productId: prod.id } })
                }
              />
            ))}
          </div>
        </main>
        <BottomNav />
      </IonContent>
    </IonPage>
  );
}
