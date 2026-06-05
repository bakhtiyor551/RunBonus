import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api';
import { formatMoney, formatNumber } from '../utils/format';
import ReportPeriodFilter from '../reports/ReportPeriodFilter';
import { periodQuery } from '../reports/reportUtils';

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'settings', label: 'Настройки' },
  { id: 'advertisers', label: 'Рекламодатели' },
  { id: 'campaigns', label: 'Кампании' },
  { id: 'statistics', label: 'Статистика' },
  { id: 'payments', label: 'Платежи' },
  { id: 'tariffs', label: 'Тарифы' },
];

const AD_TYPES = [
  { id: 'banner_home', label: 'Баннер на главной' },
  { id: 'banner_workout', label: 'После тренировки' },
  { id: 'push', label: 'Push' },
  { id: 'promo', label: 'Акция партнёра' },
];

const CITIES = ['Душанбе', 'Худжанд', 'Бохтар', 'Куляб'];
const LEVELS = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'legend'];

const emptyAdvertiser = { company_name: '', contact_name: '', phone: '', email: '', address: '', balance: '0', status: 'active' };
const emptyCampaign = {
  advertiser_id: '',
  title: '',
  description: '',
  ad_type: 'banner_home',
  banner_url: '',
  target_url: '',
  audience_cities: [],
  audience_levels: [],
  start_date: '',
  end_date: '',
  budget: '',
  status: 'draft',
};

