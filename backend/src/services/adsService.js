import { pool } from '../db.js';
import { parseReportPeriod, sqlBetween } from '../utils/reportPeriod.js';

let adsReady = null;

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
    audience_cities: parseJsonArray(row.audience_cities),
    audience_levels: parseJsonArray(row.audience_levels),
    audience_activity: parseJsonArray(row.audience_activity),
    budget: Number(row.budget),
    spent: Number(row.spent),
  };
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
    `SELECT c.*, a.company_name AS advertiser_name
     FROM ad_campaigns c
     JOIN advertisers a ON a.id = c.advertiser_id
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
  } = data;

  if (!advertiser_id || !title?.trim()) {
    throw Object.assign(new Error('Укажите рекламодателя и название'), { status: 400 });
  }

  const payload = [
    advertiser_id,
    title.trim(),
    description?.trim() || null,
    ad_type || 'banner_home',
    banner_url?.trim() || null,
    target_url?.trim() || null,
    JSON.stringify(audience_cities || []),
    JSON.stringify(audience_levels || []),
    JSON.stringify(audience_activity || []),
    start_date,
    end_date,
    Number(budget) || 0,
    status || 'draft',
  ];

  if (id) {
    await pool.query(
      `UPDATE ad_campaigns SET advertiser_id=?, title=?, description=?, ad_type=?, banner_url=?, target_url=?,
       audience_cities=?, audience_levels=?, audience_activity=?, start_date=?, end_date=?, budget=?, status=?
       WHERE id=?`,
      [...payload, id]
    );
  } else {
    const [ins] = await pool.query(
      `INSERT INTO ad_campaigns (advertiser_id, title, description, ad_type, banner_url, target_url,
        audience_cities, audience_levels, audience_activity, start_date, end_date, budget, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      payload
    );
    id = ins.insertId;
  }

  const [rows] = await pool.query(
    `SELECT c.*, a.company_name AS advertiser_name FROM ad_campaigns c
     JOIN advertisers a ON a.id = c.advertiser_id WHERE c.id = ?`,
    [id]
  );
  return mapCampaign(rows[0]);
}

export async function listTariffs() {
  if (!(await hasAdsTables())) return [];
  const [rows] = await pool.query(`SELECT * FROM ad_tariffs WHERE status = 'active' ORDER BY sort_order`);
  return rows.map((r) => ({ ...r, price: Number(r.price) }));
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
    await pool.query(`UPDATE ad_campaigns SET spent = spent + 0.01 WHERE id = ?`, [campaignId]).catch(() => {});
  }
}

/** Баннеры для мобильного приложения. */
export async function listActiveBanners({ placement = 'banner_home', user = null } = {}) {
  if (!(await hasAdsTables())) return [];
  const today = new Date().toISOString().slice(0, 10);
  const [rows] = await pool.query(
    `SELECT c.id, c.title, c.description, c.banner_url, c.target_url, c.ad_type,
            c.audience_cities, c.audience_levels, c.audience_activity
     FROM ad_campaigns c
     WHERE c.status = 'active' AND c.ad_type = ?
       AND c.start_date <= ? AND c.end_date >= ?
       AND c.banner_url IS NOT NULL AND TRIM(c.banner_url) != ''
     ORDER BY c.id DESC LIMIT 5`,
    [placement, today, today]
  );

  const city = user?.city?.trim();
  const level = user?.level_code;

  return rows
    .map(mapCampaign)
    .filter((c) => {
      if (c.audience_cities?.length && city && !c.audience_cities.includes(city)) return false;
      if (c.audience_levels?.length && level && !c.audience_levels.includes(level)) return false;
      return true;
    });
}
