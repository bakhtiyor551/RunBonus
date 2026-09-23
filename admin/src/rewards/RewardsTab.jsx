import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api';

const SECTIONS = [
  { id: 'stats', label: 'Статистика' },
  { id: 'gift', label: 'Подарить' },
  { id: 'milestones', label: 'Контрольные точки' },
  { id: 'catalog', label: 'Награды' },
  { id: 'stock', label: 'Склад подарков' },
  { id: 'issued', label: 'Выданные' },
  { id: 'delivery', label: 'Доставка' },
  { id: 'promos', label: 'Промокоды' },
];

const STATUS_LABELS = {
  AVAILABLE: 'Доступно',
  SELECTED: 'Выбрано',
  PROCESSING: 'Обработка',
  READY: 'Готово',
  DELIVERED: 'Выдано',
  CANCELLED: 'Отменено',
  LOCKED: 'Закрыто',
  CHOOSING: 'Выбор',
};

const emptyMilestone = {
  name: '',
  distance_km: '',
  description: '',
  status: 'active',
  sort_order: '10',
  reward_ids: [],
};

const emptyReward = {
  name: '',
  type: 'PRODUCT',
  description: '',
  image: '',
  stock: '0',
  discount_percent: '',
  discount_valid_days: '30',
  discount_min_amount: '0',
  discount_max_amount: '',
  requires_size: false,
  size_options: ['S', 'M', 'L', 'XL', 'XXL'],
  cost_amount: '0',
  active: true,
};

