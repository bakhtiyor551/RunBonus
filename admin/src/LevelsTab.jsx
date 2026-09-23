import { useCallback, useEffect, useState } from 'react';
import { adminApi } from './api';

const emptyLevel = {
  level: '',
  name: '',
  description: '',
  minDistance: '',
  maxDistance: '',
  icon: '',
  color: '#C3F400',
  sortOrder: '0',
  active: true,
};

export default function LevelsTab() {
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setLevels(await adminApi('/api/admin/levels'));
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
    setForm({ ...emptyLevel });
  };

  const openEdit = (lv) => {
    setEditingId(lv.id);
    setForm({
      level: String(lv.level),
      name: lv.name || '',
      description: lv.description || '',
      minDistance: String(lv.minDistance ?? ''),
      maxDistance: lv.maxDistance == null ? '' : String(lv.maxDistance),
      icon: lv.icon || '',
      color: lv.color || '#C3F400',
      sortOrder: String(lv.sortOrder ?? 0),
      active: lv.active !== false,
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      level_number: Number(form.level),
      name: form.name.trim(),
      description: form.description.trim() || null,
      min_distance: Number(form.minDistance) || 0,
      max_distance: form.maxDistance === '' ? null : Number(form.maxDistance),
      icon: form.icon.trim() || null,
      color: form.color.trim() || null,
      sort_order: Number(form.sortOrder) || 0,
      active: form.active,
    };
    try {
      if (editingId === 'new') {
        await adminApi('/api/admin/levels', { method: 'POST', body: JSON.stringify(body) });
      } else {
        await adminApi(`/api/admin/levels/${editingId}`, {
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

  const toggleActive = async (lv) => {
    try {
      await adminApi(`/api/admin/levels/${lv.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !lv.active }),
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
          <h2>Уровни RunBonus</h2>
          <p className="hint">Уровни по суммарному километражу. Не путать с наградами (подарками).</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={openNew}>
          + Уровень
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading ? <p className="hint">Загрузка…</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Lvl</th>
              <th>Название</th>
              <th>Км</th>
              <th>Иконка</th>
              <th>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {levels.map((lv) => (
              <tr key={lv.id}>
                <td>{lv.level}</td>
                <td>
                  <strong style={{ color: lv.color || 'inherit' }}>{lv.name}</strong>
                </td>
                <td>
                  {lv.minDistance}
                  {lv.maxDistance == null ? '+' : `–${lv.maxDistance}`}
                </td>
                <td>{lv.icon || '—'}</td>
                <td>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => toggleActive(lv)}>
                    {lv.active ? 'Активен' : 'Выкл'}
                  </button>
                </td>
                <td>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(lv)}>
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
          <h3>{editingId === 'new' ? 'Новый уровень' : 'Редактирование'}</h3>
          <div className="form-grid">
            <label>
              Номер
              <input
                required
                type="number"
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })}
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
              Min км
              <input
                required
                type="number"
                step="0.001"
                value={form.minDistance}
                onChange={(e) => setForm({ ...form, minDistance: e.target.value })}
              />
            </label>
            <label>
              Max км (пусто = ∞)
              <input
                type="number"
                step="0.001"
                value={form.maxDistance}
                onChange={(e) => setForm({ ...form, maxDistance: e.target.value })}
              />
            </label>
            <label>
              Иконка
              <input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
            </label>
            <label>
              Цвет
              <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
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
              Активен
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
