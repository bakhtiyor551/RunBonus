import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api';

const emptyLevel = {
  id: null,
  level_num: '',
  name: '',
  target_km: '',
  deadline_days: '',
  description: '',
  example_reward: '',
  sort_order: '10',
  status: 'active',
  reward_ids: [],
};

export default function ChallengesTab() {
  const [section, setSection] = useState('levels');
  const [levels, setLevels] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [claims, setClaims] = useState([]);
  const [form, setForm] = useState(emptyLevel);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [lv, rewards, cl] = await Promise.all([
        adminApi('/api/admin/challenges/levels'),
        adminApi('/api/admin/rewards/catalog').catch(() => []),
        adminApi('/api/admin/challenges/claims').catch(() => []),
      ]);
      setLevels(Array.isArray(lv) ? lv : []);
      setCatalog(Array.isArray(rewards) ? rewards : rewards?.items || []);
      setClaims(Array.isArray(cl) ? cl : []);
    } catch (err) {
      setError(err.message || 'Ошибка загрузки');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const edit = (level) => {
    setForm({
      id: level.id,
      level_num: String(level.level_num),
      name: level.name || '',
      target_km: String(level.target_km),
      deadline_days: String(level.deadline_days),
      description: level.description || '',
      example_reward: level.example_reward || '',
      sort_order: String(level.sort_order ?? 10),
      status: level.status || 'active',
      reward_ids: level.reward_ids || [],
    });
    setSection('levels');
  };

  const toggleReward = (id) => {
    setForm((f) => {
      const has = f.reward_ids.includes(id);
      return {
        ...f,
        reward_ids: has ? f.reward_ids.filter((x) => x !== id) : [...f.reward_ids, id],
      };
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        id: form.id,
        level_num: Number(form.level_num),
        name: form.name,
        target_km: Number(form.target_km),
        deadline_days: Number(form.deadline_days),
        description: form.description,
        example_reward: form.example_reward,
        sort_order: Number(form.sort_order) || 0,
        status: form.status,
        reward_ids: form.reward_ids,
      };
      const next = form.id
        ? await adminApi(`/api/admin/challenges/levels/${form.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await adminApi('/api/admin/challenges/levels', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      setLevels(Array.isArray(next) ? next : []);
      setForm(emptyLevel);
    } catch (err) {
      setError(err.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const setClaimStatus = async (id, status) => {
    try {
      const next = await adminApi(`/api/admin/challenges/claims/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setClaims(Array.isArray(next) ? next : []);
    } catch (err) {
      setError(err.message || 'Ошибка статуса');
    }
  };

  return (
    <div className="page-content">
      <div className="page-head">
        <h1>Задания (Challenges)</h1>
        <p className="muted">Последовательные задания с таймером и наградами</p>
      </div>

      <div className="btn-row" style={{ marginBottom: 16, gap: 8 }}>
        <button
          type="button"
          className={`btn ${section === 'levels' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => setSection('levels')}
        >
          Уровни
        </button>
        <button
          type="button"
          className={`btn ${section === 'claims' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => setSection('claims')}
        >
          Заявки на награды
        </button>
        <button type="button" className="btn btn--ghost" onClick={load}>
          Обновить
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {section === 'levels' && (
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <form className="card" onSubmit={save} style={{ padding: 16 }}>
            <h2>{form.id ? `Редактировать #${form.id}` : 'Новый уровень'}</h2>
            <label>
              Номер уровня
              <input
                value={form.level_num}
                onChange={(e) => setForm({ ...form, level_num: e.target.value })}
                required
              />
            </label>
            <label>
              Название
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label>
              Цель (км)
              <input
                type="number"
                step="0.01"
                value={form.target_km}
                onChange={(e) => setForm({ ...form, target_km: e.target.value })}
                required
              />
            </label>
            <label>
              Срок (дней)
              <input
                type="number"
                value={form.deadline_days}
                onChange={(e) => setForm({ ...form, deadline_days: e.target.value })}
                required
              />
            </label>
            <label>
              Пример награды
              <input
                value={form.example_reward}
                onChange={(e) => setForm({ ...form, example_reward: e.target.value })}
              />
            </label>
            <label>
              Описание
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </label>
            <label>
              Порядок
              <input
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
            </label>
            <label>
              Статус
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>

            <fieldset style={{ marginTop: 12 }}>
              <legend>Награды уровня (каталог)</legend>
              <div style={{ maxHeight: 180, overflow: 'auto' }}>
                {catalog.map((r) => (
                  <label key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={form.reward_ids.includes(r.id)}
                      onChange={() => toggleReward(r.id)}
                    />
                    <span>
                      #{r.id} {r.name} ({r.type})
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="btn-row" style={{ marginTop: 16, gap: 8 }}>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setForm(emptyLevel)}>
                Сброс
              </button>
            </div>
          </form>

          <div className="card" style={{ padding: 16 }}>
            <h2>Уровни</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Название</th>
                  <th>Км</th>
                  <th>Дни</th>
                  <th>Награды</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {levels.map((l) => (
                  <tr key={l.id}>
                    <td>{l.level_num}</td>
                    <td>
                      {l.name}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {l.status}
                      </div>
                    </td>
                    <td>{l.target_km}</td>
                    <td>{l.deadline_days}</td>
                    <td>{(l.rewards || []).map((r) => r.name).join(', ') || '—'}</td>
                    <td>
                      <button type="button" className="btn btn--sm" onClick={() => edit(l)}>
                        Изменить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === 'claims' && (
        <div className="card" style={{ padding: 16 }}>
          <h2>Заявки</h2>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Клиент</th>
                <th>Уровень</th>
                <th>Награда</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>
                    {c.first_name || c.user_name || '—'}
                    <div className="muted">{c.user_phone}</div>
                  </td>
                  <td>
                    L{c.level_num} {c.level_name}
                  </td>
                  <td>
                    {c.reward_name}
                    {c.size ? ` · ${c.size}` : ''}
                    {c.promo_code ? ` · ${c.promo_code}` : ''}
                  </td>
                  <td>{c.status}</td>
                  <td>
                    <select
                      value={c.status}
                      onChange={(e) => setClaimStatus(c.id, e.target.value)}
                    >
                      {['CLAIMED', 'PROCESSING', 'READY', 'DELIVERED', 'CANCELLED'].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
