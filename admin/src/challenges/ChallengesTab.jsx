import { useCallback, useEffect, useMemo, useState } from 'react';
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

const CLAIM_STATUSES = [
  { id: 'CLAIMED', label: 'Заявка' },
  { id: 'PROCESSING', label: 'В работе' },
  { id: 'READY', label: 'Готово' },
  { id: 'DELIVERED', label: 'Выдано' },
  { id: 'CANCELLED', label: 'Отмена' },
];

const TYPE_LABELS = {
  PRODUCT: 'Товар',
  DISCOUNT: 'Скидка',
  SPECIAL: 'Special',
  VIP: 'VIP',
};

function claimTone(status) {
  if (status === 'DELIVERED') return 'ok';
  if (status === 'CANCELLED') return 'bad';
  if (status === 'READY') return 'ready';
  if (status === 'PROCESSING') return 'busy';
  return 'new';
}

export default function ChallengesTab() {
  const [section, setSection] = useState('levels');
  const [levels, setLevels] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [claims, setClaims] = useState([]);
  const [form, setForm] = useState(emptyLevel);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openClaims = useMemo(
    () => claims.filter((c) => !['DELIVERED', 'CANCELLED'].includes(c.status)).length,
    [claims]
  );

  const selectedRewards = useMemo(
    () => catalog.filter((r) => form.reward_ids.includes(r.id)),
    [catalog, form.reward_ids]
  );

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    <div className="page-content challenges-page">
      <div className="page-head challenges-page__head">
        <div>
          <h1>Задания</h1>
          <p className="muted">Последовательные челленджи с таймером и наградами из каталога</p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={load} disabled={loading}>
          <span className="material-symbols-outlined" aria-hidden>
            refresh
          </span>
          {loading ? 'Обновление…' : 'Обновить'}
        </button>
      </div>

      <div className="challenges-stats">
        <div className="challenges-stat glass-card">
          <span className="challenges-stat__label">Уровней</span>
          <strong className="challenges-stat__value">{levels.length}</strong>
        </div>
        <div className="challenges-stat glass-card">
          <span className="challenges-stat__label">Активных</span>
          <strong className="challenges-stat__value">
            {levels.filter((l) => l.status === 'active').length}
          </strong>
        </div>
        <div className="challenges-stat glass-card">
          <span className="challenges-stat__label">Заявки в работе</span>
          <strong className="challenges-stat__value challenges-stat__value--accent">{openClaims}</strong>
        </div>
        <div className="challenges-stat glass-card">
          <span className="challenges-stat__label">В каталоге</span>
          <strong className="challenges-stat__value">{catalog.length}</strong>
        </div>
      </div>

      <nav className="reports-subnav challenges-page__nav" aria-label="Разделы заданий">
        <button
          type="button"
          className={`chip chip--pill${section === 'levels' ? ' chip--accent' : ''}`}
          onClick={() => setSection('levels')}
        >
          Уровни
        </button>
        <button
          type="button"
          className={`chip chip--pill${section === 'claims' ? ' chip--accent' : ''}`}
          onClick={() => setSection('claims')}
        >
          Заявки на награды
          {openClaims > 0 ? <span className="challenges-nav-badge">{openClaims}</span> : null}
        </button>
      </nav>

      {error && <p className="form-error">{error}</p>}

      {section === 'levels' && (
        <div className="challenges-layout">
          <form className="glass-card challenges-form" onSubmit={save}>
            <div className="challenges-form__title">
              <div>
                <h2>{form.id ? `Редактировать L${form.level_num || ''}` : 'Новый уровень'}</h2>
                <p className="muted">
                  {form.id
                    ? 'Измените параметры и набор наград'
                    : 'Создайте следующий шаг челленджа'}
                </p>
              </div>
              {form.id ? (
                <span className="chip chip--accent">#{form.id}</span>
              ) : (
                <span className="chip">NEW</span>
              )}
            </div>

            <div className="challenges-form__grid">
              <label>
                Номер уровня
                <input
                  value={form.level_num}
                  onChange={(e) => setForm({ ...form, level_num: e.target.value })}
                  required
                  inputMode="numeric"
                />
              </label>
              <label>
                Название
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="Задание 50 км"
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
              <label className="challenges-form__span2">
                Пример награды
                <input
                  value={form.example_reward}
                  onChange={(e) => setForm({ ...form, example_reward: e.target.value })}
                  placeholder="T-Shirt / скидка 30%"
                />
              </label>
              <label className="challenges-form__span2">
                Описание
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="Коротко опишите задание для клиента"
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
                  <option value="active">Активен</option>
                  <option value="inactive">Выключен</option>
                </select>
              </label>
            </div>

            <div className="challenges-rewards">
              <div className="challenges-rewards__head">
                <h3>Награды уровня</h3>
                <span className="muted">
                  выбрано {selectedRewards.length} из {catalog.length}
                </span>
              </div>
              {selectedRewards.length > 0 && (
                <div className="challenges-rewards__selected">
                  {selectedRewards.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="challenges-reward-chip is-on"
                      onClick={() => toggleReward(r.id)}
                      title="Убрать"
                    >
                      {r.name}
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="challenges-rewards__list">
                {catalog.map((r) => {
                  const on = form.reward_ids.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`challenges-reward-card${on ? ' is-on' : ''}`}
                      onClick={() => toggleReward(r.id)}
                    >
                      <span className="challenges-reward-card__check" aria-hidden>
                        {on ? '✓' : ''}
                      </span>
                      <span className="challenges-reward-card__body">
                        <strong>{r.name}</strong>
                        <span className="muted">
                          #{r.id} · {TYPE_LABELS[r.type] || r.type}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {!catalog.length && <p className="muted">Каталог наград пуст</p>}
              </div>
            </div>

            <div className="challenges-form__actions">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Сохранение…' : form.id ? 'Сохранить изменения' : 'Создать уровень'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setForm(emptyLevel)}>
                Сброс
              </button>
            </div>
          </form>

          <div className="challenges-list">
            <div className="challenges-list__head">
              <h2>Уровни</h2>
              <p className="muted">Последовательность для клиентов в приложении</p>
            </div>

            {!levels.length && !loading && (
              <div className="glass-card challenges-empty">Пока нет уровней — создайте первый слева</div>
            )}

            <div className="challenges-level-cards">
              {levels.map((l) => (
                <article key={l.id} className="glass-card challenges-level-card">
                  <div className="challenges-level-card__top">
                    <div className="challenges-level-card__badge">L{l.level_num}</div>
                    <div className="challenges-level-card__meta">
                      <h3>{l.name}</h3>
                      <div className="challenges-level-card__tags">
                        <span className="chip chip--accent">{Number(l.target_km)} км</span>
                        <span className="chip">{l.deadline_days} дн.</span>
                        <span
                          className={`challenges-status challenges-status--${
                            l.status === 'active' ? 'ok' : 'off'
                          }`}
                        >
                          {l.status === 'active' ? 'active' : 'inactive'}
                        </span>
                      </div>
                    </div>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => edit(l)}>
                      Изменить
                    </button>
                  </div>

                  {l.example_reward ? (
                    <p className="challenges-level-card__example">🎁 {l.example_reward}</p>
                  ) : null}

                  <div className="challenges-level-card__rewards">
                    {(l.rewards || []).length ? (
                      (l.rewards || []).map((r) => (
                        <span key={r.id || r.name} className="challenges-reward-chip">
                          {r.name}
                        </span>
                      ))
                    ) : (
                      <span className="muted">Награды не привязаны</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {section === 'claims' && (
        <div className="glass-card challenges-claims">
          <div className="challenges-list__head">
            <h2>Заявки на награды</h2>
            <p className="muted">Обработка выдачи после выполнения задания</p>
          </div>

          {!claims.length ? (
            <div className="challenges-empty">Заявок пока нет</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table challenges-claims-table">
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
                      <td className="mono">#{c.id}</td>
                      <td>
                        <strong>{c.first_name || c.user_name || '—'}</strong>
                        <div className="muted">{c.user_phone}</div>
                      </td>
                      <td>
                        <span className="chip chip--accent">L{c.level_num}</span>
                        <div className="muted" style={{ marginTop: 4 }}>
                          {c.level_name}
                        </div>
                      </td>
                      <td>
                        {c.reward_name}
                        {c.size ? <div className="muted">Размер: {c.size}</div> : null}
                        {c.promo_code ? <div className="muted">Промо: {c.promo_code}</div> : null}
                      </td>
                      <td>
                        <span className={`challenges-status challenges-status--${claimTone(c.status)}`}>
                          {CLAIM_STATUSES.find((s) => s.id === c.status)?.label || c.status}
                        </span>
                      </td>
                      <td>
                        <select
                          className="challenges-claims-select"
                          value={c.status}
                          onChange={(e) => setClaimStatus(c.id, e.target.value)}
                          aria-label="Сменить статус"
                        >
                          {CLAIM_STATUSES.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
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
      )}
    </div>
  );
}
