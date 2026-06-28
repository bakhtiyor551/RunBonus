import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api';

function StatCard({ label, value }) {
  return (
    <div className="glass-card card stat-card">
      <span className="hint">{label}</span>
      <strong className="stat-card__value">{value}</strong>
    </div>
  );
}

export default function NutritionTab() {
  const [stats, setStats] = useState(null);
  const [foods, setFoods] = useState([]);
  const [q, setQ] = useState('');
  const [premiumForm, setPremiumForm] = useState({ phone: '', days: 30 });
  const [foodForm, setFoodForm] = useState({
    name: '',
    country: 'TJ',
    serving_grams: 100,
    calories_per_100g: 0,
    protein_per_100g: 0,
    fat_per_100g: 0,
    carbs_per_100g: 0,
    search_keywords: '',
  });
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([
        adminApi('/api/admin/nutrition/stats'),
        adminApi(`/api/admin/nutrition/foods${q ? `?q=${encodeURIComponent(q)}` : ''}`),
      ]);
      setStats(s);
      setFoods(f.foods || []);
    } catch (e) {
      setMessage(e.message || 'Ошибка загрузки');
    }
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  const grantPremium = async (e) => {
    e.preventDefault();
    try {
      const res = await adminApi('/api/admin/nutrition/premium/grant', {
        method: 'POST',
        body: JSON.stringify(premiumForm),
      });
      setMessage(`RunBonus+ активирован до ${res.expires_at || 'бессрочно'}`);
      load();
    } catch (err) {
      setMessage(err.message || 'Ошибка');
    }
  };

  const saveFood = async (e) => {
    e.preventDefault();
    try {
      await adminApi('/api/admin/nutrition/foods', {
        method: 'POST',
        body: JSON.stringify(foodForm),
      });
      setMessage(`Продукт «${foodForm.name}» сохранён`);
      setFoodForm({
        name: '',
        country: 'TJ',
        serving_grams: 100,
        calories_per_100g: 0,
        protein_per_100g: 0,
        fat_per_100g: 0,
        carbs_per_100g: 0,
        search_keywords: '',
      });
      load();
    } catch (err) {
      setMessage(err.message || 'Ошибка');
    }
  };

  return (
    <div className="page-content">
      <h2>Питание RunBonus+</h2>
      {message && <p className="hint">{message}</p>}

      {stats && (
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <StatCard label="Активных пользователей (30 дн.)" value={stats.active_users_30d} />
          <StatCard label="Записей питания" value={stats.total_logs} />
          <StatCard label="AI-анализов" value={stats.ai_analyses} />
          <StatCard label="Premium-пользователей" value={stats.premium_users} />
          <StatCard label="Продуктов в базе" value={stats.foods_count} />
        </div>
      )}

      <div className="glass-card card" style={{ marginBottom: 24 }}>
        <h3>Выдать RunBonus+</h3>
        <form className="settings-form" onSubmit={grantPremium}>
          <label>
            Телефон клиента
            <input
              placeholder="+992…"
              value={premiumForm.phone}
              onChange={(e) => setPremiumForm({ ...premiumForm, phone: e.target.value })}
              required
            />
          </label>
          <label>
            Дней подписки
            <input
              type="number"
              value={premiumForm.days}
              onChange={(e) => setPremiumForm({ ...premiumForm, days: e.target.value })}
            />
          </label>
          <button type="submit" className="btn btn--primary">Активировать</button>
        </form>
      </div>

      <div className="glass-card card" style={{ marginBottom: 24 }}>
        <h3>Добавить продукт</h3>
        <form className="settings-form" onSubmit={saveFood}>
          <label>
            Название
            <input value={foodForm.name} onChange={(e) => setFoodForm({ ...foodForm, name: e.target.value })} required />
          </label>
          <label>
            Страна (TJ/RU/UZ)
            <input value={foodForm.country} onChange={(e) => setFoodForm({ ...foodForm, country: e.target.value })} />
          </label>
          <label>
            Порция (г)
            <input type="number" value={foodForm.serving_grams} onChange={(e) => setFoodForm({ ...foodForm, serving_grams: e.target.value })} />
          </label>
          <label>
            Ккал / 100 г
            <input type="number" value={foodForm.calories_per_100g} onChange={(e) => setFoodForm({ ...foodForm, calories_per_100g: e.target.value })} required />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label>
              Белки
              <input type="number" step="0.1" value={foodForm.protein_per_100g} onChange={(e) => setFoodForm({ ...foodForm, protein_per_100g: e.target.value })} />
            </label>
            <label>
              Жиры
              <input type="number" step="0.1" value={foodForm.fat_per_100g} onChange={(e) => setFoodForm({ ...foodForm, fat_per_100g: e.target.value })} />
            </label>
            <label>
              Углеводы
              <input type="number" step="0.1" value={foodForm.carbs_per_100g} onChange={(e) => setFoodForm({ ...foodForm, carbs_per_100g: e.target.value })} />
            </label>
          </div>
          <label>
            Ключевые слова
            <input value={foodForm.search_keywords} onChange={(e) => setFoodForm({ ...foodForm, search_keywords: e.target.value })} />
          </label>
          <button type="submit" className="btn btn--primary">Сохранить</button>
        </form>
      </div>

      <div className="glass-card card">
        <h3>База продуктов</h3>
        <input
          placeholder="Поиск…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ marginBottom: 12, width: '100%' }}
        />
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Название</th>
                <th>Страна</th>
                <th>Ккал/100г</th>
                <th>Б/Ж/У</th>
              </tr>
            </thead>
            <tbody>
              {foods.map((f) => (
                <tr key={f.id}>
                  <td>{f.id}</td>
                  <td>{f.name}</td>
                  <td>{f.country || '—'}</td>
                  <td>{f.calories_per_100g}</td>
                  <td>{f.protein_per_100g}/{f.fat_per_100g}/{f.carbs_per_100g}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
