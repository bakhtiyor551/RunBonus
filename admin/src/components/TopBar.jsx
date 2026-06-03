import Icon from './Icon';

const TITLES = {
  dashboard: 'Dashboard Analytics',
  0: 'Клиенты',
  1: 'QR / Кроссовки',
  2: 'Тренировки',
  3: 'Бонусные счета',
  4: 'Настройки бонусов',
  5: 'Списание бонусов',
  6: 'Вывод средств',
  7: 'Уровни клиентов',
  8: 'Магазин — товары',
  9: 'Заказы магазина',
  10: 'Способы оплаты',
};

export default function TopBar({ activeTab, fundBalance, currency = 'TJS' }) {
  const title = TITLES[activeTab] ?? 'RunBonus Admin';

  return (
    <header className="topbar">
      <div className="topbar__left">
        <Icon name="bolt" className="topbar__bolt" />
        <h1 className="topbar__title">{title}</h1>
      </div>
      <div className="topbar__right">
        <button type="button" className="topbar__icon-btn" aria-label="Уведомления">
          <Icon name="notifications" />
          <span className="topbar__dot" />
        </button>
        <div className="topbar__divider" />
        <div className="topbar__balance">
          <Icon name="account_balance" className="topbar__balance-icon" />
          <span className="topbar__balance-value">
            {fundBalance != null
              ? `${Number(fundBalance).toLocaleString('ru-RU')} ${currency}`
              : '—'}
          </span>
        </div>
      </div>
    </header>
  );
}
