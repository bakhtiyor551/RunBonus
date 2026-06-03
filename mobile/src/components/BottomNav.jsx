import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Icon from './Icon';
import { cartCount } from '../services/cart';

const tabs = [
  { to: '/', label: 'Главная', icon: 'home', end: true },
  { to: '/level', label: 'Уровень', icon: 'military_tech' },
  { to: '/wallet', label: 'Кошелёк', icon: 'account_balance_wallet' },
  { to: '/shop', label: 'Магазин', icon: 'storefront' },
  { to: '/cart', label: 'Корзина', icon: 'shopping_cart', badge: true },
  { to: '/profile', label: 'Профиль', icon: 'person' },
];

export default function BottomNav() {
  const [itemsInCart, setItemsInCart] = useState(cartCount);

  useEffect(() => {
    const refresh = () => setItemsInCart(cartCount());
    window.addEventListener('rb-cart-updated', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('rb-cart-updated', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return (
    <nav className="rb-bottom-nav rb-bottom-nav--6" aria-label="Навигация">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => (isActive ? 'active' : undefined)}
        >
          <span className="rb-bottom-nav__icon-wrap">
            <Icon name={tab.icon} />
            {tab.badge && itemsInCart > 0 && (
              <span className="rb-bottom-nav__badge" aria-label={`В корзине: ${itemsInCart}`}>
                {itemsInCart > 99 ? '99+' : itemsInCart}
              </span>
            )}
          </span>
          <span className="rb-bottom-nav__label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