export default function AdsTab() {
  const [section, setSection] = useState('dashboard');
  const [period, setPeriod] = useState('30d');
  const [dashboard, setDashboard] = useState(null);
  const [advertisers, setAdvertisers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [advForm, setAdvForm] = useState(emptyAdvertiser);
  const [campForm, setCampForm] = useState(emptyCampaign);
  const [editAdvId, setEditAdvId] = useState(null);
  const [editCampId, setEditCampId] = useState(null);
  const [adSettings, setAdSettings] = useState({ google_ads_enabled: true });
  const [settingsSaving, setSettingsSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = periodQuery(period);
      if (section === 'dashboard') {
        setDashboard(await adminApi(`/api/admin/ads/dashboard?${q}`));
      } else if (section === 'advertisers') {
        setAdvertisers(await adminApi('/api/admin/ads/advertisers'));
      } else if (section === 'campaigns') {
        const [c, a] = await Promise.all([
          adminApi('/api/admin/ads/campaigns'),
          adminApi('/api/admin/ads/advertisers'),
        ]);
        setCampaigns(c);
        setAdvertisers(a);
      } else if (section === 'statistics') {
        setStats(await adminApi(`/api/admin/ads/statistics?${q}`));
      } else if (section === 'payments') {
        setPayments(await adminApi('/api/admin/ads/payments'));
      } else if (section === 'tariffs') {
        setTariffs(await adminApi('/api/admin/ads/tariffs'));
      } else if (section === 'settings') {
        setAdSettings(await adminApi('/api/admin/ads/settings'));
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [section, period]);

  useEffect(() => {
    load();
  }, [load]);

  const saveAdvertiser = async (e) => {
    e.preventDefault();
    const body = { ...advForm, balance: Number(advForm.balance) };
    if (editAdvId) {
      await adminApi(`/api/admin/ads/advertisers/${editAdvId}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await adminApi('/api/admin/ads/advertisers', { method: 'POST', body: JSON.stringify(body) });
    }
    setAdvForm(emptyAdvertiser);
    setEditAdvId(null);
    load();
  };

  const saveCampaign = async (e) => {
    e.preventDefault();
    const body = {
      ...campForm,
      advertiser_id: Number(campForm.advertiser_id),
      budget: Number(campForm.budget),
    };
    if (editCampId) {
      await adminApi(`/api/admin/ads/campaigns/${editCampId}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await adminApi('/api/admin/ads/campaigns', { method: 'POST', body: JSON.stringify(body) });
    }
    setCampForm(emptyCampaign);
    setEditCampId(null);
    load();
  };

  const toggleAudience = (field, value) => {
    const arr = campForm[field] || [];
    const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
    setCampForm({ ...campForm, [field]: next });
  };

  const saveAdSettings = async (google_ads_enabled) => {
    setSettingsSaving(true);
    try {
      const data = await adminApi('/api/admin/ads/settings', {
        method: 'PUT',
        body: JSON.stringify({ google_ads_enabled }),
      });
      setAdSettings(data);
    } catch (e) {
      alert(e.message || 'Не удалось сохранить');
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <div className="page-content ads-page">
      <h2>Реклама</h2>
      <nav className="reports-subnav">
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

      {(section === 'dashboard' || section === 'statistics') && (
        <ReportPeriodFilter period={period} onPeriodChange={setPeriod} onRefresh={load} />
      )}

      {loading && <p className="hint">Загрузка…</p>}

      {!loading && section === 'dashboard' && dashboard && (
        <div className="bento-grid bento-grid--stats">
          {[
            { label: 'Активные кампании', value: formatNumber(dashboard.cards?.active_campaigns) },
            { label: 'Доход от рекламы', value: formatMoney(dashboard.cards?.ad_revenue) },
            { label: 'Показы', value: formatNumber(dashboard.cards?.impressions) },
            { label: 'Клики', value: formatNumber(dashboard.cards?.clicks) },
            { label: 'CTR %', value: `${dashboard.cards?.ctr ?? 0}%` },
          ].map((item) => (
            <div key={item.label} className="glass-card stat-card">
              <p className="stat-card__label">{item.label}</p>
              <h3 className="stat-card__value">{item.value}</h3>
            </div>
          ))}
        </div>
      )}

      {!loading && section === 'settings' && (
        <div className="glass-card card" style={{ maxWidth: 560 }}>
          <h3>Google AdMob в приложении</h3>
          <p className="hint" style={{ marginBottom: 20 }}>
            Баннеры Google Ads и Google Play на главной, после тренировки и в магазине. Партнёрские баннеры RunBonus
            (кампании ниже) не затрагиваются.
          </p>
          <label className="settings-form__checkbox">
            <input
              type="checkbox"
              checked={adSettings.google_ads_enabled !== false}
              disabled={settingsSaving}
              onChange={(e) => saveAdSettings(e.target.checked)}
            />
            Показывать рекламу Google в мобильном приложении
          </label>
          {adSettings.updated_at && (
            <p className="hint" style={{ marginTop: 16 }}>
              Обновлено: {new Date(adSettings.updated_at).toLocaleString('ru-RU')}
            </p>
          )}
        </div>
      )}

      {!loading && section === 'advertisers' && (
        <div className="shop-products-editor__grid">
          <form className="settings-form glass-card card" onSubmit={saveAdvertiser}>
            <h3>{editAdvId ? 'Редактировать' : 'Новый рекламодатель'}</h3>
            <label>
              Компания
              <input value={advForm.company_name} onChange={(e) => setAdvForm({ ...advForm, company_name: e.target.value })} required />
            </label>
            <label>
              Контакт
              <input value={advForm.contact_name} onChange={(e) => setAdvForm({ ...advForm, contact_name: e.target.value })} />
            </label>
            <label>
              Телефон
              <input value={advForm.phone} onChange={(e) => setAdvForm({ ...advForm, phone: e.target.value })} />
            </label>
            <label>
              Email
              <input value={advForm.email} onChange={(e) => setAdvForm({ ...advForm, email: e.target.value })} />
            </label>
            <label>
              Баланс
              <input type="number" value={advForm.balance} onChange={(e) => setAdvForm({ ...advForm, balance: e.target.value })} />
            </label>
            <button type="submit" className="btn btn--primary">
              Сохранить
            </button>
          </form>
          <div className="entity-cards-grid">
            {advertisers.map((a) => (
              <article key={a.id} className="glass-card entity-card" style={{ padding: 14 }}>
                <h3>{a.company_name}</h3>
                <p className="hint">{a.contact_name} · {a.phone}</p>
                <p>Баланс: {formatMoney(a.balance)}</p>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => {
                    setEditAdvId(a.id);
                    setAdvForm({
                      company_name: a.company_name,
                      contact_name: a.contact_name || '',
                      phone: a.phone || '',
                      email: a.email || '',
                      address: a.address || '',
                      balance: String(a.balance),
                      status: a.status,
                    });
                  }}
                >
                  Изменить
                </button>
              </article>
            ))}
          </div>
        </div>
      )}

      {!loading && section === 'campaigns' && (
        <div className="shop-products-editor__grid">
          <form className="settings-form glass-card card" onSubmit={saveCampaign}>
            <h3>{editCampId ? 'Редактировать кампанию' : 'Новая кампания'}</h3>
            <label>
              Рекламодатель
              <select
                value={campForm.advertiser_id}
                onChange={(e) => setCampForm({ ...campForm, advertiser_id: e.target.value })}
                required
              >
                <option value="">—</option>
                {advertisers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.company_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Название
              <input value={campForm.title} onChange={(e) => setCampForm({ ...campForm, title: e.target.value })} required />
            </label>
            <label>
              Тип
              <select value={campForm.ad_type} onChange={(e) => setCampForm({ ...campForm, ad_type: e.target.value })}>
                {AD_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              URL баннера (1080×400)
              <input value={campForm.banner_url} onChange={(e) => setCampForm({ ...campForm, banner_url: e.target.value })} />
            </label>
            <label>
              Ссылка
              <input value={campForm.target_url} onChange={(e) => setCampForm({ ...campForm, target_url: e.target.value })} />
            </label>
            <label>
              Даты
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="date" value={campForm.start_date} onChange={(e) => setCampForm({ ...campForm, start_date: e.target.value })} />
                <input type="date" value={campForm.end_date} onChange={(e) => setCampForm({ ...campForm, end_date: e.target.value })} />
              </div>
            </label>
            <label>
              Бюджет
              <input type="number" value={campForm.budget} onChange={(e) => setCampForm({ ...campForm, budget: e.target.value })} />
            </label>
            <p className="hint">Города</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CITIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`chip chip--pill${(campForm.audience_cities || []).includes(c) ? ' chip--accent' : ''}`}
                  onClick={() => toggleAudience('audience_cities', c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="hint">Уровни</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`chip chip--pill${(campForm.audience_levels || []).includes(l) ? ' chip--accent' : ''}`}
                  onClick={() => toggleAudience('audience_levels', l)}
                >
                  {l}
                </button>
              ))}
            </div>
            <label>
              Статус
              <select value={campForm.status} onChange={(e) => setCampForm({ ...campForm, status: e.target.value })}>
                <option value="draft">Черновик</option>
                <option value="pending_payment">Ожидает оплаты</option>
                <option value="active">Активна</option>
                <option value="paused">Пауза</option>
                <option value="completed">Завершена</option>
                <option value="cancelled">Отменена</option>
              </select>
            </label>
            <button type="submit" className="btn btn--primary">
              Сохранить
            </button>
          </form>
          <div className="entity-cards-grid">
            {campaigns.map((c) => (
              <article key={c.id} className="glass-card entity-card" style={{ padding: 14 }}>
                <h3>{c.title}</h3>
                <p className="hint">{c.advertiser_name} · {c.ad_type}</p>
                <p>
                  {c.start_date} — {c.end_date} · {formatMoney(c.budget)}
                </p>
                <span className="chip">{c.status}</span>
                <button
                  type="button"
                  className="btn btn--sm"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    setEditCampId(c.id);
                    setCampForm({
                      advertiser_id: String(c.advertiser_id),
                      title: c.title,
                      description: c.description || '',
                      ad_type: c.ad_type,
                      banner_url: c.banner_url || '',
                      target_url: c.target_url || '',
                      audience_cities: c.audience_cities || [],
                      audience_levels: c.audience_levels || [],
                      start_date: String(c.start_date).slice(0, 10),
                      end_date: String(c.end_date).slice(0, 10),
                      budget: String(c.budget),
                      status: c.status,
                    });
                  }}
                >
                  Изменить
                </button>
              </article>
            ))}
          </div>
        </div>
      )}

      {!loading && section === 'statistics' && stats && (
        <>
          <p className="hint">
            Показы: {formatNumber(stats.summary?.impressions)} · Клики: {formatNumber(stats.summary?.clicks)} · CTR:{' '}
            {stats.summary?.ctr}%
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Кампания</th>
                  <th>Показы</th>
                  <th>Клики</th>
                  <th>CTR</th>
                  <th>Бюджет</th>
                </tr>
              </thead>
              <tbody>
                {(stats.campaigns || []).map((c) => (
                  <tr key={c.id}>
                    <td>{c.title}</td>
                    <td>{c.impressions}</td>
                    <td>{c.clicks}</td>
                    <td>{c.ctr}%</td>
                    <td>{formatMoney(c.budget)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && section === 'payments' && (
        <div className="table-wrap glass-card card">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Рекламодатель</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.advertiser_name}</td>
                  <td>{formatMoney(p.amount)}</td>
                  <td>{p.status}</td>
                  <td>{new Date(p.created_at).toLocaleString('ru-RU')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && section === 'tariffs' && (
        <div className="entity-cards-grid">
          {tariffs.map((t) => (
            <article key={t.id} className="glass-card stat-card">
              <h3>{t.name}</h3>
              <p>{t.days} дней</p>
              <p className="stat-card__value">{formatMoney(t.price)}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
