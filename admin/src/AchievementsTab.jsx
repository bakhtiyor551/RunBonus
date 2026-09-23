import { useCallback, useEffect, useState } from 'react';
import { adminApi } from './api';

const TYPES = ['DISTANCE', 'WORKOUT_COUNT', 'STREAK', 'EVENT', 'SPECIAL'];

const emptyForm = {
  code: '',
  name: '',
  description: '',
  type: 'DISTANCE',
  targetValue: '',
  icon: '',
  image: '',
  sortOrder: '10',
  active: true,
};

export default function AchievementsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await adminApi('/api/admin/achievements'));
    } catch (err) {
      setError(err.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditingId('new');
    setForm({ ...emptyForm });
  };

  const openEdit = (a) => {
    setEditingId(a.id);
    setForm({
      code: a.code || '',
      name: a.name || '',
      description: a.description || '',
      type: a.type || 'DISTANCE',
      targetValue: String(a.targetValue ?? ''),
      icon: a.icon || '',
      image: a.image || '',
      sortOrder: String(a.sortOrder ?? 0),
      active: a.active !== false,
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      type: form.type,
      target_value: Number(form.targetValue) || 0,
      icon: form.icon.trim() || null,
      image: form.image.trim() || null,
      sort_order: Number(form.sortOrder) || 0,
      active: form.active,
    };
    try {
      if (editingId === 'new') {
        await adminApi('/api/admin/achievements', { method: 'POST', body: JSON.stringify(body) });
      } else {
        await adminApi(`/api/admin/achievements/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      }
      setForm(null);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (a) => {
    try {
      await adminApi(`/api/admin/achievements/${a.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !a.active }),
      });
      await load();
    } catch (err) {
      alert(err.message || 'Ошибка');
    }
  };

  return (
    <div className="page-content">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2>Достижения (медали)</h2>
          <p className="hint">Медали за дистанцию, серии и количество тренировок. Отдельно от реальных подарков.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={openNew}>
          + Медаль
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading ? <p className="hint">Загрузка…</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Иконка</th>
              <th>Название</th>
              <th>Тип</th>
              <th>Цель</th>
              <th>Код</th>
              <th>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td style={{ fontSize: 22 }}>{a.icon || '🏅'}</td>
                <td>
                  <strong>{a.name}</strong>
                  {a.description ? <div className="hint">{a.description}</div> : null}
                </td>
                <td>{a.type}</td>
                <td>{a.targetValue}</td>
                <td>
                  <code>{a.code}</code>
                </td>
                <td>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => toggleActive(a)}>
                    {a.active ? 'Активна' : 'Выкл'}
                  </button>
                </td>
                <td>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(a)}>
                    Изменить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <form className="glass-card" style={{ marginTop: 20, padding: 20 }} onSubmit={save}>
          <h3>{editingId === 'new' ? 'Новое достижение' : 'Редактирование'}</h3>
          <div className="form-grid">
            <label>
              Код
              <input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </label>
            <label>
              Название
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Тип
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Целевое значение
              <input
                required
                type="number"
                step="0.001"
                value={form.targetValue}
                onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
              />
            </label>
            <label>
              Иконка
              <input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
            </label>
            <label>
              Image URL
              <input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
            </label>
            <label>
              Sort
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Активна
            </label>
          </div>
          <label>
            Описание
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? '…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setForm(null);
                setEditingId(null);
              }}
            >
              Отмена
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
