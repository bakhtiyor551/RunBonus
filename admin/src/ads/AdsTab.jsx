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

const EMPTY_SETTINGS = {
  partner_ads_enabled: true,
  impression_cost: '0.01',
  admob_enabled: true,
  admob_test_mode: false,
  admob_app_id: '',
  admob_google_home: '',
  admob_google_workout: '',
  admob_google_shop: '',
  admob_play_home: '',
  admob_play_workout: '',
  admob_play_shop: '',
};

const AD_TYPES = [
  { id: 'banner_home', label: 'Баннер на главной', hint: 'Карусель на главном экране приложения. Рекомендуемый размер баннера: 1080×400 px.' },
  { id: 'banner_workout', label: 'После тренировки', hint: 'Показ после сохранения тренировки. Баннер 1080×400 px.' },
  { id: 'push', label: 'Push-уведомление', hint: 'Текстовое уведомление пользователям по аудитории.' },
  { id: 'promo', label: 'Акция партнёра', hint: 'Промо-блок в разделе магазина или бонусов.' },
];

const CAMPAIGN_STATUSES = [
  { id: 'draft', label: 'Черновик', hint: 'Не показывается в приложении' },
  { id: 'pending_payment', label: 'Ожидает оплаты', hint: 'После оплаты можно активировать' },
  { id: 'active', label: 'Активна', hint: 'Показывается выбранной аудитории' },
  { id: 'paused', label: 'Пауза', hint: 'Временно скрыта' },
  { id: 'completed', label: 'Завершена', hint: 'Срок или бюджет исчерпаны' },
  { id: 'cancelled', label: 'Отменена', hint: 'Остановлена вручную' },
];

const PAYMENT_STATUSES = {
  new: 'Новый',
  pending: 'В обработке',
  paid: 'Оплачен',
  completed: 'Завершён',
  cancelled: 'Отменён',
};

const CITIES = ['Душанбе', 'Худжанд', 'Бохтар', 'Куляб'];
const LEVELS = [
  { id: 'bronze', label: 'Бронза' },
  { id: 'silver', label: 'Серебро' },
  { id: 'gold', label: 'Золото' },
  { id: 'platinum', label: 'Платина' },
  { id: 'diamond', label: 'Алмаз' },
  { id: 'legend', label: 'Легенда' },
];

const emptyAdvertiser = {
  company_name: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  balance: '0',
  status: 'active',
};

const ACTIVATION_STATUSES = ['active', 'pending_payment'];

const emptyTariff = {
  code: '',
  name: '',
  days: '7',
  price: '',
  sort_order: '50',
  status: 'active',
};

