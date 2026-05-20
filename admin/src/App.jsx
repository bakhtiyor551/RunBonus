import { useState, useEffect, useCallback } from 'react';
import { adminApi } from './api';
import AccountsTab from './AccountsTab';
import WorkoutsTab from './WorkoutsTab';
import BonusSettingsTab from './BonusSettingsTab';
import QrShoesTab from './QrShoesTab';
import WithdrawalsTab from './WithdrawalsTab';
import DashboardTab from './DashboardTab';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Icon from './components/Icon';
import LoginPage from './LoginPage';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('adminToken'));
  const [adminLogin, setAdminLogin] = useState(localStorage.getItem('adminLogin') || '');
  const [tab, setTab] = useState('dashboard');
  const [users, setUsers] = useState([]);
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

  const navigate = async (index) => {
    setTab(index);
    if (index === 0) setUsers(await adminApi('/api/admin/users'));
    if (index === 'dashboard') loadFundBalance();
  };

  const blockUser = async (id, blocked) => {
    await adminApi('/api/admin/users/block', {
      method: 'POST',
      body: JSON.stringify({ user_id: id, blocked }),
    });
    navigate(0);
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
              <div className="glass-card card">
                <h2>Клиенты</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Имя</th>
                      <th>Телефон</th>
                      <th>ID</th>
                      <th>Баланс</th>
                      <th>Статус</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td>{u.phone}</td>
                        <td>{u.activated_shoe_id || '—'}</td>
                        <td>{u.balance}</td>
                        <td>{u.status}</td>
                        <td>
                          <button type="button" onClick={() => blockUser(u.id, u.status !== 'blocked')}>
                            {u.status === 'blocked' ? 'Разблокировать' : 'Заблокировать'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
          {tab === 6 && (
            <div className="page-content">
              <WithdrawalsTab />
            </div>
          )}
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
