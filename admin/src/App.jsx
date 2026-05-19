import { useState } from 'react';
import { adminApi } from './api';
import AccountsTab from './AccountsTab';
import WorkoutDetail from './WorkoutDetail';
import BonusSettingsTab from './BonusSettingsTab';

const TABS = ['Клиенты', 'QR / Кроссовки', 'Тренировки', 'Бонусные счета', 'Настройки бонусов', 'Списание бонусов'];

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('adminToken'));
  const [tab, setTab] = useState(0);
  const [loginForm, setLoginForm] = useState({ login: 'admin', password: 'admin123' });
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [shoes, setShoes] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [workoutDetailId, setWorkoutDetailId] = useState(null);
  const [genForm, setGenForm] = useState({ model_name: 'Runner Pro', quantity: 5 });
  const [spendForm, setSpendForm] = useState({ phone: '', amount: '', comment: '' });

  const login = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await adminApi('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify(loginForm),
      });
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminRole', data.admin.role);
      setToken(data.token);
    } catch (err) {
      setError(err.message);
    }
  };

  const load = async (index) => {
    setTab(index);
    if (index === 0) setUsers(await adminApi('/api/admin/users'));
    if (index === 1) setShoes(await adminApi('/api/admin/shoes'));
    if (index === 2) setWorkouts(await adminApi('/api/admin/workouts'));
  };

  const generateShoes = async (e) => {
    e.preventDefault();
    const data = await adminApi('/api/admin/shoes/generate', {
      method: 'POST',
      body: JSON.stringify(genForm),
    });
    alert(`Создано ${data.count} кодов`);
    load(1);
  };

  const blockUser = async (id, blocked) => {
    await adminApi('/api/admin/users/block', {
      method: 'POST',
      body: JSON.stringify({ user_id: id, blocked }),
    });
    load(0);
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
  };

  if (!token) {
    return (
      <div className="login-wrap card">
        <h1>Админ-панель RunBonus</h1>
        <form onSubmit={login}>
          <p><input placeholder="Логин" value={loginForm.login} onChange={(e) => setLoginForm({ ...loginForm, login: e.target.value })} /></p>
          <p><input type="password" placeholder="Пароль" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} /></p>
          {error && <p style={{ color: 'crimson' }}>{error}</p>}
          <button className="primary" type="submit">Войти</button>
        </form>
      </div>
    );
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>RunBonus</h2>
        {TABS.map((t, i) => (
          <button key={t} className={tab === i ? 'active' : ''} onClick={() => load(i)}>{t}</button>
        ))}
        <button onClick={() => { localStorage.removeItem('adminToken'); localStorage.removeItem('adminRole'); setToken(null); }}>Выход</button>
      </aside>
      <main className="main">
        {tab === 0 && (
          <div className="card">
            <h2>Клиенты</h2>
            <table>
              <thead><tr><th>Имя</th><th>Телефон</th><th>ID</th><th>Баланс</th><th>Статус</th><th></th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td><td>{u.phone}</td><td>{u.activated_shoe_id || '—'}</td>
                    <td>{u.balance}</td><td>{u.status}</td>
                    <td>
                      <button onClick={() => blockUser(u.id, u.status !== 'blocked')}>
                        {u.status === 'blocked' ? 'Разблокировать' : 'Заблокировать'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 1 && (
          <div className="card">
            <h2>Генерация QR/ID</h2>
            <form onSubmit={generateShoes}>
              <input placeholder="Модель" value={genForm.model_name} onChange={(e) => setGenForm({ ...genForm, model_name: e.target.value })} />
              <input type="number" min={1} max={500} value={genForm.quantity} onChange={(e) => setGenForm({ ...genForm, quantity: Number(e.target.value) })} />
              <button className="primary" type="submit">Сгенерировать</button>
            </form>
            <table>
              <thead><tr><th>ID</th><th>Модель</th><th>Статус</th><th>Клиент</th></tr></thead>
              <tbody>
                {shoes.map((s) => (
                  <tr key={s.id}><td>{s.unique_id}</td><td>{s.model_name}</td><td>{s.status}</td><td>{s.activated_by_phone || '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 2 && (
          <div className="card">
            <h2>Тренировки</h2>
            {workoutDetailId ? (
              <WorkoutDetail workoutId={workoutDetailId} onClose={() => setWorkoutDetailId(null)} />
            ) : (
              <table>
                <thead><tr><th>Клиент</th><th>Дата</th><th>Км</th><th>Время</th><th>Бонус</th><th>Статус</th><th></th></tr></thead>
                <tbody>
                  {workouts.map((w) => (
                    <tr key={w.id}>
                      <td>{w.client_name} ({w.phone})</td>
                      <td>{new Date(w.started_at).toLocaleString('ru')}</td>
                      <td>{w.distance_km}</td>
                      <td>{w.duration_seconds}s</td>
                      <td>{w.bonus}</td>
                      <td>{w.status}{w.reject_reason ? ` — ${w.reject_reason}` : ''}</td>
                      <td><button type="button" onClick={() => setWorkoutDetailId(w.id)}>Детали</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {tab === 3 && <AccountsTab />}
        {tab === 4 && <BonusSettingsTab />}
        {tab === 5 && (
          <div className="card">
            <h2>Списание бонусов (скидка в магазине)</h2>
            <form onSubmit={spendBonus}>
              <input placeholder="Телефон клиента" value={spendForm.phone} onChange={(e) => setSpendForm({ ...spendForm, phone: e.target.value })} required />
              <input type="number" placeholder="Сумма бонусов" value={spendForm.amount} onChange={(e) => setSpendForm({ ...spendForm, amount: e.target.value })} required />
              <input placeholder="Комментарий" value={spendForm.comment} onChange={(e) => setSpendForm({ ...spendForm, comment: e.target.value })} />
              <button className="primary" type="submit">Списать</button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
