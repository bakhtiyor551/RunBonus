import { pool } from '../db.js';
import { parseReportPeriod, sqlBetween } from '../utils/reportPeriod.js';

let adsReady = null;
let adSettingsReady = null;

const DEFAULT_AD_SETTINGS = {
  partner_ads_enabled: true,
  impression_cost: 0.01,
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

function mapAdSettings(row) {
  if (!row) return { ...DEFAULT_AD_SETTINGS };
  return {
    partner_ads_enabled: Boolean(row.partner_ads_enabled),
    impression_cost: Number(row.impression_cost) || 0.01,
    admob_enabled: Boolean(row.admob_enabled),
    admob_test_mode: Boolean(row.admob_test_mode),
    admob_app_id: row.admob_app_id?.trim() || '',
    admob_google_home: row.admob_google_home?.trim() || '',
    admob_google_workout: row.admob_google_workout?.trim() || '',
    admob_google_shop: row.admob_google_shop?.trim() || '',
    admob_play_home: row.admob_play_home?.trim() || '',
    admob_play_workout: row.admob_play_workout?.trim() || '',
    admob_play_shop: row.admob_play_shop?.trim() || '',
  };
}

async function hasAdSettingsTable() {
  if (adSettingsReady != null) return adSettingsReady;
  try {
    await pool.query(`SELECT 1 FROM ad_settings LIMIT 1`);
    adSettingsReady = true;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') adSettingsReady = false;
    else throw e;
  }
  return adSettingsReady;
}

export async function getAdSettings() {
  if (!(await hasAdSettingsTable())) return { ...DEFAULT_AD_SETTINGS };
  const [rows] = await pool.query(`SELECT * FROM ad_settings WHERE id = 1`);
  return mapAdSettings(rows[0]);
}

export async function updateAdSettings(data) {
  if (!(await hasAdSettingsTable())) {
    throw Object.assign(new Error('Запустите миграцию 024_ad_settings.sql'), { status: 503 });
  }
  const current = await getAdSettings();
  const next = {
    partner_ads_enabled: data.partner_ads_enabled ?? current.partner_ads_enabled,
    impression_cost: Math.max(0, Number(data.impression_cost ?? current.impression_cost) || 0),
    admob_enabled: data.admob_enabled ?? current.admob_enabled,
    admob_test_mode: data.admob_test_mode ?? current.admob_test_mode,
    admob_app_id: data.admob_app_id?.trim() ?? current.admob_app_id,
    admob_google_home: data.admob_google_home?.trim() ?? current.admob_google_home,
    admob_google_workout: data.admob_google_workout?.trim() ?? current.admob_google_workout,
    admob_google_shop: data.admob_google_shop?.trim() ?? current.admob_google_shop,
    admob_play_home: data.admob_play_home?.trim() ?? current.admob_play_home,
    admob_play_workout: data.admob_play_workout?.trim() ?? current.admob_play_workout,
    admob_play_shop: data.admob_play_shop?.trim() ?? current.admob_play_shop,
  };

  await pool.query(
    `UPDATE ad_settings SET
      partner_ads_enabled = ?,
      impression_cost = ?,
      admob_enabled = ?,
      admob_test_mode = ?,
      admob_app_id = ?,
      admob_google_home = ?,
      admob_google_workout = ?,
      admob_google_shop = ?,
      admob_play_home = ?,
      admob_play_workout = ?,
      admob_play_shop = ?
     WHERE id = 1`,
    [
      next.partner_ads_enabled ? 1 : 0,
      next.impression_cost,
      next.admob_enabled ? 1 : 0,
      next.admob_test_mode ? 1 : 0,
      next.admob_app_id || null,
      next.admob_google_home || null,
      next.admob_google_workout || null,
      next.admob_google_shop || null,
      next.admob_play_home || null,
      next.admob_play_workout || null,
      next.admob_play_shop || null,
    ]
  );
  return getAdSettings();
}

/** Публичная конфигурация AdMob для мобильного приложения. */
export async function getMobileAdConfig() {
  const settings = await getAdSettings();
  return {
    admob_enabled: settings.admob_enabled,
    admob_test_mode: settings.admob_test_mode,
    admob_app_id: settings.admob_app_id,
    units: {
      google: {
        home: settings.admob_google_home,
        workout: settings.admob_google_workout,
        shop: settings.admob_google_shop,
      },
      play: {
        home: settings.admob_play_home,
        workout: settings.admob_play_workout,
        shop: settings.admob_play_shop,
      },
    },
    partner_ads_enabled: settings.partner_ads_enabled,
  };
}

async function hasAdsTables() {
  if (adsReady != null) return adsReady;
  try {
    await pool.query(`SELECT 1 FROM advertisers LIMIT 1`);
    adsReady = true;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') adsReady = false;
    else throw e;
  }
  return adsReady;
}

function parseJsonArray(val) {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  try {
    return JSON.parse(val);
  } catch {
    return [];
  }
}

function mapCampaign(row) {
  return {
    ...row,
    tariff_id: row.tariff_id != null ? Number(row.tariff_id) : null,
    tariff_name: row.tariff_name || null,
    tariff_days: row.tariff_days != null ? Number(row.tariff_days) : null,
    tariff_price: row.tariff_price != null ? Number(row.tariff_price) : null,
    audience_cities: parseJsonArray(row.audience_cities),
    audience_levels: parseJsonArray(row.audience_levels),
    audience_activity: parseJsonArray(row.audience_activity),
    budget: Number(row.budget),
    spent: Number(row.spent),
  };
}

function addDaysIso(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + Number(days) || 0);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const ACTIVATION_STATUSES = new Set(['active', 'pending_payment']);

async function getTariffById(tariffId) {
  if (!tariffId) return null;
  const [rows] = await pool.query(`SELECT * FROM ad_tariffs WHERE id = ?`, [tariffId]);
  if (!rows.length) return null;
  return { ...rows[0], price: Number(rows[0].price), days: Number(rows[0].days) };
}

export async function listAdvertisers() {
  if (!(await hasAdsTables())) return [];
  const [rows] = await pool.query(`SELECT * FROM advertisers ORDER BY id DESC`);
  return rows.map((r) => ({ ...r, balance: Number(r.balance) }));
}

export async function saveAdvertiser(data, id = null) {
  if (!(await hasAdsTables())) throw Object.assign(new Error('Таблицы рекламы не созданы. Запустите миграцию 022.'), { status: 503 });
  const { company_name, contact_name, phone, email, address, balance, status } = data;
  if (!company_name?.trim()) throw Object.assign(new Error('Укажите название компании'), { status: 400 });

  if (id) {
    await pool.query(
      `UPDATE advertisers SET company_name=?, contact_name=?, phone=?, email=?, address=?, balance=?, status=? WHERE id=?`,
      [
        company_name.trim(),
        contact_name?.trim() || null,
        phone?.trim() || null,
        email?.trim() || null,
        address?.trim() || null,
        Number(balance) || 0,
        status || 'active',
        id,
      ]
    );
    const [rows] = await pool.query(`SELECT * FROM advertisers WHERE id = ?`, [id]);
    return { ...rows[0], balance: Number(rows[0].balance) };
  }

  const [r] = await pool.query(
    `INSERT INTO advertisers (company_name, contact_name, phone, email, address, balance, status)
     VALUES (?,?,?,?,?,?,?)`,
    [
      company_name.trim(),
      contact_name?.trim() || null,
      phone?.trim() || null,
      email?.trim() || null,
      address?.trim() || null,
      Number(balance) || 0,
      status || 'active',
    ]
  );
  const [rows] = await pool.query(`SELECT * FROM advertisers WHERE id = ?`, [r.insertId]);
  return { ...rows[0], balance: Number(rows[0].balance) };
}

export async function listCampaigns() {
  if (!(await hasAdsTables())) return [];
  const [rows] = await pool.query(
    `SELECT c.*, a.company_name AS advertiser_name,
            t.name AS tariff_name, t.days AS tariff_days, t.price AS tariff_price
     FROM ad_campaigns c
     JOIN advertisers a ON a.id = c.advertiser_id
     LEFT JOIN ad_tariffs t ON t.id = c.tariff_id
     ORDER BY c.id DESC`
  );
  return rows.map(mapCampaign);
}

export async function saveCampaign(data, id = null) {
  if (!(await hasAdsTables())) throw Object.assign(new Error('Таблицы рекламы не созданы'), { status: 503 });
  const {
    advertiser_id,
    title,
    description,
    ad_type,
    banner_url,
    target_url,
    audience_cities,
    audience_levels,
    audience_activity,
    start_date,
    end_date,
    budget,
    status,
    tariff_id,
  } = data;

  if (!advertiser_id || !title?.trim()) {
    throw Object.assign(new Error('Укажите рекламодателя и название'), { status: 400 });
  }

  const nextStatus = status || 'draft';
  let tariffId = tariff_id ? Number(tariff_id) : null;

  if (ACTIVATION_STATUSES.has(nextStatus)) {
    if (!tariffId) {
      throw Object.assign(new Error('Выберите тариф для активации кампании'), { status: 400 });
    }
    const tariff = await getTariffById(tariffId);
    if (!tariff || tariff.status !== 'active') {
      throw Object.assign(new Error('Тариф не найден или отключён'), { status: 400 });
    }
  } else {
    tariffId = tariffId || null;
  }

  let finalStart = start_date || null;
  let finalEnd = end_date || null;
  let finalBudget = Number(budget) || 0;

  if (tariffId) {
    const tariff = await getTariffById(tariffId);
    if (!tariff) {
      throw Object.assign(new Error('Тариф не найден'), { status: 400 });
    }
    finalBudget = Number(tariff.price);
    if (!finalStart) finalStart = todayIso();
    if (ACTIVATION_STATUSES.has(nextStatus) || !finalEnd) {
      finalEnd = addDaysIso(finalStart, tariff.days);
    }
  }

  if (!finalStart || !finalEnd) {
    throw Object.assign(new Error('Укажите даты кампании или выберите тариф'), { status: 400 });
  }

  if (finalEnd < finalStart) {
    throw Object.assign(new Error('Дата окончания не может быть раньше начала'), { status: 400 });
  }

  const payload = [
    advertiser_id,
    tariffId,
    title.trim(),
    description?.trim() || null,
    ad_type || 'banner_home',
    banner_url?.trim() || null,
    target_url?.trim() || null,
    JSON.stringify(audience_cities || []),
    JSON.stringify(audience_levels || []),
    JSON.stringify(audience_activity || []),
    finalStart,
    finalEnd,
    finalBudget,
    nextStatus,
  ];

  try {
    if (id) {
      await pool.query(
        `UPDATE ad_campaigns SET advertiser_id=?, tariff_id=?, title=?, description=?, ad_type=?, banner_url=?, target_url=?,
         audience_cities=?, audience_levels=?, audience_activity=?, start_date=?, end_date=?, budget=?, status=?
         WHERE id=?`,
        [...payload, id]
      );
    } else {
      const [ins] = await pool.query(
        `INSERT INTO ad_campaigns (advertiser_id, tariff_id, title, description, ad_type, banner_url, target_url,
          audience_cities, audience_levels, audience_activity, start_date, end_date, budget, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        payload
      );
      id = ins.insertId;
    }
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR' && String(e.message).includes('tariff_id')) {
      throw Object.assign(new Error('Запустите миграцию 023_ad_campaign_tariff.sql'), { status: 503 });
    }
    throw e;
  }

  const [rows] = await pool.query(
    `SELECT c.*, a.company_name AS advertiser_name,
            t.name AS tariff_name, t.days AS tariff_days, t.price AS tariff_price
     FROM ad_campaigns c
     JOIN advertisers a ON a.id = c.advertiser_id
     LEFT JOIN ad_tariffs t ON t.id = c.tariff_id
     WHERE c.id = ?`,
    [id]
  );
  return mapCampaign(rows[0]);
}

export async function getCampaignById(id) {
  if (!(await hasAdsTables())) return null;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId) || campaignId <= 0) return null;
  const [rows] = await pool.query(
    `SELECT c.*, a.company_name AS advertiser_name,
            t.name AS tariff_name, t.days AS tariff_days, t.price AS tariff_price
     FROM ad_campaigns c
     JOIN advertisers a ON a.id = c.advertiser_id
     LEFT JOIN ad_tariffs t ON t.id = c.tariff_id
     WHERE c.id = ?`,
    [campaignId]
  );
  return rows.length ? mapCampaign(rows[0]) : null;
}

export async function deleteCampaign(id) {
  if (!(await hasAdsTables())) throw Object.assign(new Error('Таблицы рекламы не созданы'), { status: 503 });
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId) || campaignId <= 0) {
    throw Object.assign(new Error('Некорректный ID кампании'), { status: 400 });
  }

  const [rows] = await pool.query(`SELECT id, title FROM ad_campaigns WHERE id = ?`, [campaignId]);
  if (!rows.length) {
    throw Object.assign(new Error('Кампания не найдена'), { status: 404 });
  }

  await pool.query(`DELETE FROM ad_campaigns WHERE id = ?`, [campaignId]);
  return { ok: true, id: campaignId, title: rows[0].title };
}

export async function listTariffs({ activeOnly = true } = {}) {
  if (!(await hasAdsTables())) return [];
  const sql = activeOnly
    ? `SELECT * FROM ad_tariffs WHERE status = 'active' ORDER BY sort_order, id`
    : `SELECT * FROM ad_tariffs ORDER BY sort_order, id`;
  const [rows] = await pool.query(sql);
  return rows.map((r) => ({ ...r, price: Number(r.price), days: Number(r.days) }));
}

export async function saveTariff(data, id = null) {
  if (!(await hasAdsTables())) throw Object.assign(new Error('Таблицы рекламы не созданы'), { status: 503 });
  const { code, name, days, price, status, sort_order } = data;
  if (!code?.trim() || !name?.trim()) {
    throw Object.assign(new Error('Укажите код и название тарифа'), { status: 400 });
  }
  const daysNum = Math.max(1, Number(days) || 1);
  const priceNum = Math.max(0, Number(price) || 0);
  const sortNum = Number(sort_order) || 0;

  if (id) {
    await pool.query(
      `UPDATE ad_tariffs SET code=?, name=?, days=?, price=?, status=?, sort_order=? WHERE id=?`,
      [code.trim().toLowerCase(), name.trim(), daysNum, priceNum, status || 'active', sortNum, id]
    );
  } else {
    const [ins] = await pool.query(
      `INSERT INTO ad_tariffs (code, name, days, price, status, sort_order) VALUES (?,?,?,?,?,?)`,
      [code.trim().toLowerCase(), name.trim(), daysNum, priceNum, status || 'active', sortNum]
    );
    id = ins.insertId;
  }
  const [rows] = await pool.query(`SELECT * FROM ad_tariffs WHERE id = ?`, [id]);
  return { ...rows[0], price: Number(rows[0].price), days: Number(rows[0].days) };
}

export async function listAdPayments() {
  if (!(await hasAdsTables())) return [];
  const [rows] = await pool.query(
    `SELECT p.*, a.company_name AS advertiser_name, c.title AS campaign_title
     FROM ad_payments p
     JOIN advertisers a ON a.id = p.advertiser_id
     LEFT JOIN ad_campaigns c ON c.id = p.campaign_id
     ORDER BY p.id DESC LIMIT 200`
  );
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

export async function saveAdPayment(data) {
  if (!(await hasAdsTables())) throw Object.assign(new Error('Таблицы рекламы не созданы'), { status: 503 });
  const { advertiser_id, campaign_id, amount, status, note } = data;
  const paidAt = status === 'paid' ? new Date() : null;
  const [r] = await pool.query(
    `INSERT INTO ad_payments (advertiser_id, campaign_id, amount, status, note, paid_at)
     VALUES (?,?,?,?,?,?)`,
    [advertiser_id, campaign_id || null, Number(amount), status || 'new', note?.trim() || null, paidAt]
  );
  if (status === 'paid') {
    await pool.query(`UPDATE advertisers SET balance = balance + ? WHERE id = ?`, [
      Number(amount),
      advertiser_id,
    ]);
  }
  const [rows] = await pool.query(`SELECT * FROM ad_payments WHERE id = ?`, [r.insertId]);
  return rows[0];
}

export async function getAdsStatistics(query = {}) {
  if (!(await hasAdsTables())) {
    return { summary: {}, campaigns: [], charts: [] };
  }
  const { start, end, preset } = parseReportPeriod(query);
  const { clause, params } = sqlBetween('s.created_at', start, end);

  const [summary] = await pool.query(
    `SELECT
       SUM(event_type = 'impression') AS impressions,
       SUM(event_type = 'click') AS clicks,
       SUM(event_type = 'open') AS opens,
       COUNT(DISTINCT user_id) AS unique_users
     FROM ad_statistics s WHERE ${clause}`,
    params
  );
  const imp = Number(summary[0]?.impressions) || 0;
  const clicks = Number(summary[0]?.clicks) || 0;

  const [byCampaign] = await pool.query(
    `SELECT c.id, c.title, c.budget, c.spent,
            SUM(s.event_type = 'impression') AS impressions,
            SUM(s.event_type = 'click') AS clicks
     FROM ad_campaigns c
     LEFT JOIN ad_statistics s ON s.campaign_id = c.id AND ${clause.replace(/s\.created_at/g, 's.created_at')}
     GROUP BY c.id ORDER BY clicks DESC LIMIT 50`,
    params
  );

  const [active] = await pool.query(
    `SELECT COUNT(*) AS c FROM ad_campaigns WHERE status = 'active'`
  );

  const [revenue] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS t FROM ad_payments
     WHERE status = 'paid' AND paid_at >= ? AND paid_at <= ?`,
    [start, end]
  );

  return {
    period: { preset, start, end },
    summary: {
      active_campaigns: Number(active[0]?.c) || 0,
      impressions: imp,
      clicks,
      opens: Number(summary[0]?.opens) || 0,
      unique_users: Number(summary[0]?.unique_users) || 0,
      ctr: imp ? Math.round((clicks / imp) * 10000) / 100 : 0,
      revenue: Number(revenue[0]?.t) || 0,
    },
    campaigns: byCampaign.map((c) => ({
      ...c,
      budget: Number(c.budget),
      spent: Number(c.spent),
      impressions: Number(c.impressions),
      clicks: Number(c.clicks),
      ctr: c.impressions ? Math.round((Number(c.clicks) / Number(c.impressions)) * 10000) / 100 : 0,
    })),
  };
}

export async function getAdsDashboard(query) {
  const stats = await getAdsStatistics(query);
  return {
    cards: {
      active_campaigns: stats.summary.active_campaigns,
      ad_revenue: stats.summary.revenue,
      impressions: stats.summary.impressions,
      clicks: stats.summary.clicks,
      ctr: stats.summary.ctr,
    },
    ...stats,
  };
}

export async function recordAdEvent({ campaignId, userId, eventType }) {
  if (!(await hasAdsTables())) return;
  await pool.query(
    `INSERT INTO ad_statistics (campaign_id, user_id, event_type) VALUES (?,?,?)`,
    [campaignId, userId || null, eventType]
  );
  if (eventType === 'impression') {
    const { impression_cost } = await getAdSettings();
    const cost = Math.max(0, Number(impression_cost) || 0);
    if (cost > 0) {
      await pool.query(`UPDATE ad_campaigns SET spent = spent + ? WHERE id = ?`, [cost, campaignId]).catch(() => {});
    }
  }
}

function adTypesForPlacement(placement) {
  if (placement === 'banner_workout') return ['banner_workout', 'promo'];
  return ['banner_home', 'promo'];
}

function matchesAudience(campaign, city, level) {
  if (campaign.audience_cities?.length && city) {
    if (!campaign.audience_cities.includes(city)) return false;
  }
  if (campaign.audience_levels?.length && level) {
    const allowed = campaign.audience_levels.map((l) => String(l).toLowerCase());
    if (!allowed.includes(String(level).toLowerCase())) return false;
  }
  return true;
}

/** Баннеры для мобильного приложения. */
export async function listActiveBanners({ placement = 'banner_home', user = null } = {}) {
  if (!(await hasAdsTables())) return [];
  const { partner_ads_enabled } = await getAdSettings();
  if (!partner_ads_enabled) return [];
  const types = adTypesForPlacement(placement);
  const primaryType = types[0];
  const [rows] = await pool.query(
    `SELECT c.id, c.title, c.description, c.banner_url, c.target_url, c.ad_type,
            c.audience_cities, c.audience_levels, c.audience_activity
     FROM ad_campaigns c
     WHERE c.status = 'active' AND c.ad_type IN (?)
       AND c.start_date <= CURDATE() AND c.end_date >= CURDATE()
       AND c.banner_url IS NOT NULL AND TRIM(c.banner_url) != ''
     ORDER BY (c.ad_type = ?) DESC, c.id DESC LIMIT 5`,
    [types, primaryType]
  );

  const city = user?.city?.trim() || null;
  const level = user?.level_code ? String(user.level_code).toLowerCase() : null;

  const mapped = rows.map(mapCampaign);
  const matched = mapped.filter((c) => matchesAudience(c, city, level));
  const poolList = matched.length
    ? matched
    : mapped.filter((c) => !c.audience_cities?.length && !c.audience_levels?.length);

  return poolList.sort((a, b) => {
    if (a.ad_type === primaryType && b.ad_type !== primaryType) return -1;
    if (b.ad_type === primaryType && a.ad_type !== primaryType) return 1;
    return Number(b.id) - Number(a.id);
  });
}

/** Город и уровень клиента для таргетинга баннеров. */
export async function resolveBannerAudienceUser(userId, query = {}) {
  const user = {
    city: query.city?.trim() || null,
    level_code: query.level?.trim()?.toLowerCase() || null,
  };
  if (!userId) return user;

  const [rows] = await pool.query(`SELECT city FROM users WHERE id = ?`, [userId]);
  if (!user.city && rows[0]?.city) user.city = String(rows[0].city).trim();

  try {
    const { getUserLevelSummary } = await import('./customerLevelService.js');
    const summary = await getUserLevelSummary(userId);
    if (!user.level_code && summary?.current_level_code) {
      user.level_code = String(summary.current_level_code).toLowerCase();
    }
  } catch {
    /* уровни не настроены */
  }
  return user;
}