const emptyCampaign = {
  advertiser_id: '',
  tariff_id: '',
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

function addDaysIso(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + Number(days) || 0);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function FormSection({ title, hint, children }) {
  return (
    <section className="ads-form__section">
      <div className="ads-form__section-head">
        <h4>{title}</h4>
        {hint && <p className="hint ads-form__section-hint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function adTypeLabel(id) {
  return AD_TYPES.find((t) => t.id === id)?.label || id;
}

function adTypeHint(id) {
  return AD_TYPES.find((t) => t.id === id)?.hint || '';
}

function statusLabel(id) {
  return CAMPAIGN_STATUSES.find((s) => s.id === id)?.label || id;
}

function formatDateShort(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return day && m && y ? `${day}.${m}.${y}` : s;
}

function audienceSummaryText(selected, totalCount, formatLabel) {
  if (!selected?.length) {
    return 'Не выбрано — реклама будет показана всем пользователям приложения';
  }
  if (selected.length >= totalCount) {
    return `Выбраны все (${selected.length}) — только эта группа`;
  }
  const names = selected.map(formatLabel).join(', ');
  return `Выбрано ${selected.length} из ${totalCount}: ${names}`;
}

function AudienceChip({ label, selected, onToggle }) {
  return (
    <button
      type="button"
      className={`ads-audience-chip${selected ? ' ads-audience-chip--on' : ''}`}
      aria-pressed={selected}
      onClick={onToggle}
    >
      {selected && <span className="ads-audience-chip__check" aria-hidden>✓</span>}
      {label}
    </button>
  );
}

function CampaignCard({ campaign, onEdit, onDelete, onSendPush, sendingPushId }) {
  const cities = (campaign.audience_cities || []).join(', ') || 'Все города';
  const levels =
    (campaign.audience_levels || []).map((l) => LEVELS.find((x) => x.id === l)?.label || l).join(', ') ||
    'Все уровни';
  const budgetLeft = Math.max(0, Number(campaign.budget) - Number(campaign.spent || 0));

  return (
    <article className="glass-card ads-campaign-card">
      <div className="ads-campaign-card__head">
        <div>
          <span className="ads-campaign-card__id">#{campaign.id}</span>
          <h3 className="ads-campaign-card__title">{campaign.title}</h3>
        </div>
        <span className={`chip ads-campaign-card__status ads-campaign-card__status--${campaign.status}`}>
          {statusLabel(campaign.status)}
        </span>
      </div>
      {campaign.banner_url && (
        <div className="ads-banner-preview ads-banner-preview--card">
          <img src={campaign.banner_url} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>
      )}
      <dl className="ads-detail-list">
        <div>
          <dt>Рекламодатель</dt>
          <dd>{campaign.advertiser_name || '—'}</dd>
        </div>
        <div>
          <dt>Тип</dt>
          <dd>{adTypeLabel(campaign.ad_type)}</dd>
        </div>
        {campaign.tariff_name && (
          <div>
            <dt>Тариф</dt>
            <dd>
              {campaign.tariff_name} · {campaign.tariff_days} дн. · {formatMoney(campaign.tariff_price)}
            </dd>
          </div>
        )}
        <div>
          <dt>Период</dt>
          <dd>
            {formatDateShort(campaign.start_date)} — {formatDateShort(campaign.end_date)}
          </dd>
        </div>
        <div>
          <dt>Бюджет</dt>
          <dd>
            {formatMoney(campaign.budget)} · потрачено {formatMoney(campaign.spent)} · остаток{' '}
            {formatMoney(budgetLeft)}
          </dd>
        </div>
        <div>
          <dt>Аудитория</dt>
          <dd>
            <span className="ads-detail-list__sub">Города: {cities}</span>
            <span className="ads-detail-list__sub">Уровни: {levels}</span>
          </dd>
        </div>
        {campaign.target_url && (
          <div>
            <dt>Ссылка</dt>
            <dd className="ads-detail-list__link">{campaign.target_url}</dd>
          </div>
        )}
        {campaign.description && (
          <div className="ads-detail-list__full">
            <dt>Описание</dt>
            <dd>{campaign.description}</dd>
          </div>
        )}
      </dl>
      <div className="entity-card__actions ads-campaign-card__actions">
        {campaign.ad_type === 'push' && onSendPush && (
          <button
            type="button"
            className="btn btn--sm btn--primary"
            disabled={sendingPushId === campaign.id}
            onClick={() => onSendPush(campaign)}
          >
            {sendingPushId === campaign.id ? 'Отправка…' : 'Отправить push'}
          </button>
        )}
        <button type="button" className="btn btn--sm" onClick={() => onEdit(campaign)}>
          Изменить
        </button>
        {onDelete && (
          <button type="button" className="btn btn--sm btn--danger" onClick={() => onDelete(campaign)}>
            Удалить
          </button>
        )}
      </div>
    </article>
  );
}

export default function AdsTab() {
  const [section, setSection] = useState('dashboard');
  const [period, setPeriod] = useState('30d');
  const [dashboard, setDashboard] = useState(null);
  const [advertisers, setAdvertisers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [campaignTariffs, setCampaignTariffs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingPushId, setSendingPushId] = useState(null);
  const [advForm, setAdvForm] = useState(emptyAdvertiser);
  const [campForm, setCampForm] = useState(emptyCampaign);
  const [tariffForm, setTariffForm] = useState(emptyTariff);
  const [editAdvId, setEditAdvId] = useState(null);
  const [editCampId, setEditCampId] = useState(null);
  const [editTariffId, setEditTariffId] = useState(null);
  const [settingsForm, setSettingsForm] = useState(EMPTY_SETTINGS);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = periodQuery(period);
      if (section === 'dashboard') {
        setDashboard(await adminApi(`/api/admin/ads/dashboard?${q}`));
      } else if (section === 'settings') {
        const data = await adminApi('/api/admin/ads/settings');
        const s = data.settings || {};
        setSettingsForm({
          ...EMPTY_SETTINGS,
          ...s,
          impression_cost: String(s.impression_cost ?? EMPTY_SETTINGS.impression_cost),
        });
      } else if (section === 'advertisers') {
        setAdvertisers(await adminApi('/api/admin/ads/advertisers'));
      } else if (section === 'campaigns') {
        const [c, a, t] = await Promise.all([
          adminApi('/api/admin/ads/campaigns'),
          adminApi('/api/admin/ads/advertisers'),
          adminApi('/api/admin/ads/tariffs'),
        ]);
        setCampaigns(c);
        setAdvertisers(a);
        setCampaignTariffs(t);
      } else if (section === 'statistics') {
        setStats(await adminApi(`/api/admin/ads/statistics?${q}`));
      } else if (section === 'payments') {
        setPayments(await adminApi('/api/admin/ads/payments'));
      } else if (section === 'tariffs') {
        setTariffs(await adminApi('/api/admin/ads/tariffs?all=1'));
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

  const resetCampaignForm = () => {
    setCampForm(emptyCampaign);
    setEditCampId(null);
  };

  const resetAdvertiserForm = () => {
    setAdvForm(emptyAdvertiser);
    setEditAdvId(null);
  };

  const saveAdvertiser = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...advForm, balance: Number(advForm.balance) };
      if (editAdvId) {
        await adminApi(`/api/admin/ads/advertisers/${editAdvId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await adminApi('/api/admin/ads/advertisers', { method: 'POST', body: JSON.stringify(body) });
      }
      resetAdvertiserForm();
      load();
    } catch (err) {
      alert(err.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await adminApi('/api/admin/ads/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...settingsForm,
          impression_cost: Number(settingsForm.impression_cost),
        }),
      });
      const s = data.settings || {};
      setSettingsForm({
        ...EMPTY_SETTINGS,
        ...s,
        impression_cost: String(s.impression_cost ?? EMPTY_SETTINGS.impression_cost),
      });
      alert(data.message || 'Настройки сохранены');
    } catch (err) {
      alert(err.message || 'Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  const resetTariffForm = () => {
    setTariffForm(emptyTariff);
    setEditTariffId(null);
  };

  const saveTariff = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...tariffForm,
        days: Number(tariffForm.days),
        price: Number(tariffForm.price),
        sort_order: Number(tariffForm.sort_order) || 0,
      };
      if (editTariffId) {
        await adminApi(`/api/admin/ads/tariffs/${editTariffId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await adminApi('/api/admin/ads/tariffs', { method: 'POST', body: JSON.stringify(body) });
      }
      resetTariffForm();
      load();
    } catch (err) {
      alert(err.message || 'Не удалось сохранить тариф');
    } finally {
      setSaving(false);
    }
  };

  const applyTariffToCampaign = (tariffId) => {
    const t = campaignTariffs.find((x) => String(x.id) === String(tariffId));
    if (!t) return;
    const start = campForm.start_date || todayIso();
    setCampForm({
      ...campForm,
      tariff_id: String(tariffId),
      budget: String(t.price),
      start_date: start,
      end_date: addDaysIso(start, t.days),
    });
  };

  const saveCampaign = async (e) => {
    e.preventDefault();
    if (!campForm.advertiser_id) {
      alert('Выберите рекламодателя');
      return;
    }
    if (ACTIVATION_STATUSES.includes(campForm.status) && !campForm.tariff_id) {
      alert('Для активации выберите тариф');
      return;
    }
    if (!campForm.tariff_id && (!campForm.start_date || !campForm.end_date)) {
      alert('Укажите даты или выберите тариф');
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...campForm,
        advertiser_id: Number(campForm.advertiser_id),
        tariff_id: campForm.tariff_id ? Number(campForm.tariff_id) : null,
        budget: Number(campForm.budget) || 0,
      };
      if (editCampId) {
        await adminApi(`/api/admin/ads/campaigns/${editCampId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await adminApi('/api/admin/ads/campaigns', { method: 'POST', body: JSON.stringify(body) });
      }
      resetCampaignForm();
      load();
    } catch (err) {
      alert(err.message || 'Не удалось сохранить кампанию');
    } finally {
      setSaving(false);
    }
  };

  const toggleAudience = (field, value) => {
    const arr = campForm[field] || [];
    const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
    setCampForm({ ...campForm, [field]: next });
  };

  const selectAllAudience = (field, values) => {
    const arr = campForm[field] || [];
    const allSelected = values.every((v) => arr.includes(v));
    setCampForm({ ...campForm, [field]: allSelected ? [] : [...values] });
  };

  const sendPushCampaign = async (campaign) => {
    if (
      !confirm(
        `Отправить push «${campaign.title}»?\n\nАудитория: города и уровни из кампании. Пользователи без разрешения на уведомления не получат сообщение.`
      )
    ) {
      return;
    }
    setSendingPushId(campaign.id);
    try {
      const data = await adminApi(`/api/admin/ads/campaigns/${campaign.id}/send-push`, {
        method: 'POST',
        body: '{}',
      });
      alert(data.message || `Отправлено: ${data.sent}`);
    } catch (err) {
      alert(err.message || 'Не удалось отправить push');
    } finally {
      setSendingPushId(null);
    }
  };

  const deleteCampaign = async (campaign) => {
    if (
      !confirm(
        `Удалить кампанию «${campaign.title}» (#${campaign.id})?\n\nСтатистика показов будет удалена. Это действие нельзя отменить.`
      )
    ) {
      return;
    }
    try {
      await adminApi(`/api/admin/ads/campaigns/${campaign.id}`, { method: 'DELETE' });
      if (editCampId === campaign.id) resetCampaignForm();
      load();
    } catch (err) {
      alert(err.message || 'Не удалось удалить кампанию');
    }
  };

  const editCampaign = (c) => {
    setEditCampId(c.id);
    setCampForm({
      advertiser_id: String(c.advertiser_id),
      tariff_id: c.tariff_id ? String(c.tariff_id) : '',
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const selectedAdType = AD_TYPES.find((t) => t.id === campForm.ad_type);
  const needsTariff = ACTIVATION_STATUSES.includes(campForm.status);
  const selectedTariff = campaignTariffs.find((t) => String(t.id) === String(campForm.tariff_id));

  return (
    <div className="page-content ads-page">
      <header className="ads-page__header">
        <div>
          <h2>Реклама</h2>
          <p className="hint">Кампании, рекламодатели, статистика показов и оплаты</p>
        </div>
      </header>

      <nav className="reports-subnav" aria-label="Разделы рекламы">
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
        <div className="bento-grid bento-grid--stats report-stat-grid">
          {[
            { label: 'Активные кампании', value: formatNumber(dashboard.cards?.active_campaigns), hint: 'Со статусом «Активна»' },
            { label: 'Доход от рекламы', value: formatMoney(dashboard.cards?.ad_revenue), hint: 'За выбранный период' },
            { label: 'Показы', value: formatNumber(dashboard.cards?.impressions), hint: 'Просмотры баннеров' },
            { label: 'Клики', value: formatNumber(dashboard.cards?.clicks), hint: 'Переходы по ссылке' },
            { label: 'CTR', value: `${dashboard.cards?.ctr ?? 0}%`, hint: 'Клики / показы' },
          ].map((item) => (
            <div key={item.label} className="glass-card stat-card">
              <p className="stat-card__label">{item.label}</p>
              <h3 className="stat-card__value">{item.value}</h3>
              <p className="hint stat-card__footnote">{item.hint}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && section === 'settings' && (
        <form className="ads-form settings-form glass-card card" onSubmit={saveSettings}>
          <header className="ads-form__head">
            <h3>Настройки рекламы</h3>
          </header>

          <FormSection
            title="Партнёрские баннеры"
            hint="Кампании рекламодателей RunBonus в приложении (главная, после тренировки, магазин)"
          >
            <label className="settings-form__checkbox">
              <input
                type="checkbox"
                checked={settingsForm.partner_ads_enabled}
                onChange={(e) => setSettingsForm({ ...settingsForm, partner_ads_enabled: e.target.checked })}
              />
              {' '}Показывать баннеры партнёров в приложении
            </label>
            <label>
              Списание с бюджета за показ (TJS)
              <input
                type="number"
                min="0"
                step="0.01"
                value={settingsForm.impression_cost}
                onChange={(e) => setSettingsForm({ ...settingsForm, impression_cost: e.target.value })}
              />
              <span className="ads-field-hint">Сумма, которая списывается с бюджета кампании за каждый показ</span>
            </label>
          </FormSection>

          <FormSection
            title="Google AdMob"
            hint="Реклама Google и Google Play в мобильном приложении. ID из admob.google.com"
          >
            <label className="settings-form__checkbox">
              <input
                type="checkbox"
                checked={settingsForm.admob_enabled}
                onChange={(e) => setSettingsForm({ ...settingsForm, admob_enabled: e.target.checked })}
              />
              {' '}AdMob включён в приложении
            </label>
            <label className="settings-form__checkbox">
              <input
                type="checkbox"
                checked={settingsForm.admob_test_mode}
                onChange={(e) => setSettingsForm({ ...settingsForm, admob_test_mode: e.target.checked })}
              />
              {' '}Тестовые объявления (для отладки)
            </label>
            <label>
              AdMob App ID
              <input
                value={settingsForm.admob_app_id}
                onChange={(e) => setSettingsForm({ ...settingsForm, admob_app_id: e.target.value })}
                placeholder="ca-app-pub-XXXXXXXX~YYYYYYYY"
              />
            </label>
            <p className="hint ads-form__section-hint">Google Ads — блоки на страницах</p>
            <div className="ads-form__row">
              <label>
                Главная
                <input
                  value={settingsForm.admob_google_home}
                  onChange={(e) => setSettingsForm({ ...settingsForm, admob_google_home: e.target.value })}
                  placeholder="ca-app-pub-…/…"
                />
              </label>
              <label>
                После тренировки
                <input
                  value={settingsForm.admob_google_workout}
                  onChange={(e) => setSettingsForm({ ...settingsForm, admob_google_workout: e.target.value })}
                  placeholder="ca-app-pub-…/…"
                />
              </label>
            </div>
            <label>
              Магазин
              <input
                value={settingsForm.admob_google_shop}
                onChange={(e) => setSettingsForm({ ...settingsForm, admob_google_shop: e.target.value })}
                placeholder="ca-app-pub-…/…"
              />
            </label>
            <p className="hint ads-form__section-hint">Google Play — блоки на страницах</p>
            <div className="ads-form__row">
              <label>
                Главная
                <input
                  value={settingsForm.admob_play_home}
                  onChange={(e) => setSettingsForm({ ...settingsForm, admob_play_home: e.target.value })}
                  placeholder="ca-app-pub-…/…"
                />
              </label>
              <label>
                После тренировки
                <input
                  value={settingsForm.admob_play_workout}
                  onChange={(e) => setSettingsForm({ ...settingsForm, admob_play_workout: e.target.value })}
                  placeholder="ca-app-pub-…/…"
                />
              </label>
            </div>
            <label>
              Магазин
              <input
                value={settingsForm.admob_play_shop}
                onChange={(e) => setSettingsForm({ ...settingsForm, admob_play_shop: e.target.value })}
                placeholder="ca-app-pub-…/…"
              />
            </label>
          </FormSection>

          <div className="ads-form__footer">
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить настройки'}
            </button>
          </div>
        </form>
      )}

      {!loading && section === 'advertisers' && (
        <div className="ads-editor">
          <aside className="ads-editor__panel">
            <form className="ads-form settings-form glass-card card" onSubmit={saveAdvertiser}>
              <header className="ads-form__head">
                <h3>{editAdvId ? `Рекламодатель #${editAdvId}` : 'Новый рекламодатель'}</h3>
                {editAdvId && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={resetAdvertiserForm}>
                    Отмена
                  </button>
                )}
              </header>
              <FormSection title="Компания" hint="Юридическое или торговое название партнёра">
                <label>
                  Название компании *
                  <input
                    value={advForm.company_name}
                    onChange={(e) => setAdvForm({ ...advForm, company_name: e.target.value })}
                    placeholder="ООО «Спорт Маркет»"
                    required
                  />
                </label>
                <label>
                  Контактное лицо
                  <input
                    value={advForm.contact_name}
                    onChange={(e) => setAdvForm({ ...advForm, contact_name: e.target.value })}
                    placeholder="ФИО менеджера"
                  />
                </label>
              </FormSection>
              <FormSection title="Контакты">
                <div className="ads-form__row">
                  <label>
                    Телефон
                    <input
                      type="tel"
                      value={advForm.phone}
                      onChange={(e) => setAdvForm({ ...advForm, phone: e.target.value })}
                      placeholder="+992 …"
                    />
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={advForm.email}
                      onChange={(e) => setAdvForm({ ...advForm, email: e.target.value })}
                      placeholder="info@company.tj"
                    />
                  </label>
                </div>
                <label>
                  Адрес
                  <input
                    value={advForm.address}
                    onChange={(e) => setAdvForm({ ...advForm, address: e.target.value })}
                    placeholder="Город, улица"
                  />
                </label>
              </FormSection>
              <FormSection title="Баланс и статус">
                <div className="ads-form__row">
                  <label>
                    Баланс (TJS)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={advForm.balance}
                      onChange={(e) => setAdvForm({ ...advForm, balance: e.target.value })}
                    />
                  </label>
                  <label>
                    Статус
                    <select
                      value={advForm.status}
                      onChange={(e) => setAdvForm({ ...advForm, status: e.target.value })}
                    >
                      <option value="active">Активен</option>
                      <option value="inactive">Отключён</option>
                    </select>
                  </label>
                </div>
              </FormSection>
              <div className="ads-form__footer">
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </form>
          </aside>
          <div className="ads-editor__list">
            <h3 className="ads-list__title">Рекламодатели ({advertisers.length})</h3>
            {!advertisers.length && <p className="hint">Добавьте первого рекламодателя слева</p>}
            <div className="ads-cards-grid">
              {advertisers.map((a) => (
                <article key={a.id} className="glass-card ads-campaign-card">
                  <div className="ads-campaign-card__head">
                    <h3>{a.company_name}</h3>
                    <span className={`chip${a.status === 'active' ? '' : ' entity-card__status--muted'}`}>
                      {a.status === 'active' ? 'Активен' : 'Выкл'}
                    </span>
                  </div>
                  <dl className="ads-detail-list">
                    {a.contact_name && (
                      <div>
                        <dt>Контакт</dt>
                        <dd>{a.contact_name}</dd>
                      </div>
                    )}
                    {a.phone && (
                      <div>
                        <dt>Телефон</dt>
                        <dd>{a.phone}</dd>
                      </div>
                    )}
                    {a.email && (
                      <div>
                        <dt>Email</dt>
                        <dd>{a.email}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Баланс</dt>
                      <dd>{formatMoney(a.balance)}</dd>
                    </div>
                  </dl>
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
        </div>
      )}

      {!loading && section === 'campaigns' && (
        <div className="ads-editor">
          <aside className="ads-editor__panel">
            <form className="ads-form settings-form glass-card card" onSubmit={saveCampaign}>
              <header className="ads-form__head">
                <h3>{editCampId ? `Кампания #${editCampId}` : 'Новая кампания'}</h3>
                {editCampId && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={resetCampaignForm}>
                    Отмена
                  </button>
                )}
              </header>

              <FormSection title="Основное" hint="Кому принадлежит кампания и как она называется в админке">
                <label>
                  Рекламодатель *
                  <select
                    value={campForm.advertiser_id}
                    onChange={(e) => setCampForm({ ...campForm, advertiser_id: e.target.value })}
                    required
                  >
                    <option value="">— выберите —</option>
                    {advertisers.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.company_name}
                        {a.balance > 0 ? ` · баланс ${formatMoney(a.balance)}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {!advertisers.length && (
                  <p className="hint ads-form__warn">Сначала добавьте рекламодателя во вкладке «Рекламодатели»</p>
                )}
                <label>
                  Название кампании *
                  <input
                    value={campForm.title}
                    onChange={(e) => setCampForm({ ...campForm, title: e.target.value })}
                    placeholder="Летняя акция Runner Pro"
                    required
                  />
                </label>
                <label>
                  Описание (для админки)
                  <textarea
                    rows={3}
                    value={campForm.description}
                    onChange={(e) => setCampForm({ ...campForm, description: e.target.value })}
                    placeholder="Кратко: цель, оффер, примечания для менеджера"
                  />
                </label>
                <label>
                  Тип размещения
                  <select
                    value={campForm.ad_type}
                    onChange={(e) => setCampForm({ ...campForm, ad_type: e.target.value })}
                  >
                    {AD_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {selectedAdType?.hint && <span className="ads-field-hint">{selectedAdType.hint}</span>}
                </label>
              </FormSection>

              <FormSection title="Креатив" hint="Изображение и ссылка при клике">
                <label>
                  URL баннера
                  <input
                    type="url"
                    value={campForm.banner_url}
                    onChange={(e) => setCampForm({ ...campForm, banner_url: e.target.value })}
                    placeholder="https://…/banner.jpg"
                  />
                  <span className="ads-field-hint">Рекомендуемый размер: 1080×400 px, JPG или PNG</span>
                </label>
                {campForm.banner_url?.trim() && (
                  <div className="ads-banner-preview">
                    <img
                      src={campForm.banner_url.trim()}
                      alt="Превью баннера"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <label>
                  Ссылка при клике
                  <input
                    type="url"
                    value={campForm.target_url}
                    onChange={(e) => setCampForm({ ...campForm, target_url: e.target.value })}
                    placeholder="https://partner.tj/promo"
                  />
                </label>
              </FormSection>

              <FormSection
                title="Тариф"
                hint={
                  needsTariff
                    ? 'Обязательно при статусе «Активна» или «Ожидает оплаты». Подставляет срок и цену.'
                    : 'Можно выбрать заранее — даты и бюджет заполнятся автоматически'
                }
              >
                {!campaignTariffs.length ? (
                  <p className="ads-form__warn">
                    Нет активных тарифов. Добавьте тариф во вкладке «Тарифы».
                  </p>
                ) : (
                  <div className="ads-tariff-picker">
                    {campaignTariffs.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`ads-tariff-option${String(campForm.tariff_id) === String(t.id) ? ' ads-tariff-option--on' : ''}`}
                        onClick={() => applyTariffToCampaign(t.id)}
                      >
                        <span className="ads-tariff-option__name">{t.name}</span>
                        <span className="ads-tariff-option__meta">
                          {t.days} дн. · {formatMoney(t.price)}
                        </span>
                        {String(campForm.tariff_id) === String(t.id) && (
                          <span className="ads-tariff-option__badge">Выбран</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {selectedTariff && (
                  <p className="ads-selection-summary ads-selection-summary--active">
                    Тариф «{selectedTariff.name}»: {selectedTariff.days} дней, стоимость{' '}
                    {formatMoney(selectedTariff.price)}
                  </p>
                )}
                {needsTariff && !campForm.tariff_id && (
                  <p className="ads-form__warn">Выберите тариф перед активацией</p>
                )}
              </FormSection>

              <FormSection title="Период и бюджет" hint="Заполняются из тарифа или вручную">
                <div className="ads-form__dates">
                  <label>
                    Дата начала *
                    <input
                      type="date"
                      value={campForm.start_date}
                      onChange={(e) => {
                        const start = e.target.value;
                        const next = { ...campForm, start_date: start };
                        if (selectedTariff && start) {
                          next.end_date = addDaysIso(start, selectedTariff.days);
                        }
                        setCampForm(next);
                      }}
                      required
                    />
                  </label>
                  <label>
                    Дата окончания *
                    <input
                      type="date"
                      value={campForm.end_date}
                      onChange={(e) => setCampForm({ ...campForm, end_date: e.target.value })}
                      required
                    />
                  </label>
                </div>
                <label>
                  Бюджет кампании (TJS)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={campForm.budget}
                    onChange={(e) => setCampForm({ ...campForm, budget: e.target.value })}
                    placeholder="300"
                    readOnly={Boolean(campForm.tariff_id)}
                  />
                  <span className="ads-field-hint">
                    {campForm.tariff_id
                      ? 'Сумма из выбранного тарифа'
                      : 'Списывается по мере показов'}
                  </span>
                </label>
              </FormSection>

              <FormSection
                title="Аудитория"
                hint="Пустой выбор = показ всем пользователям в приложении"
              >
                <div className="ads-chip-block">
                  <div className="ads-chip-block__head">
                    <span className="ads-chip-block__label">Города</span>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => selectAllAudience('audience_cities', CITIES)}
                    >
                      {(campForm.audience_cities || []).length === CITIES.length ? 'Сбросить' : 'Все города'}
                    </button>
                  </div>
                  <div className="ads-chip-group">
                    {CITIES.map((c) => (
                      <AudienceChip
                        key={c}
                        label={c}
                        selected={(campForm.audience_cities || []).includes(c)}
                        onToggle={() => toggleAudience('audience_cities', c)}
                      />
                    ))}
                  </div>
                  <p
                    className={`ads-selection-summary${(campForm.audience_cities || []).length ? ' ads-selection-summary--active' : ''}`}
                  >
                    {audienceSummaryText(campForm.audience_cities, CITIES.length, (c) => c)}
                  </p>
                </div>
                <div className="ads-chip-block">
                  <div className="ads-chip-block__head">
                    <span className="ads-chip-block__label">Уровни клиентов</span>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() =>
                        selectAllAudience(
                          'audience_levels',
                          LEVELS.map((l) => l.id)
                        )
                      }
                    >
                      {(campForm.audience_levels || []).length === LEVELS.length ? 'Сбросить' : 'Все уровни'}
                    </button>
                  </div>
                  <div className="ads-chip-group">
                    {LEVELS.map((l) => (
                      <AudienceChip
                        key={l.id}
                        label={l.label}
                        selected={(campForm.audience_levels || []).includes(l.id)}
                        onToggle={() => toggleAudience('audience_levels', l.id)}
                      />
                    ))}
                  </div>
                  <p
                    className={`ads-selection-summary${(campForm.audience_levels || []).length ? ' ads-selection-summary--active' : ''}`}
                  >
                    {audienceSummaryText(
                      (campForm.audience_levels || []).map(
                        (id) => LEVELS.find((l) => l.id === id)?.label || id
                      ),
                      LEVELS.length,
                      (x) => x
                    )}
                  </p>
                </div>
              </FormSection>

              <FormSection title="Статус публикации">
                <label>
                  Статус
                  <select
                    value={campForm.status}
                    onChange={(e) => {
                      const status = e.target.value;
                      setCampForm({ ...campForm, status });
                    }}
                  >
                    {CAMPAIGN_STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <span className="ads-field-hint">
                    {CAMPAIGN_STATUSES.find((s) => s.id === campForm.status)?.hint}
                  </span>
                </label>
              </FormSection>

              <div className="ads-form__footer">
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? 'Сохранение…' : editCampId ? 'Сохранить изменения' : 'Создать кампанию'}
                </button>
              </div>
            </form>
          </aside>

          <div className="ads-editor__list">
            <h3 className="ads-list__title">Кампании ({campaigns.length})</h3>
            {!campaigns.length && <p className="hint">Создайте первую кампанию в форме слева</p>}
            <div className="ads-cards-grid">
              {campaigns.map((c) => (
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  onEdit={editCampaign}
                  onDelete={deleteCampaign}
                  onSendPush={sendPushCampaign}
                  sendingPushId={sendingPushId}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && section === 'statistics' && stats && (
        <>
          <div className="bento-grid bento-grid--stats report-stat-grid" style={{ marginBottom: 16 }}>
            {[
              { label: 'Показы', value: formatNumber(stats.summary?.impressions) },
              { label: 'Клики', value: formatNumber(stats.summary?.clicks) },
              { label: 'CTR', value: `${stats.summary?.ctr ?? 0}%` },
              { label: 'Активных кампаний', value: formatNumber(stats.summary?.active_campaigns) },
            ].map((item) => (
              <div key={item.label} className="glass-card stat-card">
                <p className="stat-card__label">{item.label}</p>
                <h3 className="stat-card__value">{item.value}</h3>
              </div>
            ))}
          </div>
          <div className="table-wrap glass-card card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Кампания</th>
                  <th>Тип</th>
                  <th>Показы</th>
                  <th>Клики</th>
                  <th>CTR</th>
                  <th>Бюджет</th>
                  <th>Потрачено</th>
                </tr>
              </thead>
              <tbody>
                {(stats.campaigns || []).map((c) => (
                  <tr key={c.id}>
                    <td>{c.title}</td>
                    <td>{adTypeLabel(c.ad_type)}</td>
                    <td>{formatNumber(c.impressions)}</td>
                    <td>{formatNumber(c.clicks)}</td>
                    <td>{c.ctr}%</td>
                    <td>{formatMoney(c.budget)}</td>
                    <td>{formatMoney(c.spent)}</td>
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
                <th>Кампания</th>
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
                  <td>{p.campaign_title || '—'}</td>
                  <td>{formatMoney(p.amount)}</td>
                  <td>{PAYMENT_STATUSES[p.status] || p.status}</td>
                  <td>{new Date(p.created_at).toLocaleString('ru-RU')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!payments.length && <p className="hint" style={{ padding: 16 }}>Платежей пока нет</p>}
        </div>
      )}

      {!loading && section === 'tariffs' && (
        <div className="ads-editor">
          <aside className="ads-editor__panel">
            <form className="ads-form settings-form glass-card card" onSubmit={saveTariff}>
              <header className="ads-form__head">
                <h3>{editTariffId ? `Тариф #${editTariffId}` : 'Новый тариф'}</h3>
                {editTariffId && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={resetTariffForm}>
                    Отмена
                  </button>
                )}
              </header>
              <FormSection title="Параметры тарифа" hint="Код — латиница, уникальный (например vip30)">
                <label>
                  Код *
                  <input
                    value={tariffForm.code}
                    onChange={(e) => setTariffForm({ ...tariffForm, code: e.target.value })}
                    placeholder="standard"
                    required
                    disabled={Boolean(editTariffId)}
                  />
                </label>
                <label>
                  Название *
                  <input
                    value={tariffForm.name}
                    onChange={(e) => setTariffForm({ ...tariffForm, name: e.target.value })}
                    placeholder="Стандарт"
                    required
                  />
                </label>
                <div className="ads-form__row">
                  <label>
                    Срок (дней) *
                    <input
                      type="number"
                      min="1"
                      value={tariffForm.days}
                      onChange={(e) => setTariffForm({ ...tariffForm, days: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    Цена (TJS) *
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tariffForm.price}
                      onChange={(e) => setTariffForm({ ...tariffForm, price: e.target.value })}
                      required
                    />
                  </label>
                </div>
                <div className="ads-form__row">
                  <label>
                    Порядок
                    <input
                      type="number"
                      value={tariffForm.sort_order}
                      onChange={(e) => setTariffForm({ ...tariffForm, sort_order: e.target.value })}
                    />
                  </label>
                  <label>
                    Статус
                    <select
                      value={tariffForm.status}
                      onChange={(e) => setTariffForm({ ...tariffForm, status: e.target.value })}
                    >
                      <option value="active">Активен — доступен при активации</option>
                      <option value="inactive">Отключён</option>
                    </select>
                  </label>
                </div>
              </FormSection>
              <div className="ads-form__footer">
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? 'Сохранение…' : editTariffId ? 'Сохранить' : 'Добавить тариф'}
                </button>
              </div>
            </form>
          </aside>
          <div className="ads-editor__list">
            <h3 className="ads-list__title">Тарифы ({tariffs.length})</h3>
            <div className="ads-cards-grid ads-tariffs-grid">
              {tariffs.map((t) => (
                <article key={t.id} className="glass-card ads-tariff-card">
                  <div className="ads-campaign-card__head">
                    <h3>{t.name}</h3>
                    <span className={`chip${t.status === 'active' ? '' : ' entity-card__status--muted'}`}>
                      {t.status === 'active' ? 'Активен' : 'Выкл'}
                    </span>
                  </div>
                  <p className="hint">Код: {t.code}</p>
                  <dl className="ads-detail-list">
                    <div>
                      <dt>Срок</dt>
                      <dd>{t.days} дней</dd>
                    </div>
                    <div>
                      <dt>Цена</dt>
                      <dd className="stat-card__value" style={{ fontSize: '1.25rem' }}>
                        {formatMoney(t.price)}
                      </dd>
                    </div>
                    <div>
                      <dt>В день</dt>
                      <dd>{formatMoney(t.days ? t.price / t.days : t.price)}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => {
                      setEditTariffId(t.id);
                      setTariffForm({
                        code: t.code,
                        name: t.name,
                        days: String(t.days),
                        price: String(t.price),
                        sort_order: String(t.sort_order ?? 0),
                        status: t.status,
                      });
                    }}
                  >
                    Изменить
                  </button>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
