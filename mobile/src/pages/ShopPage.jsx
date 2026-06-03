import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import Icon from '../components/Icon';
import { cartCount } from '../services/cart';
import { fetchShopCatalog } from '../utils/shopCatalog';

function ProductCard({ product, onOpen }) {
  const sizes = (product.sizes || []).filter((s) => s.in_stock).map((s) => s.size);
  const colorLabels = (product.colors || []).map((c) => c.label).filter(Boolean);
  const colorsText =
    colorLabels.length > 1
      ? colorLabels.join(', ')
      : colorLabels[0] || product.color || '';

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
        {product.category_name && (
          <span className="rb-shop-card__category">{product.category_name}</span>
        )}
        <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600 }}>{product.name}</h3>
        <p className="rb-display font-display" style={{ margin: '0 0 6px', fontSize: 22, color: 'var(--rb-neon)' }}>
          {product.price} <span style={{ fontSize: 14 }}>сомони</span>
        </p>
        {colorsText && (
          <p className="rb-text-muted" style={{ margin: '0 0 4px', fontSize: 12 }}>
            {colorLabels.length > 1 ? `Цвета: ${colorsText}` : `Цвет: ${colorsText}`}
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

export default function ShopPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [categoryId, setCategoryId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState('');
  const [cartItems, setCartItems] = useState(cartCount);

  const loadCatalog = useCallback(async (catId) => {
    setLoading(true);
    setCategoriesError('');
    try {
      const { categories: cats, products: list } = await fetchShopCatalog(catId);
      setCategories(cats);
      setProducts(list);
    } catch (err) {
      setCategories([]);
      setProducts([]);
      setCategoriesError(err.message || 'Не удалось загрузить каталог');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog(categoryId);
  }, [categoryId, loadCatalog]);

  useEffect(() => {
    const refresh = () => setCartItems(cartCount());
    window.addEventListener('rb-cart-updated', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('rb-cart-updated', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const categoryTabs = useMemo(() => {
    const fromApi = categories.map((c) => ({ id: c.id, name: c.name }));
    return [{ id: null, name: 'Все' }, ...fromApi];
  }, [categories]);

  const isCategoryActive = (tabId) => {
    if (tabId == null) return categoryId == null;
    return String(categoryId) === String(tabId);
  };

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
            Кроссовки с программой бонусов за километры. После доставки привяжите QR на главной.
          </p>

          {categoriesError && (
            <p className="rb-text-muted" style={{ marginBottom: 12, color: 'var(--rb-error)' }}>
              {categoriesError}
            </p>
          )}

          {categoryTabs.length > 1 && (
            <div className="rb-shop-categories">
              {categoryTabs.map((c) => (
                <button
                  key={c.id ?? 'all'}
                  type="button"
                  className={`rb-shop-category-chip${isCategoryActive(c.id) ? ' rb-shop-category-chip--active' : ''}`}
                  onClick={() => setCategoryId(c.id)}
                  disabled={loading}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {loading && <p className="rb-text-muted">Загрузка…</p>}
          {!loading && categoryId != null && !products.length && !categoriesError && (
            <p className="rb-text-muted">В этой категории пока нет товаров. Назначьте категорию товару в админке.</p>
          )}
          {!loading && categoryId == null && !products.length && !categoriesError && (
            <p className="rb-text-muted">Товары скоро появятся</p>
          )}

          <div className="rb-shop-grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} onOpen={(pid) => navigate(`/shop/${pid}`)} />
            ))}
          </div>
        </main>
        <BottomNav />
      </IonContent>
    </IonPage>
  );
}
