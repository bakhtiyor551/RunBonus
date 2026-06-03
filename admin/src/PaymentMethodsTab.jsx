import { useEffect, useState } from 'react';
import { adminApi } from './api';
import Icon from './components/Icon';

const EMPTY = {
  id: '',
  label: '',
  needs_details: false,
  details_label: '',
  uses_transfer_modal: false,
  sort_order: 50,
  status: 'active',
};

export default function PaymentMethodsTab() {
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    adminApi('/api/admin/payment-methods')
      .then(setMethods)
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
      id: row.id,
      label: row.label,
      needs_details: Boolean(row.needsDetails),
      details_label: row.detailsLabel || '',
      uses_transfer_modal: Boolean(row.usesTransferModal),
      sort_order: row.sort_order ?? 0,
      status: row.status,
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        label: form.label,
        needs_details: form.needs_details,
        details_label: form.details_label,
        uses_transfer_modal: form.uses_transfer_modal,
        sort_order: Number(form.sort_order) || 0,
        status: form.status,
      };
      if (editing === 'new') {
        await adminApi('/api/admin/payment-methods', {
          method: 'POST',
          body: JSON.stringify({ ...payload, id: form.id }),
        });
      } else {
        await adminApi(`/api/admin/payment-methods/${editing}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
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
      await adminApi(`/api/admin/payment-methods/${row.id}/status`, {
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2>Способы оплаты</h2>
            <p className="hint">
              Список в мобильном приложении при оформлении заказа. «Мобильный перевод» — чек и модальное окно
              реквизитов.
            </p>
          </div>
          <button type="button" className="btn btn--primary" onClick={openCreate}>
            + Способ оплаты
          </button>
        </div>

        {loading ? (
          <p>Загрузка…</p>
        ) : (
          <div className="entity-cards-grid payment-methods-grid">
            {methods.map((m) => (
              <article key={m.id} className={`payment-method-card glass-card${editing === m.id ? ' entity-card--selected' : ''}`}>
                <div className="entity-card__head">
                  <span className="payment-method-card__code">{m.id}</span>
                  <span className={`chip ${m.status === 'active' ? 'entity-card__status--ok' : 'entity-card__status--muted'}`}>
                    {m.status === 'active' ? 'Активен' : 'Отключён'}
                  </span>
                </div>
                <h3 className="entity-card__title">{m.label}</h3>
                <p className="entity-card__meta">Порядок: {m.sort_order}</p>
                <ul className="payment-method-card__flags">
                  {m.needsDetails && <li>Нужны реквизиты клиента</li>}
                  {m.usesTransferModal && <li>Мобильный перевод + чек</li>}
                  {m.is_builtin && <li>Встроенный</li>}
                </ul>
                {m.detailsLabel && (
                  <p className="entity-card__meta entity-card__meta--muted">Подпись поля: {m.detailsLabel}</p>
                )}
                <div className="entity-card__actions">
                  <button type="button" className="btn btn--sm" onClick={() => openEdit(m)}>
                    Изменить
                  </button>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => toggleStatus(m)}>
                    {m.status === 'active' ? 'Отключить' : 'Включить'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="glass-card card" style={{ marginTop: 24 }}>
          <h3>{editing === 'new' ? 'Новый способ оплаты' : `Редактирование: ${editing}`}</h3>
          <form className="settings-form" onSubmit={save}>
            {editing === 'new' ? (
              <label>
                Код (латиница)
                <input
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  placeholder="card_online"
                  required
                />
              </label>
            ) : (
              <p className="hint">
                Код: <strong>{form.id}</strong>
                {methods.find((m) => m.id === form.id)?.is_builtin ? ' (встроенный)' : ''}
              </p>
            )}
            <label>
              Название в приложении
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
            </label>
            <label>
              Порядок сортировки
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
            </label>
            <label className="settings-form__checkbox">
              <input
                type="checkbox"
                checked={form.needs_details}
                onChange={(e) => setForm({ ...form, needs_details: e.target.checked })}
              />
              Запрашивать доп. данные у клиента (карта, банк…)
            </label>
            {form.needs_details && (
              <label>
                Подпись поля для клиента
                <input
                  value={form.details_label}
                  onChange={(e) => setForm({ ...form, details_label: e.target.value })}
                  placeholder="Номер карты"
                />
              </label>
            )}
            <label className="settings-form__checkbox">
              <input
                type="checkbox"
                checked={form.uses_transfer_modal}
                onChange={(e) => setForm({ ...form, uses_transfer_modal: e.target.checked })}
              />
              Мобильный перевод (реквизиты RunBonus + загрузка чека)
            </label>
            <label>
              Статус
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Активен</option>
                <option value="inactive">Отключён</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

      {!loading && !methods.length && (
        <p className="hint" style={{ marginTop: 16 }}>
          <Icon name="info" /> Примените миграцию{' '}
          <code>database/migrations/013_payment_methods.sql</code> и перезапустите backend.
        </p>
      )}
    </div>
  );
}
