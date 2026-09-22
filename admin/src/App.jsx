import { useState, useEffect, useCallback } from 'react';
import { adminApi } from './api';
import WorkoutsTab from './WorkoutsTab';
import CustomerLevelsTab from './CustomerLevelsTab';
import QrShoesTab from './QrShoesTab';
import DashboardTab from './DashboardTab';
import ClientsTab from './ClientsTab';
import ShopProductsTab from './ShopProductsTab';
import ShopOrdersTab from './ShopOrdersTab';
import PaymentMethodsTab from './PaymentMethodsTab';
import WarehouseTab from './WarehouseTab';
import ReportsTab from './reports/ReportsTab';
import AdsTab from './ads/AdsTab';
import RewardsTab from './rewards/RewardsTab';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Icon from './components/Icon';
import LoginPage from './LoginPage';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('adminToken'));
  const [adminLogin, setAdminLogin] = useState(localStorage.getItem('adminLogin') || '');
  const [tab, setTab] = useState('dashboard');
  const [fundBalance, setFundBalance] = useState(null);
  const [fundCurrency, setFundCurrency] = useState('TJS');

  const loadFundBalance = useCallback(async () => {
    try {
      const fund = await adminApi('/api/admin/bonus-fund');
      setFundBalance(fund?.balance ?? null);
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
          {tab === 7 && (
            <div className="page-content">
              <CustomerLevelsTab />
            </div>
          )}
          {tab === 8 && (
            <div className="page-content">
              <ShopProductsTab />
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
          {tab === 12 && (
            <div className="page-content">
              <WarehouseTab />
            </div>
          )}
          {tab === 11 && <ReportsTab />}
          {tab === 'ads' && <AdsTab />}
          {tab === 'rewards' && <RewardsTab />}
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
