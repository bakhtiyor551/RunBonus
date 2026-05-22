import { NavLink } from 'react-router-dom';
import Icon from './Icon';

const tabs = [
  { to: '/shop', label: 'Магазин', icon: 'storefront', end: true },
  { to: '/orders', label: 'Заказы', icon: 'receipt_long' },
  { to: '/activate', label: 'Активация', icon: 'qr_code_scanner' },
  { to: '/profile', label: 'Профиль', icon: 'person' },
];

export default function BottomNavNoShoe() {
  return (
    <nav className="rb-bottom-nav" aria-label="Навигация">
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <Icon name={tab.icon} />
          <span className="rb-bottom-nav__label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
