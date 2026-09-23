import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Icon from './Icon';
import { fetchRewardsProgress } from '../services/rewards';

const tabs = [
  { to: '/', label: 'Главная', icon: 'home', end: true },
  { to: '/workouts', label: 'Тренировки', icon: 'directions_run' },
  { to: '/rewards', label: 'Награды', icon: 'redeem', badgeKey: 'rewards' },
  { to: '/profile', label: 'Профиль', icon: 'person' },
];

export default function BottomNav() {
  const location = useLocation();
  const [claimable, setClaimable] = useState(0);

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

  return (
    <nav className="rb-bottom-nav rb-bottom-nav--4" aria-label="Навигация">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => (isActive ? 'active' : undefined)}
        >
          <span className="rb-bottom-nav__icon-wrap">
            <Icon name={tab.icon} />
            {tab.badgeKey === 'rewards' && claimable > 0 ? (
              <span className="rb-bottom-nav__badge" aria-label={`${claimable} доступно`}>
                {claimable > 9 ? '9+' : claimable}
              </span>
            ) : null}
          </span>
          <span className="rb-bottom-nav__label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
