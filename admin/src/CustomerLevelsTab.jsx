import { useEffect, useState } from 'react';
import { adminApi } from './api';

const EMPTY = {
  name: '',
  code: '',
  from_km: 0,
  to_km: 50,
  price_per_km: 2.5,
  color: '#CD7F32',
  icon: 'military_tech',
  status: 'active',
  description: '',
};

export default function CustomerLevelsTab() {
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    adminApi('/api/admin/customer-levels')
      .then(setLevels)
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing('new');
    setForm({ ...EMPTY });
  };

  const openEdit = (row) => {
    setEditing(row.id);
    setForm({
      name: row.name,
      code: row.code,
      from_km: row.from_km,
      to_km: row.to_km,
      price_per_km: row.price_per_km,
      color: row.color || '',
      icon: row.icon || '',
      status: row.status,
      description: row.description || '',
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing === 'new') {
        await adminApi('/api/admin/customer-levels', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      } else {
        await adminApi(`/api/admin/customer-levels/${editing}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      }
      setEditing(null);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row) => {
    const next = row.status === 'active' ? 'inactive' : 'active';
    try {
      await adminApi(`/api/admin/customer-levels/${row.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="page-content">
      <div className="glass-card card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2>Уровни клиентов</h2>
            <p className="hint">
              Новая цена применяется только к новым тренировкам. Прогресс считается по активной паре кроссовок.
            </p>
          </div>
          <button type="button" className="btn btn--primary" onClick={openCreate}>
            + Уровень
          </button>
        </div>

        {loading ? (
          <p>Загрузка…</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Км от–до</th>
                <th>Цена/км</th>
                <th>Цвет</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => (
                <tr key={l.id}>
                  <td>
                    <strong>{l.name}</strong>
                    <div className="hint">{l.code}</div>
                  </td>
                  <td>
                    {Number(l.from_km)} – {Number(l.to_km)} км
                  </td>
                  <td>{Number(l.price_per_km).toFixed(2)} сомони</td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        background: l.color || '#888',
                        verticalAlign: 'middle',
                      }}
                    />
                  </td>
                  <td>
                    <span className={`chip ${l.status === 'active' ? 'entity-card__status--ok' : ''}`}>
                      {l.status === 'active' ? 'Активен' : 'Выкл'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(l)}>
                      Изменить
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => toggleStatus(l)}>
                      {l.status === 'active' ? 'Выключить' : 'Включить'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <div className="glass-card card" style={{ marginTop: 24 }}>
          <h3>{editing === 'new' ? 'Новый уровень' : 'Редактирование уровня'}</h3>
          <form className="settings-form" onSubmit={save}>
            <label>
              Название
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              Код
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </label>
            <label>
              От (км)
              <input
                type="number"
                step="0.01"
                value={form.from_km}
                onChange={(e) => setForm({ ...form, from_km: e.target.value })}
              />
            </label>
            <label>
              До (км)
              <input
                type="number"
                step="0.01"
                value={form.to_km}
                onChange={(e) => setForm({ ...form, to_km: e.target.value })}
              />
            </label>
            <label>
              Цена за 1 км
              <input
                type="number"
                step="0.01"
                value={form.price_per_km}
                onChange={(e) => setForm({ ...form, price_per_km: e.target.value })}
              />
            </label>
            <label>
              Цвет
              <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </label>
            <label>
              Иконка (Material)
              <input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
            </label>
            <label>
              Описание
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label>
              Статус
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
