import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import BottomNavNoShoe from '../components/BottomNavNoShoe';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';

function ProductCard({ product, onOpen }) {
  const sizes = (product.sizes || []).filter((s) => s.in_stock).map((s) => s.size);
  return (
    <button type="button" className="glass-card rb-shop-card" onClick={() => onOpen(product.id)}>
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
            {product.color}
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
  );
}

export default function ShopPage({ user, limitedMode = false }) {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/mobile/products')
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  const Nav = limitedMode ? BottomNavNoShoe : BottomNav;

  return (
    <IonPage>
      <AppHeader />
      <IonContent>
        <main className="rb-main">
          <h1 className="rb-headline font-display" style={{ marginBottom: 8 }}>
            Магазин RunBonus
          </h1>
          <p className="rb-text-muted" style={{ marginBottom: 24 }}>
            {limitedMode
              ? 'Закажите кроссовки с QR — после доставки активируйте их в приложении.'
              : 'Кроссовки с программой бонусов за километры.'}
          </p>

          {loading && <p className="rb-text-muted">Загрузка…</p>}
          {!loading && !products.length && <p className="rb-text-muted">Товары скоро появятся</p>}

          <div className="rb-shop-grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} onOpen={(id) => navigate(`/shop/${id}`)} />
            ))}
          </div>
        </main>
        {limitedMode && <Nav />}
        {!limitedMode && user && <Nav />}
      </IonContent>
    </IonPage>
  );
}
