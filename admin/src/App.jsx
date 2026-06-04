import { useState, useEffect, useCallback } from 'react';
import { adminApi } from './api';
import AccountsTab from './AccountsTab';
import WorkoutsTab from './WorkoutsTab';
import BonusSettingsTab from './BonusSettingsTab';
import CustomerLevelsTab from './CustomerLevelsTab';
import QrShoesTab from './QrShoesTab';
import WithdrawalsTab from './WithdrawalsTab';
import DashboardTab from './DashboardTab';
import ClientsTab from './ClientsTab';
import ShopProductsTab from './ShopProductsTab';
import ShopCategoriesTab from './ShopCategoriesTab';
import ShopOrdersTab from './ShopOrdersTab';
import PaymentMethodsTab from './PaymentMethodsTab';
import ReportsTab from './reports/ReportsTab';
import AdsTab from './ads/AdsTab';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Icon from './components/Icon';
import LoginPage from './LoginPage';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('adminToken'));
  const [adminLogin, setAdminLogin] = useState(localStorage.getItem('adminLogin') || '');
  const [tab, setTab] = useState('dashboard');
  const [spendForm, setSpendForm] = useState({ phone: '', amount: '', comment: '' });
  const [fundBalance, setFundBalance] = useState(null);
  const [fundCurrency, setFundCurrency] = useState('TJS');

  const loadFundBalance = useCallback(async () => {
    try {
      const accounts = await adminApi('/api/admin/accounts');
      const fund = accounts.find((a) => a.type === 'bonus_fund');
      setFundBalance(fund?.current_balance ?? null);
      setFundCurrency(fund?.currency ?? 'TJS');
    } catch {
      setFundBalance(null);
    }
  }, []);

  useEffect(() => {
    if (token) loadFundBalance();
  }, [token, loadFundBalance]);

  const onLoginSuccess = (data) => {
    localStorage.setItem('adminToken', data.token);
    localStorage.setItem('adminRole', data.admin.role);
    localStorage.setItem('adminLogin', data.admin.login);
    setAdminLogin(data.admin.login);
    setToken(data.token);
  };

  const logout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminRole');
    localStorage.removeItem('adminLogin');
    setToken(null);
  };

  const navigate = (index) => {
    setTab(index);
    if (index === 'dashboard') loadFundBalance();
  };

  const spendBonus = async (e) => {
    e.preventDefault();
    const data = await adminApi('/api/admin/bonus/spend', {
      method: 'POST',
      body: JSON.stringify({
        phone: spendForm.phone,
        amount: Number(spendForm.amount),
        comment: spendForm.comment,
      }),
    });
    alert(`Списано. Новый баланс: ${data.balance_after}`);
    setSpendForm({ phone: '', amount: '', comment: '' });
    loadFundBalance();
  };

  if (!token) {
    return <LoginPage onSuccess={onLoginSuccess} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        activeTab={tab}
        onNavigate={navigate}
        adminLogin={adminLogin}
        onLogout={logout}
      />
      <main className="main-canvas custom-scrollbar">
        <TopBar activeTab={tab} fundBalance={fundBalance} currency={fundCurrency} />
        <div className="tab-stack">
          {tab === 'dashboard' && <DashboardTab onNavigate={navigate} />}
          {tab === 0 && (
            <div className="page-content">
              <ClientsTab onFundChange={loadFundBalance} />
            </div>
          )}
          {tab === 1 && (
            <div className="page-content">
              <QrShoesTab />
            </div>
          )}
          {tab === 2 && (
            <div className="page-content">
              <WorkoutsTab />
            </div>
          )}
          {tab === 3 && (
            <div className="page-content">
              <AccountsTab />
            </div>
          )}
          {tab === 4 && (
            <div className="page-content">
              <BonusSettingsTab />
            </div>
          )}
          {tab === 7 && (
            <div className="page-content">
              <CustomerLevelsTab />
            </div>
          )}
          {tab === 6 && (
            <div className="page-content">
              <WithdrawalsTab />
            </div>
          )}
          {tab === 8 && (
            <div className="page-content">
              <ShopProductsTab />
            </div>
          )}
          {tab === 11 && (
            <div className="page-content">
              <ShopCategoriesTab />
            </div>
          )}
          {tab === 9 && (
            <div className="page-content">
              <ShopOrdersTab />
            </div>
          )}
          {tab === 10 && (
            <div className="page-content">
              <PaymentMethodsTab />
            </div>
          )}
          {tab === 'reports' && <ReportsTab />}
          {tab === 'ads' && <AdsTab />}
          {tab === 5 && (
            <div className="page-content">
              <div className="glass-card card">
                <h2>Списание бонусов (скидка в магазине)</h2>
                <p className="hint">Списание бонусов с кошелька клиента при покупке в магазине.</p>
                <form className="settings-form" onSubmit={spendBonus}>
                  <label>
                    Телефон клиента
                    <input
                      placeholder="+992…"
                      value={spendForm.phone}
                      onChange={(e) => setSpendForm({ ...spendForm, phone: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    Сумма бонусов
                    <input
                      type="number"
                      placeholder="0"
                      value={spendForm.amount}
                      onChange={(e) => setSpendForm({ ...spendForm, amount: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    Комментарий
                    <input
                      placeholder="Необязательно"
                      value={spendForm.comment}
                      onChange={(e) => setSpendForm({ ...spendForm, comment: e.target.value })}
                    />
                  </label>
                  <button className="btn btn--primary" type="submit">
                    Списать
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          className="fab"
          title="Генерация QR"
          onClick={() => navigate(1)}
          aria-label="QR / Кроссовки"
        >
          <Icon name="add" />
        </button>
      </main>
    </div>
  );
}
