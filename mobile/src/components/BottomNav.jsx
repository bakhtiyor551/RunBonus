import { NavLink } from 'react-router-dom';
import Icon from './Icon';

const tabs = [
  { to: '/', label: 'Главная', icon: 'home', end: true },
  { to: '/summary', label: 'Сводка', icon: 'bar_chart' },
  { to: '/wallet', label: 'Кошелёк', icon: 'account_balance_wallet' },
  { to: '/shop', label: 'Магазин', icon: 'storefront' },
  { to: '/profile', label: 'Профиль', icon: 'person' },
];

export default function BottomNav() {
  return (
    <nav className="rb-bottom-nav rb-bottom-nav--5" aria-label="Навигация">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => (isActive ? 'active' : undefined)}
        >
          <Icon name={tab.icon} />
          <span className="rb-bottom-nav__label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
