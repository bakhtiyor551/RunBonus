import Icon from './Icon';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 0, label: 'Клиенты', icon: 'group' },
  { id: 1, label: 'QR / Кроссовки', icon: 'qr_code_2' },
  { id: 2, label: 'Тренировки', icon: 'directions_run' },
  { id: 3, label: 'Бонусные счета', icon: 'account_balance_wallet' },
  { id: 4, label: 'Настройки бонусов', icon: 'settings' },
  { id: 7, label: 'Уровни клиентов', icon: 'military_tech' },
  { id: 5, label: 'Списание бонусов', icon: 'payments' },
  { id: 6, label: 'Вывод средств', icon: 'south_west' },
  { id: 8, label: 'Магазин', icon: 'storefront' },
  { id: 12, label: 'Склад', icon: 'inventory_2' },
  { id: 11, label: 'Отчёты', icon: 'analytics' },
  { id: 9, label: 'Заказы', icon: 'shopping_bag' },
  { id: 10, label: 'Способы оплаты', icon: 'payments' },
  { id: 'ads', label: 'Реклама', icon: 'campaign' },
];

export default function Sidebar({ activeTab, onNavigate, adminLogin, onLogout }) {
  const isActive = (item) =>
    item.id === 'dashboard' || item.id === 'ads'
      ? activeTab === item.id
      : activeTab === item.id;

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">RunBonus</div>
      <nav className="sidebar__nav">
        {NAV.map((item) => (
          <button
            key={String(item.id)}
            type="button"
            className={`sidebar__link${isActive(item) ? ' sidebar__link--active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} filled={isActive(item)} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar__footer">
        {/* <div className="sidebar__profile">
          <div className="sidebar__avatar">
            <Icon name="admin_panel_settings" />
          </div>
          <div className="sidebar__profile-text">
            <p className="sidebar__profile-name">{adminLogin || 'Admin'}</p>
            <p className="sidebar__profile-role">Pro Tier Admin</p>
          </div>
          <Icon name="bolt" className="sidebar__bolt" />
        </div> */}
        <button type="button" className="btn btn--ghost btn--sm sidebar__logout" onClick={onLogout}>
          Выйти
        </button>
      </div>
    </aside>
  );
}
