import { useState } from 'react';
import { adminApi } from './api';

export default function LoginPage({ onSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const login = username.trim();
    if (!login) {
      setError('Введите логин');
      return;
    }
    if (!password) {
      setError('Введите пароль');
      return;
    }
    setLoading(true);
    try {
      const data = await adminApi('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ login, password }),
      });
      onSuccess(data);
    } catch (err) {
      setError(err.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="glass-card login-card">
        <h1>RunBonus</h1>
        <p className="hint">Админ-панель</p>
        <form className="login-form" onSubmit={submit} autoComplete="on">
          <label className="login-form__label">
            Логин
            <input
              type="text"
              name="username"
              className="login-form__input"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </label>
          <label className="login-form__label">
            Пароль
            <input
              type="password"
              name="password"
              className="login-form__input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="error-text login-form__error">{error}</p>}
          <button className="btn btn--primary login-form__submit" type="submit" disabled={loading}>
            {loading ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
