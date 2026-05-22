import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { api } from '../api';
import Icon from './Icon';

const tabs = [
  { to: '/', label: 'Главная', icon: 'home', end: true },
  { to: '/level', label: 'Уровень', icon: 'military_tech' },
  { to: '/wallet', label: 'Кошелёк', icon: 'account_balance_wallet' },
  { to: '/profile', label: 'Профиль', icon: 'person' },
];

export default function BottomNav() {
  const location = useLocation();
  const [levelLabel, setLevelLabel] = useState(null);

  useEffect(() => {
    api('/api/me/level')
      .then((d) => {
        if (d?.current_level) setLevelLabel(d.current_level);
        else setLevelLabel(null);
      })
      .catch(() => setLevelLabel(null));
  }, [location.pathname]);

  return (
    <nav className="rb-bottom-nav" aria-label="Навигация">
      {tabs.map((tab) => {
        const label = tab.to === '/level' && levelLabel ? levelLabel : tab.label;
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => (isActive ? 'active' : undefined)}
          >
            <Icon name={tab.icon} filled={tab.to === '/level' && !!levelLabel} />
            <span className="rb-bottom-nav__label">{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
