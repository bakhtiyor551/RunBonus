import { useEffect, useState } from 'react';
import { adminApi } from './api';
import Icon from './components/Icon';

const EMPTY_PAYMENT = {
  id: '',
  label: '',
  needs_details: false,
  details_label: '',
  uses_transfer_modal: false,
  sort_order: 50,
  status: 'active',
};

const EMPTY_DELIVERY = {
  id: '',
  label: '',
  price: 0,
  requires_address: true,
  sort_order: 50,
  status: 'active',
};

const EMPTY_WALLET = {
  id: '',
  provider: '',
  number: '',
  holder: 'RunBonus',
  sort_order: 50,
  status: 'active',
};

export default function PaymentMethodsTab() {
  const [methods, setMethods] = useState([]);
  const [deliveryMethods, setDeliveryMethods] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editingDelivery, setEditingDelivery] = useState(null);
  const [editingWallet, setEditingWallet] = useState(null);
  const [form, setForm] = useState(EMPTY_PAYMENT);
  const [deliveryForm, setDeliveryForm] = useState(EMPTY_DELIVERY);
  const [walletForm, setWalletForm] = useState(EMPTY_WALLET);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      adminApi('/api/admin/payment-methods'),
      adminApi('/api/admin/delivery-methods'),
      adminApi('/api/admin/mobile-wallets'),
    ])
      .then(([pay, deliv, w]) => {
        setMethods(pay);
        setDeliveryMethods(deliv);
        setWallets(w);
      })
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingDelivery(null);
    setEditingWallet(null);
    setEditing('new');
    setForm({ ...EMPTY_PAYMENT });
  };

  const openEdit = (row) => {
    setEditingDelivery(null);
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

  const openCreateDelivery = () => {
    setEditing(null);
    setEditingWallet(null);
    setEditingDelivery('new');
    setDeliveryForm({ ...EMPTY_DELIVERY });
  };

  const openEditDelivery = (row) => {
    setEditing(null);
    setEditingWallet(null);
    setEditingDelivery(row.id);
    setDeliveryForm({
      id: row.id,
      label: row.label,
      price: row.price ?? 0,
      requires_address: Boolean(row.requiresAddress),
      sort_order: row.sort_order ?? 0,
      status: row.status,
    });
  };

  const openCreateWallet = () => {
    setEditing(null);
    setEditingDelivery(null);
    setEditingWallet('new');
    setWalletForm({ ...EMPTY_WALLET });
  };

  const openEditWallet = (row) => {
    setEditing(null);
    setEditingDelivery(null);
    setEditingWallet(row.id);
    setWalletForm({
      id: row.id,
      provider: row.provider,
      number: row.number,
      holder: row.holder || 'RunBonus',
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

  const saveDelivery = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        label: deliveryForm.label,
        price: Number(deliveryForm.price) || 0,
        requires_address: deliveryForm.requires_address,
        sort_order: Number(deliveryForm.sort_order) || 0,
        status: deliveryForm.status,
      };
      if (editingDelivery === 'new') {
        await adminApi('/api/admin/delivery-methods', {
          method: 'POST',
          body: JSON.stringify({ ...payload, id: deliveryForm.id }),
        });
      } else {
        await adminApi(`/api/admin/delivery-methods/${editingDelivery}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }
      setEditingDelivery(null);
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

  const saveWallet = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        provider: walletForm.provider,
        number: walletForm.number,
        holder: walletForm.holder,
        sort_order: Number(walletForm.sort_order) || 0,
        status: walletForm.status,
      };
      if (editingWallet === 'new') {
        await adminApi('/api/admin/mobile-wallets', {
          method: 'POST',
          body: JSON.stringify({ ...payload, id: walletForm.id }),
        });
      } else {
        await adminApi(`/api/admin/mobile-wallets/${editingWallet}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }
      setEditingWallet(null);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleWalletStatus = async (row) => {
    const next = row.status === 'active' ? 'inactive' : 'active';
    try {
      await adminApi(`/api/admin/mobile-wallets/${row.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleDeliveryStatus = async (row) => {
    const next = row.status === 'active' ? 'inactive' : 'active';
    try {
      await adminApi(`/api/admin/delivery-methods/${row.id}/status`, {
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
              Способы оплаты в корзине. Ниже — кошельки RunBonus для мобильного перевода (номера видит клиент при
              оплате).
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

      <div className="glass-card card" style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2>Кошельки для мобильного перевода</h2>
            <p className="hint">Номера Alif, DC, Эсхата и др. — показываются клиенту при оплате «Мобильный перевод».</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={openCreateWallet}>
            + Кошелёк
          </button>
        </div>
        {!loading && (
          <div className="entity-cards-grid payment-methods-grid">
            {wallets.map((w) => (
              <article
                key={w.id}
                className={`payment-method-card glass-card${editingWallet === w.id ? ' entity-card--selected' : ''}`}
              >
                <div className="entity-card__head">
                  <span className="payment-method-card__code">{w.id}</span>
                  <span className={`chip ${w.status === 'active' ? 'entity-card__status--ok' : 'entity-card__status--muted'}`}>
                    {w.status === 'active' ? 'Активен' : 'Отключён'}
                  </span>
                </div>
                <h3 className="entity-card__title">{w.provider}</h3>
                <p className="entity-card__highlight-value" style={{ fontSize: 16, wordBreak: 'break-all' }}>
                  {w.number}
                </p>
                <p className="entity-card__meta">Получатель: {w.holder}</p>
                <div className="entity-card__actions">
                  <button type="button" className="btn btn--sm" onClick={() => openEditWallet(w)}>
                    Изменить номер
                  </button>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => toggleWalletStatus(w)}>
                    {w.status === 'active' ? 'Отключить' : 'Включить'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {editingWallet && (
        <div className="glass-card card" style={{ marginTop: 24 }}>
          <h3>{editingWallet === 'new' ? 'Новый кошелёк' : `Кошелёк: ${editingWallet}`}</h3>
          <form className="settings-form" onSubmit={saveWallet}>
            {editingWallet === 'new' ? (
              <label>
                Код (латиница)
                <input
                  value={walletForm.id}
                  onChange={(e) => setWalletForm({ ...walletForm, id: e.target.value })}
                  placeholder="alif"
                  required
                />
              </label>
            ) : (
              <p className="hint">
                Код: <strong>{walletForm.id}</strong>
              </p>
            )}
            <label>
              Сервис (Alif Mobi, DC…)
              <input
                value={walletForm.provider}
                onChange={(e) => setWalletForm({ ...walletForm, provider: e.target.value })}
                required
              />
            </label>
            <label>
              Номер кошелька
              <input
                value={walletForm.number}
                onChange={(e) => setWalletForm({ ...walletForm, number: e.target.value })}
                placeholder="+992 90 123 45 67"
                required
              />
            </label>
            <label>
              Имя получателя
              <input
                value={walletForm.holder}
                onChange={(e) => setWalletForm({ ...walletForm, holder: e.target.value })}
              />
            </label>
            <label>
              Порядок
              <input
                type="number"
                value={walletForm.sort_order}
                onChange={(e) => setWalletForm({ ...walletForm, sort_order: e.target.value })}
              />
            </label>
            <label>
              Статус
              <select value={walletForm.status} onChange={(e) => setWalletForm({ ...walletForm, status: e.target.value })}>
                <option value="active">Активен</option>
                <option value="inactive">Отключён</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setEditingWallet(null)}>
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

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

      <div className="glass-card card" style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2>Способы доставки</h2>
            <p className="hint">
              Выбор в корзине. Укажите цену в сомони (0 — бесплатно). Доставка один раз на весь заказ.
            </p>
          </div>
          <button type="button" className="btn btn--primary" onClick={openCreateDelivery}>
            + Способ доставки
          </button>
        </div>

        {!loading && (
          <div className="entity-cards-grid payment-methods-grid">
            {deliveryMethods.map((m) => (
              <article
                key={m.id}
                className={`payment-method-card glass-card${editingDelivery === m.id ? ' entity-card--selected' : ''}`}
              >
                <div className="entity-card__head">
                  <span className="payment-method-card__code">{m.id}</span>
                  <span className={`chip ${m.status === 'active' ? 'entity-card__status--ok' : 'entity-card__status--muted'}`}>
                    {m.status === 'active' ? 'Активен' : 'Отключён'}
                  </span>
                </div>
                <h3 className="entity-card__title">{m.label}</h3>
                <div className="entity-card__highlight">
                  <span className="entity-card__highlight-label">Цена</span>
                  <span className="entity-card__highlight-value">
                    {Number(m.price) > 0 ? `${m.price} сом.` : 'Бесплатно'}
                  </span>
                </div>
                <p className="entity-card__meta">Порядок: {m.sort_order}</p>
                <ul className="payment-method-card__flags">
                  {m.requiresAddress && <li>Нужен адрес доставки</li>}
                  {m.is_builtin && <li>Встроенный</li>}
                </ul>
                <div className="entity-card__actions">
                  <button type="button" className="btn btn--sm" onClick={() => openEditDelivery(m)}>
                    Изменить
                  </button>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => toggleDeliveryStatus(m)}>
                    {m.status === 'active' ? 'Отключить' : 'Включить'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {editingDelivery && (
        <div className="glass-card card" style={{ marginTop: 24 }}>
          <h3>{editingDelivery === 'new' ? 'Новый способ доставки' : `Редактирование: ${editingDelivery}`}</h3>
          <form className="settings-form" onSubmit={saveDelivery}>
            {editingDelivery === 'new' ? (
              <label>
                Код (латиница)
                <input
                  value={deliveryForm.id}
                  onChange={(e) => setDeliveryForm({ ...deliveryForm, id: e.target.value })}
                  placeholder="express"
                  required
                />
              </label>
            ) : (
              <p className="hint">
                Код: <strong>{deliveryForm.id}</strong>
                {deliveryMethods.find((m) => m.id === deliveryForm.id)?.is_builtin ? ' (встроенный)' : ''}
              </p>
            )}
            <label>
              Название в приложении
              <input
                value={deliveryForm.label}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, label: e.target.value })}
                required
              />
            </label>
            <label>
              Цена доставки (сомони)
              <input
                type="number"
                min="0"
                step="0.01"
                value={deliveryForm.price}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, price: e.target.value })}
              />
            </label>
            <label>
              Порядок сортировки
              <input
                type="number"
                value={deliveryForm.sort_order}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, sort_order: e.target.value })}
              />
            </label>
            <label className="settings-form__checkbox">
              <input
                type="checkbox"
                checked={deliveryForm.requires_address}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, requires_address: e.target.checked })}
              />
              Запрашивать адрес у клиента
            </label>
            <label>
              Статус
              <select
                value={deliveryForm.status}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, status: e.target.value })}
              >
                <option value="active">Активен</option>
                <option value="inactive">Отключён</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setEditingDelivery(null)}>
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      {!loading && !methods.length && !deliveryMethods.length && (
        <p className="hint" style={{ marginTop: 16 }}>
          <Icon name="info" /> Примените миграции{' '}
          <code>database/migrations/013_payment_methods.sql</code> и{' '}
          <code>database/migrations/014_delivery_methods.sql</code>,{' '}
          <code>015_delivery_price_mobile_wallets.sql</code>, затем перезапустите backend.
        </p>
      )}
    </div>
  );
}
