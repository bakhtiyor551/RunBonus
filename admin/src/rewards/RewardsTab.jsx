import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api';

const SECTIONS = [
  { id: 'stats', label: 'Статистика' },
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
            .map((r) => (
              <div key={r.id} className="glass-card card" style={{ marginTop: 12 }}>
                <strong>
                  {r.name} — доступно {r.available ?? r.stock - r.reserved} / {r.stock}
                </strong>
                {r.requires_size ? (
                  <table className="data-table" style={{ marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th>Размер</th>
                        <th>Кол-во</th>
                        <th>Резерв</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(r.stock_variants || []).map((v) => (
                        <tr key={`${r.id}-${v.size}`}>
                          <td>{v.size || '—'}</td>
                          <td>
                            <input
                              type="number"
                              defaultValue={v.quantity}
                              style={{ width: 80 }}
                              onBlur={(e) => updateStock(r.id, v.size, e.target.value)}
                            />
                          </td>
                          <td>{v.reserved}</td>
                          <td className="muted">blur = сохранить</td>
                        </tr>
                      ))}
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
                  </label>
                )}
              </div>
            ))}
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
