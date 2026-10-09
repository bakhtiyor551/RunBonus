import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api';
import ChallengeLevelCard from './ChallengeLevelCard';
import ChallengeClaimsPanel from './ChallengeClaimsPanel';
import {
  emptyLevel,
  formatKm,
  isOpenClaim,
  sortLevels,
  TYPE_LABELS,
} from './challengeUtils';

const STAT_ITEMS = [
  { key: 'levels', label: 'Уровней', icon: 'stairs' },
  { key: 'active', label: 'Активных', icon: 'bolt' },
  { key: 'claims', label: 'Заявки в работе', icon: 'inbox', accent: true },
  { key: 'catalog', label: 'В каталоге', icon: 'redeem' },
];

export default function ChallengesTab() {
  const [section, setSection] = useState('levels');
  const [levels, setLevels] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [claims, setClaims] = useState([]);
  const [form, setForm] = useState(emptyLevel);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rewardQuery, setRewardQuery] = useState('');
  const [formCollapsed, setFormCollapsed] = useState(false);

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

  const sortedLevels = useMemo(() => sortLevels(levels), [levels]);

  const openClaims = useMemo(
    () => claims.filter((c) => isOpenClaim(c.status)).length,
    [claims]
  );

  const statValues = useMemo(
    () => ({
      levels: levels.length,
      active: levels.filter((l) => l.status === 'active').length,
      claims: openClaims,
      catalog: catalog.length,
    }),
    [levels, openClaims, catalog.length]
  );

  const selectedRewards = useMemo(
    () => catalog.filter((r) => form.reward_ids.includes(r.id)),
    [catalog, form.reward_ids]
  );

  const filteredCatalog = useMemo(() => {
    const q = rewardQuery.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((r) => {
      const hay = `${r.name || ''} ${r.type || ''} ${r.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [catalog, rewardQuery]);

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
    setFormCollapsed(false);
    setSection('levels');
    document.querySelector('.challenges-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const startNewLevel = () => {
    setForm(emptyLevel);
    setFormCollapsed(false);
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
    <div className="page-content challenges-page">
      <div className="challenges-hero glass-card">
        <div className="challenges-hero__text">
          <p className="challenges-hero__eyebrow">Челленджи RunBonus</p>
          <p className="challenges-hero__lead muted">
            Настройте лестницу уровней с дедлайнами и наградами из каталога. Клиенты проходят
            задания последовательно в приложении.
          </p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={load} disabled={loading}>
          <span className="material-symbols-outlined" aria-hidden>
            refresh
          </span>
          {loading ? 'Обновление…' : 'Обновить'}
        </button>
      </div>

      <div className="challenges-stats">
        {STAT_ITEMS.map((item) => (
          <div key={item.key} className="challenges-stat glass-card">
            <span className="challenges-stat__icon material-symbols-outlined" aria-hidden>
              {item.icon}
            </span>
            <span className="challenges-stat__label">{item.label}</span>
            <strong
              className={`challenges-stat__value${
                item.accent ? ' challenges-stat__value--accent' : ''
              }`}
            >
              {loading ? '…' : statValues[item.key]}
            </strong>
          </div>
        ))}
      </div>

      <nav className="reports-subnav challenges-page__nav" aria-label="Разделы заданий">
        <button
          type="button"
          className={`chip chip--pill${section === 'levels' ? ' chip--accent' : ''}`}
          onClick={() => setSection('levels')}
        >
          <span className="material-symbols-outlined challenges-page__nav-icon" aria-hidden>
            flag
          </span>
          Уровни
        </button>
        <button
          type="button"
          className={`chip chip--pill${section === 'claims' ? ' chip--accent' : ''}`}
          onClick={() => setSection('claims')}
        >
          <span className="material-symbols-outlined challenges-page__nav-icon" aria-hidden>
            inventory
          </span>
          Заявки на награды
          {openClaims > 0 ? <span className="challenges-nav-badge">{openClaims}</span> : null}
        </button>
      </nav>

      {error && <p className="form-error">{error}</p>}

      {section === 'levels' && (
        <div className="challenges-layout">
          <form
            className={`glass-card challenges-form${formCollapsed ? ' challenges-form--collapsed' : ''}`}
            onSubmit={save}
          >
            <button
              type="button"
              className="challenges-form__collapse"
              onClick={() => setFormCollapsed((v) => !v)}
              aria-expanded={!formCollapsed}
            >
              <div className="challenges-form__title">
                <div>
                  <h2>{form.id ? `Редактировать L${form.level_num || '?'}` : 'Новый уровень'}</h2>
                  <p className="muted">
                    {form.id
                      ? `${form.name || 'Без названия'} · ${formatKm(form.target_km || 0)} км`
                      : 'Создайте следующий шаг челленджа'}
                  </p>
                </div>
                {form.id ? (
                  <span className="chip chip--accent">#{form.id}</span>
                ) : (
                  <span className="chip">NEW</span>
                )}
              </div>
              <span className="material-symbols-outlined" aria-hidden>
                {formCollapsed ? 'expand_more' : 'expand_less'}
              </span>
            </button>

            {!formCollapsed && (
              <>
                <div className="challenges-form__section">
                  <h3 className="challenges-form__section-title">Параметры</h3>
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
                </div>

                <div className="challenges-form__section">
                  <h3 className="challenges-form__section-title">Тексты для клиента</h3>
                  <div className="challenges-form__grid">
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
                  </div>
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
                  <label className="challenges-rewards__search">
                    <span className="material-symbols-outlined" aria-hidden>
                      search
                    </span>
                    <input
                      type="search"
                      value={rewardQuery}
                      onChange={(e) => setRewardQuery(e.target.value)}
                      placeholder="Поиск в каталоге…"
                    />
                  </label>
                  <div className="challenges-rewards__list">
                    {filteredCatalog.map((r) => {
                      const on = form.reward_ids.includes(r.id);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          className={`challenges-reward-card${on ? ' is-on' : ''}`}
                          onClick={() => toggleReward(r.id)}
                          aria-pressed={on}
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
                    {catalog.length > 0 && !filteredCatalog.length && (
                      <p className="muted">Ничего не найдено по запросу</p>
                    )}
                  </div>
                </div>

                <div className="challenges-form__actions">
                  <button type="submit" className="btn btn--primary" disabled={saving}>
                    {saving ? 'Сохранение…' : form.id ? 'Сохранить изменения' : 'Создать уровень'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      setForm(emptyLevel);
                      setRewardQuery('');
                    }}
                  >
                    Сброс
                  </button>
                </div>
              </>
            )}
          </form>

          <div className="challenges-list">
            <div className="challenges-list__head">
              <div>
                <h2>Лестница уровней</h2>
                <p className="muted">Как клиенты видят последовательность в приложении</p>
              </div>
              <button type="button" className="btn btn--primary btn--sm" onClick={startNewLevel}>
                <span className="material-symbols-outlined" aria-hidden>
                  add
                </span>
                Новый уровень
              </button>
            </div>

            {loading && (
              <div className="challenges-ladder challenges-ladder--loading">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="challenges-skeleton glass-card" />
                ))}
              </div>
            )}

            {!loading && !sortedLevels.length && (
              <div className="glass-card challenges-empty">
                <span className="material-symbols-outlined challenges-empty__icon" aria-hidden>
                  flag
                </span>
                <p>Пока нет уровней — создайте первый в форме слева</p>
              </div>
            )}

            {!loading && sortedLevels.length > 0 && (
              <div className="challenges-ladder">
                {sortedLevels.map((l, index) => (
                  <div key={l.id} className="challenges-ladder__item">
                    {index < sortedLevels.length - 1 ? (
                      <span className="challenges-ladder__connector" aria-hidden />
                    ) : null}
                    <ChallengeLevelCard
                      level={l}
                      isEditing={form.id === l.id}
                      onEdit={edit}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {section === 'claims' && (
        <ChallengeClaimsPanel claims={claims} onStatusChange={setClaimStatus} />
      )}
    </div>
  );
}