export default function RewardsTab() {
  const [section, setSection] = useState('stats');
  const [stats, setStats] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [issued, setIssued] = useState([]);
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [milestoneForm, setMilestoneForm] = useState(null);
  const [rewardForm, setRewardForm] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterQ, setFilterQ] = useState('');
  const [giftForm, setGiftForm] = useState({
    phone: '',
    milestone_id: '',
    reward_id: '',
    size: '',
    comment: '',
  });
  const [gifting, setGifting] = useState(false);
  const [giftResult, setGiftResult] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, m, c, u, p] = await Promise.all([
        adminApi('/api/admin/rewards/stats'),
        adminApi('/api/admin/rewards/milestones'),
        adminApi('/api/admin/rewards/catalog'),
        adminApi('/api/admin/rewards/user-rewards'),
        adminApi('/api/admin/rewards/promos'),
      ]);
      setStats(s);
      setMilestones(m);
      setCatalog(c);
      setIssued(u);
      setPromos(p);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const deliveryRows = useMemo(
    () =>
      issued.filter((r) =>
        ['SELECTED', 'PROCESSING', 'READY'].includes(r.status) && r.reward_type !== 'DISCOUNT'
      ),
    [issued]
  );

  const filteredIssued = useMemo(() => {
    return issued.filter((r) => {
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterQ) {
        const q = filterQ.toLowerCase();
        const hay = `${r.user_name || ''} ${r.user_phone || ''} ${r.reward_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [issued, filterStatus, filterQ]);

  async function saveMilestone() {
    setSaving(true);
    try {
      const body = {
        ...milestoneForm,
        distance_km: Number(milestoneForm.distance_km),
        sort_order: Number(milestoneForm.sort_order) || 0,
        reward_ids: (milestoneForm.reward_ids || []).map(Number),
      };
      if (milestoneForm.id) {
        await adminApi(`/api/admin/rewards/milestones/${milestoneForm.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await adminApi('/api/admin/rewards/milestones', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setMilestoneForm(null);
      await loadAll();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveReward() {
    setSaving(true);
    try {
      const body = {
        ...rewardForm,
        stock: Number(rewardForm.stock) || 0,
        discount_percent: rewardForm.discount_percent === '' ? null : Number(rewardForm.discount_percent),
        discount_valid_days: Number(rewardForm.discount_valid_days) || 30,
        discount_min_amount: Number(rewardForm.discount_min_amount) || 0,
        discount_max_amount:
          rewardForm.discount_max_amount === '' ? null : Number(rewardForm.discount_max_amount),
        cost_amount: Number(rewardForm.cost_amount) || 0,
        requires_size: !!rewardForm.requires_size,
        size_options: rewardForm.requires_size ? rewardForm.size_options : null,
        active: !!rewardForm.active,
      };
      if (rewardForm.id) {
        await adminApi(`/api/admin/rewards/catalog/${rewardForm.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await adminApi('/api/admin/rewards/catalog', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setRewardForm(null);
      await loadAll();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateStock(rewardId, size, quantity) {
    try {
      await adminApi('/api/admin/rewards/stock', {
        method: 'PUT',
        body: JSON.stringify({ reward_id: rewardId, size, quantity: Number(quantity) || 0 }),
      });
      await loadAll();
    } catch (e) {
      alert(e.message);
    }
  }

  async function setUserStatus(id, status) {
    try {
      await adminApi(`/api/admin/rewards/user-rewards/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      await loadAll();
    } catch (e) {
      alert(e.message);
    }
  }

  const giftLinkedRewards = useMemo(() => {
    const mid = Number(giftForm.milestone_id);
    if (!mid) return catalog.filter((r) => r.active !== 0 && r.active !== false);
    const m = milestones.find((x) => Number(x.id) === mid);
    const linked = (m?.linked_rewards || []).map((r) => Number(r.reward_id));
    if (!linked.length) return catalog.filter((r) => r.active !== 0 && r.active !== false);
    return catalog.filter(
      (r) => linked.includes(Number(r.id)) && r.active !== 0 && r.active !== false
    );
  }, [giftForm.milestone_id, milestones, catalog]);

  const selectedGiftReward = useMemo(
    () => catalog.find((r) => String(r.id) === String(giftForm.reward_id)),
    [catalog, giftForm.reward_id]
  );

  const giftSizeOptions = useMemo(() => {
    if (!selectedGiftReward?.requires_size) return [];
    try {
      const raw = selectedGiftReward.size_options;
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string') return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return ['S', 'M', 'L', 'XL', 'XXL'];
  }, [selectedGiftReward]);

  async function submitGift(e) {
    e.preventDefault();
    setGifting(true);
    setError('');
    setGiftResult(null);
    try {
      const body = {
        phone: giftForm.phone.trim(),
        milestone_id: Number(giftForm.milestone_id),
        reward_id: giftForm.reward_id ? Number(giftForm.reward_id) : null,
        size: giftForm.size || null,
        comment: giftForm.comment.trim() || null,
      };
      const data = await adminApi('/api/admin/rewards/gift', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setGiftResult(data);
      setGiftForm((f) => ({ ...f, reward_id: '', size: '', comment: '' }));
      await loadAll();
    } catch (err) {
      setError(err.message || 'Не удалось подарить награду');
    } finally {
      setGifting(false);
    }
  }

  return (
    <div className="page-content">
      <nav className="reports-subnav" aria-label="Разделы наград">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip chip--pill${section === s.id ? ' chip--accent' : ''}`}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {error && <p className="form-error">{error}</p>}
      {loading && <p>Загрузка…</p>}

      {section === 'stats' && stats && (
        <div className="glass-card card">
          <h3>Аналитика наград</h3>
          <div className="entity-cards-grid" style={{ marginTop: 12 }}>
            <div className="glass-card card">
              <div className="muted">Всего пользователей</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.totalUsers}</div>
            </div>
            <div className="glass-card card">
              <div className="muted">Выбрано наград</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.selectedCount}</div>
            </div>
            <div className="glass-card card">
              <div className="muted">Выдано</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.deliveredCount}</div>
            </div>
            <div className="glass-card card">
              <div className="muted">Активные промокоды</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.activePromoCount}</div>
            </div>
            <div className="glass-card card">
              <div className="muted">Стоимость подарков</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.giftCostTotal} сом</div>
            </div>
          </div>
          <h4 style={{ marginTop: 20 }}>Достигли контрольных точек</h4>
          <table className="data-table">
            <thead>
              <tr>
                <th>Точка</th>
                <th>Км</th>
                <th>Пользователей</th>
              </tr>
            </thead>
            <tbody>
              {(stats.milestones || []).map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.distanceKm}</td>
                  <td>{m.reached}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section === 'gift' && (
        <div className="glass-card card">
          <h3>Подарить награду клиенту</h3>
          <p className="hint" style={{ marginTop: 4 }}>
            Без проверки километража. Можно только открыть точку (клиент выберет подарок) или сразу
            назначить конкретную награду.
          </p>
          <form onSubmit={submitGift} className="form-grid" style={{ marginTop: 16, maxWidth: 520 }}>
            <label>
              Телефон клиента
              <input
                required
                placeholder="992XXXXXXXXX"
                value={giftForm.phone}
                onChange={(e) => setGiftForm({ ...giftForm, phone: e.target.value })}
              />
            </label>
            <label>
              Контрольная точка
              <select
                required
                value={giftForm.milestone_id}
                onChange={(e) =>
                  setGiftForm({ ...giftForm, milestone_id: e.target.value, reward_id: '', size: '' })
                }
              >
                <option value="">Выберите…</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.distance_km} км)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Награда (необязательно)
              <select
                value={giftForm.reward_id}
                onChange={(e) => setGiftForm({ ...giftForm, reward_id: e.target.value, size: '' })}
              >
                <option value="">Только открыть — клиент выберет сам</option>
                {giftLinkedRewards.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.type})
                  </option>
                ))}
              </select>
            </label>
            {giftSizeOptions.length > 0 && (
              <label>
                Размер
                <select
                  required
                  value={giftForm.size}
                  onChange={(e) => setGiftForm({ ...giftForm, size: e.target.value })}
                >
                  <option value="">Выберите размер…</option>
                  {giftSizeOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label style={{ gridColumn: '1 / -1' }}>
              Комментарий
              <input
                placeholder="Подарок от администратора"
                value={giftForm.comment}
                onChange={(e) => setGiftForm({ ...giftForm, comment: e.target.value })}
              />
            </label>
            <div style={{ gridColumn: '1 / -1' }}>
              <button type="submit" className="btn btn--primary" disabled={gifting}>
                {gifting ? 'Отправка…' : 'Подарить'}
              </button>
            </div>
          </form>
          {giftResult && (
            <div className="glass-card card" style={{ marginTop: 16, padding: 12 }}>
              <strong>Готово</strong>
              <p className="hint" style={{ margin: '8px 0 0' }}>
                {giftResult.userName || 'Клиент'} ({giftResult.phone}) · {giftResult.milestoneName} ·{' '}
                {STATUS_LABELS[giftResult.status] || giftResult.status}
                {giftResult.rewardName ? ` · ${giftResult.rewardName}` : ''}
                {giftResult.promoCode ? ` · промокод ${giftResult.promoCode}` : ''}
              </p>
            </div>
          )}
        </div>
      )}

      {section === 'milestones' && (
        <div className="glass-card card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <h3>Контрольные точки</h3>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setMilestoneForm({ ...emptyMilestone })}
            >
              + Точка
            </button>
          </div>
          <table className="data-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Название</th>
                <th>Км</th>
                <th>Статус</th>
                <th>Награды</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.distance_km}</td>
                  <td>{m.status}</td>
                  <td>
                    {(m.linked_rewards || []).map((r) => r.reward_name).join(', ') || '—'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() =>
                        setMilestoneForm({
                          ...m,
                          reward_ids: (m.linked_rewards || []).map((r) => r.reward_id),
                        })
                      }
                    >
                      Изменить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {milestoneForm && (
            <div className="glass-card card settings-form" style={{ marginTop: 16 }}>
              <h4>{milestoneForm.id ? 'Редактировать' : 'Новая точка'}</h4>
              <label>
                Название
                <input
                  value={milestoneForm.name}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, name: e.target.value })}
                />
              </label>
              <label>
                Расстояние (км)
                <input
                  type="number"
                  value={milestoneForm.distance_km}
                  onChange={(e) =>
                    setMilestoneForm({ ...milestoneForm, distance_km: e.target.value })
                  }
                />
              </label>
              <label>
                Описание
                <textarea
                  value={milestoneForm.description || ''}
                  onChange={(e) =>
                    setMilestoneForm({ ...milestoneForm, description: e.target.value })
                  }
                />
              </label>
              <label>
                Статус
                <select
                  value={milestoneForm.status}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, status: e.target.value })}
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </label>
              <fieldset>
                <legend>Доступные награды</legend>
                {catalog.map((r) => {
                  const checked = (milestoneForm.reward_ids || []).includes(r.id);
                  return (
                    <label key={r.id} style={{ display: 'block' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const ids = new Set(milestoneForm.reward_ids || []);
                          if (checked) ids.delete(r.id);
                          else ids.add(r.id);
                          setMilestoneForm({ ...milestoneForm, reward_ids: [...ids] });
                        }}
                      />{' '}
                      {r.name} ({r.type})
                    </label>
                  );
                })}
              </fieldset>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn--primary" disabled={saving} onClick={saveMilestone}>
                  Сохранить
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setMilestoneForm(null)}>
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {section === 'catalog' && (
        <div className="glass-card card">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3>Каталог наград</h3>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setRewardForm({ ...emptyReward })}
            >
              + Награда
            </button>
          </div>
          <table className="data-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Название</th>
                <th>Тип</th>
                <th>Склад</th>
                <th>Скидка</th>
                <th>Активна</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {catalog.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.type}</td>
                  <td>
                    {r.type === 'DISCOUNT'
                      ? '—'
                      : `${r.available ?? r.stock - r.reserved} / ${r.stock}`}
                  </td>
                  <td>{r.discount_percent != null ? `${r.discount_percent}%` : '—'}</td>
                  <td>{r.active ? 'да' : 'нет'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() =>
                        setRewardForm({
                          ...r,
                          requires_size: !!r.requires_size,
                          size_options: r.size_options || ['S', 'M', 'L', 'XL', 'XXL'],
                          active: !!r.active,
                        })
                      }
                    >
                      Изменить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {rewardForm && (
            <div className="glass-card card settings-form" style={{ marginTop: 16 }}>
              <h4>{rewardForm.id ? 'Редактировать награду' : 'Новая награда'}</h4>
              <label>
                Название
                <input
                  value={rewardForm.name}
                  onChange={(e) => setRewardForm({ ...rewardForm, name: e.target.value })}
                />
              </label>
              <label>
                Тип
                <select
                  value={rewardForm.type}
                  onChange={(e) => setRewardForm({ ...rewardForm, type: e.target.value })}
                >
                  <option value="PRODUCT">PRODUCT</option>
                  <option value="DISCOUNT">DISCOUNT</option>
                  <option value="SPECIAL">SPECIAL</option>
                  <option value="VIP">VIP</option>
                </select>
              </label>
              <label>
                Описание
                <textarea
                  value={rewardForm.description || ''}
                  onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })}
                />
              </label>
              {rewardForm.type !== 'DISCOUNT' && (
                <label>
                  Остаток (шт)
                  <input
                    type="number"
                    value={rewardForm.stock}
                    onChange={(e) => setRewardForm({ ...rewardForm, stock: e.target.value })}
                  />
                </label>
              )}
              {rewardForm.type === 'DISCOUNT' && (
                <>
                  <label>
                    Процент скидки
                    <input
                      type="number"
                      value={rewardForm.discount_percent}
                      onChange={(e) =>
                        setRewardForm({ ...rewardForm, discount_percent: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Срок (дней)
                    <input
                      type="number"
                      value={rewardForm.discount_valid_days}
                      onChange={(e) =>
                        setRewardForm({ ...rewardForm, discount_valid_days: e.target.value })
                      }
                    />
                  </label>
                </>
              )}
              <label>
                Себестоимость (сом)
                <input
                  type="number"
                  value={rewardForm.cost_amount}
                  onChange={(e) => setRewardForm({ ...rewardForm, cost_amount: e.target.value })}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!rewardForm.requires_size}
                  onChange={(e) =>
                    setRewardForm({ ...rewardForm, requires_size: e.target.checked })
                  }
                />{' '}
                Требуется размер
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!rewardForm.active}
                  onChange={(e) => setRewardForm({ ...rewardForm, active: e.target.checked })}
                />{' '}
                Активна
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn--primary" disabled={saving} onClick={saveReward}>
                  Сохранить
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setRewardForm(null)}>
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {section === 'stock' && (
        <div className="glass-card card">
          <h3>Склад подарков</h3>
          {catalog
            .filter((r) => r.type !== 'DISCOUNT')
            .map((r) => {
              const available = Number(r.available ?? r.stock - r.reserved) || 0;
              const variants = r.stock_variants || [];
              return (
              <div key={r.id} className="glass-card card" style={{ marginTop: 12 }}>
                <strong>
                  {r.name} — доступно {available} / {r.stock}
                  {available <= 0 ? ' · ❌ Нет в наличии' : ''}
                </strong>
                {variants.length > 0 ? (
                  <table className="data-table" style={{ marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th>Размер</th>
                        <th>Цвет</th>
                        <th>Кол-во</th>
                        <th>Резерв</th>
                        <th>Статус</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {variants.map((v) => {
                        const left = Math.max(0, Number(v.quantity) - Number(v.reserved));
                        return (
                        <tr key={`${r.id}-${v.size}-${v.color}`}>
                          <td>{v.size || '—'}</td>
                          <td>{v.color || '—'}</td>
                          <td>
                            <input
                              type="number"
                              defaultValue={v.quantity}
                              style={{ width: 80 }}
                              onBlur={(e) =>
                                adminApi('/api/admin/rewards/stock', {
                                  method: 'PUT',
                                  body: JSON.stringify({
                                    reward_id: r.id,
                                    size: v.size || '',
                                    color: v.color || '',
                                    quantity: Number(e.target.value) || 0,
                                  }),
                                })
                                  .then(loadAll)
                                  .catch((err) => alert(err.message))
                              }
                            />
                          </td>
                          <td>{v.reserved}</td>
                          <td>{left <= 0 ? '❌ Нет в наличии' : `${left} шт.`}</td>
                          <td className="muted">blur = сохранить</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <label style={{ display: 'block', marginTop: 8 }}>
                    Остаток
                    <input
                      type="number"
                      defaultValue={r.stock}
                      style={{ width: 100, marginLeft: 8 }}
                      onBlur={(e) =>
                        adminApi(`/api/admin/rewards/catalog/${r.id}`, {
                          method: 'PUT',
                          body: JSON.stringify({ ...r, stock: Number(e.target.value) || 0 }),
                        })
                          .then(loadAll)
                          .catch((err) => alert(err.message))
                      }
                    />
                    {available <= 0 && (
                      <span className="muted" style={{ marginLeft: 8 }}>❌ Нет в наличии</span>
                    )}
                  </label>
                )}
              </div>
              );
            })}
        </div>
      )}

      {(section === 'issued' || section === 'delivery') && (
        <div className="glass-card card">
          <h3>{section === 'delivery' ? 'Доставка' : 'Выданные награды'}</h3>
          {section === 'issued' && (
            <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
              <input
                placeholder="Поиск: имя / телефон / награда"
                value={filterQ}
                onChange={(e) => setFilterQ(e.target.value)}
              />
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">Все статусы</option>
                {Object.keys(STATUS_LABELS).map((k) => (
                  <option key={k} value={k}>
                    {STATUS_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <table className="data-table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Км</th>
                <th>Точка</th>
                <th>Награда</th>
                <th>Размер</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(section === 'delivery' ? deliveryRows : filteredIssued).map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.user_name}
                    <div className="muted">{r.user_phone}</div>
                  </td>
                  <td>{Number(r.total_distance_km || 0).toFixed(1)}</td>
                  <td>
                    {r.milestone_name} ({r.distance_km} км)
                  </td>
                  <td>{r.reward_name || '—'}{r.promo_code ? ` · ${r.promo_code}` : ''}</td>
                  <td>{r.size || '—'}</td>
                  <td>{STATUS_LABELS[r.status] || r.status}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.status === 'PROCESSING' && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setUserStatus(r.id, 'READY')}
                      >
                        Готово
                      </button>
                    )}
                    {(r.status === 'READY' || r.status === 'PROCESSING') && (
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={() => setUserStatus(r.id, 'DELIVERED')}
                      >
                        Выдано
                      </button>
                    )}
                    {r.status !== 'CANCELLED' && r.status !== 'DELIVERED' && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setUserStatus(r.id, 'CANCELLED')}
                      >
                        Отмена
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section === 'promos' && (
        <div className="glass-card card">
          <h3>Промокоды</h3>
          <table className="data-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Код</th>
                <th>Пользователь</th>
                <th>%</th>
                <th>Статус</th>
                <th>До</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id}>
                  <td>
                    <code>{p.code}</code>
                  </td>
                  <td>
                    {p.user_name}
                    <div className="muted">{p.user_phone}</div>
                  </td>
                  <td>{p.discount_percent}%</td>
                  <td>{p.status}</td>
                  <td>{p.expires_at ? new Date(p.expires_at).toLocaleDateString('ru') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
