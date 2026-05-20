import { useEffect, useState } from 'react';
import { adminApi } from './api';

const EMPTY = {
  price_per_km: 3,
  daily_limit: 10,
  total_limit_per_shoe: 200,
  min_distance_km: 0.5,
  min_duration_minutes: 5,
  max_speed_kmh: 18,
};

export default function BonusSettingsTab() {
  const [form, setForm] = useState(EMPTY);
  const [log, setLog] = useState([]);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setError('');
    const data = await adminApi('/api/admin/bonus-settings');
    setForm({ ...EMPTY, ...data.settings });
    setLog(data.log || []);
    setCanEdit(data.can_edit);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError('');
    try {
      const data = await adminApi('/api/admin/bonus-settings', {
        method: 'PUT',
        body: JSON.stringify({
          price_per_km: Number(form.price_per_km),
          daily_limit: Number(form.daily_limit),
          total_limit_per_shoe: Number(form.total_limit_per_shoe),
          min_distance_km: Number(form.min_distance_km),
          min_duration_minutes: Number(form.min_duration_minutes),
          max_speed_kmh: Number(form.max_speed_kmh),
        }),
      });
      setForm({ ...EMPTY, ...data.settings });
      setLog(data.log || []);
      alert(data.message || 'Сохранено');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card card">
      <h2>Настройки бонусов</h2>
      <p className="hint">
        Бонус = расстояние × цена за 1 км. Новая цена применяется только к новым тренировкам.
        Старые тренировки не пересчитываются.
      </p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {!canEdit && (
        <p className="hint">Режим просмотра. Изменять может только Super Admin.</p>
      )}

      <form className="settings-form" onSubmit={save}>
        <label>
          Цена за 1 км (сомони)
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.price_per_km}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, price_per_km: e.target.value })}
            required
          />
        </label>
        <label>
          Дневной лимит (сомони)
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.daily_limit}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, daily_limit: e.target.value })}
            required
          />
        </label>
        <label>
          Общий лимит по кроссовкам (сомони)
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.total_limit_per_shoe}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, total_limit_per_shoe: e.target.value })}
            required
          />
        </label>
        <label>
          Минимальная дистанция (км)
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.min_distance_km}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, min_distance_km: e.target.value })}
            required
          />
        </label>
        <label>
          Минимальное время (минут)
          <input
            type="number"
            step="1"
            min="1"
            value={form.min_duration_minutes}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, min_duration_minutes: e.target.value })}
            required
          />
        </label>
        <label>
          Максимальная скорость (км/ч)
          <input
            type="number"
            step="0.1"
            min="1"
            value={form.max_speed_kmh}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, max_speed_kmh: e.target.value })}
            required
          />
        </label>
        {canEdit && (
          <button className="primary" type="submit" disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить настройки'}
          </button>
        )}
      </form>

      <h3>Журнал изменений</h3>
      <table>
        <thead>
          <tr><th>Дата</th><th>Админ</th><th>Изменение</th></tr>
        </thead>
        <tbody>
          {log.length === 0 && (
            <tr><td colSpan={3}>Пока нет записей</td></tr>
          )}
          {log.map((row) => (
            <tr key={row.id}>
              <td>{new Date(row.created_at).toLocaleString('ru')}</td>
              <td>{row.admin_login}</td>
              <td>{row.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
