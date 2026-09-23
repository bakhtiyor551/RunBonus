import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Icon from './Icon';
import { fetchRewardsProgress } from '../services/rewards';
import { cartCount } from '../services/cart';

const tabs = [
  { to: '/', label: 'Главная', icon: 'home', end: true },
  { to: '/workouts', label: 'Тренировки', icon: 'directions_run', match: ['/workouts', '/workout'] },
  { to: '/shop', label: 'Магазин', icon: 'storefront', badgeKey: 'cart', match: ['/shop', '/cart', '/orders'] },
  { to: '/rewards', label: 'Награды', icon: 'redeem', badgeKey: 'rewards', match: ['/rewards', '/my-rewards'] },
  { to: '/profile', label: 'Профиль', icon: 'person' },
];

function pathMatches(pathname, tab) {
  if (tab.end) return pathname === tab.to;
  if (tab.match?.length) {
    return tab.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  return pathname === tab.to || pathname.startsWith(`${tab.to}/`);
}

export default function BottomNav() {
  const location = useLocation();
  const [claimable, setClaimable] = useState(0);
  const [cartItems, setCartItems] = useState(() => cartCount());

  useEffect(() => {
    let cancelled = false;
    fetchRewardsProgress()
      .then((data) => {
        if (cancelled) return;
        const count = (data?.milestones || []).filter(
          (m) => m.status === 'AVAILABLE' || m.status === 'CHOOSING'
        ).length;
        setClaimable(count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  useEffect(() => {
    const refresh = () => setCartItems(cartCount());
    refresh();
    window.addEventListener('rb-cart-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('rb-cart-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return (
    <nav className="rb-bottom-nav rb-bottom-nav--5" aria-label="Навигация">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={() => (pathMatches(location.pathname, tab) ? 'active' : undefined)}
        >
          <span className="rb-bottom-nav__icon-wrap">
            <Icon name={tab.icon} />
            {tab.badgeKey === 'rewards' && claimable > 0 ? (
              <span className="rb-bottom-nav__badge" aria-label={`${claimable} доступно`}>
                {claimable > 9 ? '9+' : claimable}
              </span>
            ) : null}
            {tab.badgeKey === 'cart' && cartItems > 0 ? (
              <span className="rb-bottom-nav__badge" aria-label={`${cartItems} в корзине`}>
                {cartItems > 9 ? '9+' : cartItems}
              </span>
            ) : null}
          </span>
          <span className="rb-bottom-nav__label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
