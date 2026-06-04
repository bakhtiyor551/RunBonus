import { pool } from '../db.js';
import { parseReportPeriod, sqlBetween } from '../utils/reportPeriod.js';

const ORDER_INCOME_STATUSES = ['new', 'confirmed', 'paid', 'delivered', 'qr_issued'];

function n(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

async function tableExists(name) {
  try {
    await pool.query(`SELECT 1 FROM ${name} LIMIT 1`);
    return true;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

async function sumShopIncome(start, end) {
  const { clause, params } = sqlBetween('o.created_at', start, end);
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(o.total_amount), 0) AS total,
            COALESCE(SUM(o.quantity), 0) AS pairs
     FROM shop_orders o
     WHERE o.status IN (?) AND ${clause}`,
    [ORDER_INCOME_STATUSES, ...params]
  );
  return { revenue: n(rows[0]?.total), pairs: Number(rows[0]?.pairs) || 0 };
}

async function sumBonusEarned(start, end) {
  const { clause, params } = sqlBetween('created_at', start, end);
  let total = 0;
  try {
    const [rows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS t FROM user_bonus_transactions
       WHERE type = 'earn' AND ${clause}`,
      params
    );
    total = rows[0]?.t;
  } catch {
    const [rows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS t FROM bonuses WHERE type = 'earn' AND ${clause}`,
      params
    );
    total = rows[0]?.t;
  }
  return n(total);
}

async function sumBonusSpent(start, end) {
  const { clause, params } = sqlBetween('created_at', start, end);
  try {
    const [rows] = await pool.query(
      `SELECT COALESCE(SUM(ABS(amount)), 0) AS t FROM user_bonus_transactions
       WHERE type IN ('spend', 'withdraw_success') AND ${clause}`,
      params
    );
    return n(rows[0]?.t);
  } catch {
    return 0;
  }
}

async function sumWithdrawals(start, end) {
  if (!(await tableExists('withdrawal_requests'))) return 0;
  const { clause, params } = sqlBetween('created_at', start, end);
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS t FROM withdrawal_requests
     WHERE status = 'success' AND ${clause}`,
    params
  );
  return n(rows[0]?.t);
}

async function sumAdRevenue(start, end) {
  if (!(await tableExists('ad_payments'))) return 0;
  const { clause, params } = sqlBetween('paid_at', start, end);
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS t FROM ad_payments
     WHERE status = 'paid' AND paid_at IS NOT NULL AND ${clause}`,
    params
  );
  return n(rows[0]?.t);
}

async function countUsers(activeDays = 30) {
  const [all] = await pool.query(`SELECT COUNT(*) AS c FROM users`);
  const [blocked] = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE status = 'blocked'`);
  const since = new Date();
  since.setDate(since.getDate() - activeDays);
  const [active] = await pool.query(
    `SELECT COUNT(DISTINCT w.user_id) AS c FROM workouts w
     WHERE w.started_at >= ? AND w.status = 'approved'`,
    [since]
  );
  const [newInPeriod] = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE created_at >= ?`, [since]);
  return {
    total: Number(all[0]?.c) || 0,
    blocked: Number(blocked[0]?.c) || 0,
    active: Number(active[0]?.c) || 0,
    new_recent: Number(newInPeriod[0]?.c) || 0,
  };
}

export async function getReportsDashboard(query) {
  const { start, end, preset } = parseReportPeriod(query);
  const shop = await sumShopIncome(start, end);
  const adRevenue = await sumAdRevenue(start, end);
  const income = n(shop.revenue + adRevenue);
  const bonusEarned = await sumBonusEarned(start, end);
  const withdrawn = await sumWithdrawals(start, end);
  const expense = n(bonusEarned + withdrawn);
  const profit = n(income - expense);

  const users = await countUsers(30);

  const { clause, params } = sqlBetween('w.started_at', start, end);
  const [kmRows] = await pool.query(
    `SELECT COALESCE(SUM(distance_km), 0) AS km, COUNT(*) AS cnt
     FROM workouts w WHERE w.status = 'approved' AND ${clause}`,
    params
  );

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(dayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
  const yearStart = new Date(dayStart.getFullYear(), 0, 1);

  const [dayShop, weekShop, monthShop, yearShop] = await Promise.all([
    sumShopIncome(dayStart, end),
    sumShopIncome(weekStart, end),
    sumShopIncome(monthStart, end),
    sumShopIncome(yearStart, end),
  ]);

  return {
    period: { preset, start, end },
    cards: {
      total_clients: users.total,
      active_clients: users.active,
      shoes_sold_pairs: shop.pairs,
      total_km: n(kmRows[0]?.km),
      bonuses_earned: bonusEarned,
      withdrawn,
      income,
      expense,
      profit,
      ad_revenue: adRevenue,
      shop_revenue: shop.revenue,
    },
    sales_totals: {
      day: dayShop.pairs,
      week: weekShop.pairs,
      month: monthShop.pairs,
      year: yearShop.pairs,
    },
  };
}

<<<<<<< HEAD
async function getTimeSeries(table, dateCol, sumCol, from, to, groupBy, extraWhere = '1=1') {
  const fmt = groupBySql(groupBy);
  return safeQuery(
    `SELECT DATE_FORMAT(${dateCol}, ?) AS bucket,
            COUNT(*) AS count,
            COALESCE(SUM(${sumCol}), 0) AS total
     FROM ${table}
     WHERE ${dateCol} BETWEEN ? AND ? AND ${extraWhere}
     GROUP BY bucket ORDER BY bucket`,
    [fmt, from, to]
  );
}

async function getWorkoutTimeSeries(from, to, groupBy) {
  const fmt = groupBySql(groupBy);
  return safeQuery(
    `SELECT DATE_FORMAT(started_at, ?) AS bucket,
            COUNT(*) AS count,
            COALESCE(SUM(distance_km), 0) AS km
     FROM workouts WHERE started_at BETWEEN ? AND ?
     GROUP BY bucket ORDER BY bucket`,
    [fmt, from, to]
  );
}

async function getBonusTimeSeries(from, to, groupBy) {
  const fmt = groupBySql(groupBy);
  return safeQuery(
    `SELECT DATE_FORMAT(created_at, ?) AS bucket,
            COALESCE(SUM(CASE WHEN type IN ('earn','manual') AND amount > 0 THEN amount ELSE 0 END), 0) AS earned,
            COALESCE(SUM(CASE WHEN type IN ('withdraw_success','spend') THEN ABS(amount) ELSE 0 END), 0) AS paid_out
     FROM user_bonus_transactions WHERE created_at BETWEEN ? AND ?
     GROUP BY bucket ORDER BY bucket`,
    [fmt, from, to]
  );
}

export async function getSalesReport(query) {
  const period = parseReportPeriod(query);
  const { from, to } = period;

  const rows = await safeQuery(
    `SELECT o.id, o.created_at, p.name AS model, o.size, o.quantity, o.price, o.total_amount, o.status
     FROM shop_orders o
     JOIN products p ON p.id = o.product_id
     WHERE o.created_at BETWEEN ? AND ?
     ORDER BY o.created_at DESC LIMIT 2000`,
    [from, to]
  );

  const totals = await safeQuery(
    `SELECT
       COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() AND status != 'cancelled' THEN quantity ELSE 0 END), 0) AS today,
       COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND status != 'cancelled' THEN quantity ELSE 0 END), 0) AS week,
       COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND status != 'cancelled' THEN quantity ELSE 0 END), 0) AS month,
       COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) AND status != 'cancelled' THEN quantity ELSE 0 END), 0) AS year,
       COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0) AS revenue
     FROM shop_orders WHERE created_at BETWEEN ? AND ?`,
    [from, to]
  );

  return {
    period,
    totals: totals[0] || {},
    items: rows.map((r) => ({
      id: r.id,
      date: r.created_at,
      model: r.model,
      size: r.size,
      quantity: r.quantity,
      price: Number(r.price),
      total: Number(r.total_amount),
      status: r.status,
      status_label: orderStatusLabel(r.status),
    })),
    chart: await getTimeSeries('shop_orders', 'created_at', 'total_amount', from, to, query.groupBy, "status != 'cancelled'"),
  };
}

export async function getWorkoutsReport(query) {
  const period = parseReportPeriod(query);
  const { from, to } = period;

  const [summary] = await safeQuery(
=======
export async function getReportsSales(query) {
  const { start, end, preset } = parseReportPeriod(query);
  const { clause, params } = sqlBetween('o.created_at', start, end);
  const [rows] = await pool.query(
    `SELECT o.id, o.created_at, p.name AS model_name, o.size, o.order_color AS color,
            o.quantity, o.price, o.total_amount, o.status, o.customer_name, o.phone
     FROM shop_orders o
     JOIN products p ON p.id = o.product_id
     WHERE ${clause}
     ORDER BY o.created_at DESC
     LIMIT 500`,
    params
  );

  const shop = await sumShopIncome(start, end);
  const charts = await salesChartByDay(start, end);

  return {
    period: { preset, start, end },
    rows: rows.map((r) => ({
      ...r,
      price: n(r.price),
      total_amount: n(r.total_amount),
      quantity: Number(r.quantity) || 1,
    })),
    totals: { pairs: shop.pairs, revenue: shop.revenue },
    charts,
  };
}

async function salesChartByDay(start, end) {
  const { clause, params } = sqlBetween('o.created_at', start, end);
  const [rows] = await pool.query(
    `SELECT DATE(o.created_at) AS d, COUNT(*) AS orders, COALESCE(SUM(o.total_amount), 0) AS revenue
     FROM shop_orders o
     WHERE o.status IN (?) AND ${clause}
     GROUP BY DATE(o.created_at) ORDER BY d`,
    [ORDER_INCOME_STATUSES, ...params]
  );
  return rows.map((r) => ({
    date: r.d,
    orders: Number(r.orders),
    revenue: n(r.revenue),
  }));
}

export async function getReportsWorkouts(query) {
  const { start, end, preset } = parseReportPeriod(query);
  const { clause, params } = sqlBetween('w.started_at', start, end);

  const [stats] = await pool.query(
>>>>>>> 4d494ec200d088c040073d667f839c42c5d207eb
    `SELECT COUNT(*) AS total,
            SUM(status = 'approved') AS approved,
            SUM(status = 'rejected') AS rejected,
            SUM(status = 'suspicious') AS suspicious,
<<<<<<< HEAD
            COALESCE(SUM(distance_km), 0) AS km,
            COALESCE(AVG(distance_km), 0) AS avg_km,
            COALESCE(SUM(calculated_bonus), 0) AS bonus_total
     FROM workouts WHERE started_at BETWEEN ? AND ?`,
    [from, to]
  );

  const topKm = await safeQuery(
    `SELECT u.id, u.name, u.phone, COALESCE(SUM(w.distance_km), 0) AS km, COUNT(w.id) AS workouts
     FROM workouts w JOIN users u ON u.id = w.user_id
     WHERE w.started_at BETWEEN ? AND ? AND w.status = 'approved'
     GROUP BY u.id ORDER BY km DESC LIMIT 10`,
    [from, to]
  );

  const topBonus = await safeQuery(
    `SELECT u.id, u.name, u.phone, COALESCE(SUM(w.calculated_bonus), 0) AS bonus
     FROM workouts w JOIN users u ON u.id = w.user_id
     WHERE w.started_at BETWEEN ? AND ? AND w.status = 'approved'
     GROUP BY u.id ORDER BY bonus DESC LIMIT 10`,
    [from, to]
  );

  return {
    period,
    summary: summary || {},
    top_km: topKm,
    top_bonus: topBonus,
    chart: await getWorkoutTimeSeries(from, to, query.groupBy),
  };
}

export async function getBonusesReport(query) {
  const period = parseReportPeriod(query);
  const { from, to } = period;

  const [summary] = await safeQuery(
    `SELECT COALESCE(SUM(CASE WHEN type IN ('earn','manual') AND amount > 0 THEN amount ELSE 0 END), 0) AS earned,
            COALESCE(SUM(CASE WHEN type = 'spend' OR (type = 'manual' AND amount < 0) THEN ABS(amount) ELSE 0 END), 0) AS spent
     FROM user_bonus_transactions WHERE created_at BETWEEN ? AND ?`,
    [from, to]
  );

  const [fund] = await safeQuery(
    `SELECT COALESCE(current_balance, 0) AS balance FROM accounts WHERE type = 'bonus_fund' LIMIT 1`
  );
  const [clients] = await pool.query(`SELECT COUNT(*) AS c FROM users`);

  const byLevel = await safeQuery(
    `SELECT cl.name, cl.code, COUNT(DISTINCT usp.user_id) AS clients,
            COALESCE(SUM(usp.total_bonus), 0) AS bonus_earned
     FROM customer_levels cl
     LEFT JOIN user_shoe_progress usp ON usp.current_level_id = cl.id
     GROUP BY cl.id ORDER BY cl.from_km ASC, cl.id ASC`
  );

  return {
    period,
    summary: {
      earned: num(summary, 'earned'),
      spent: num(summary, 'spent'),
      fund_balance: num(fund, 'balance'),
      avg_per_client: clients[0]?.c ? Math.round((num(summary, 'earned') / clients[0].c) * 100) / 100 : 0,
    },
    by_level: byLevel,
    chart: await getBonusTimeSeries(from, to, query.groupBy),
  };
}

export async function getWithdrawalsReport(query) {
  const period = parseReportPeriod(query);
  const { from, to } = period;

  const [summary] = await safeQuery(
    `SELECT COUNT(*) AS total,
            SUM(status = 'success') AS success,
            SUM(status = 'rejected') AS rejected,
            SUM(status IN ('pending','processing')) AS processing,
            COALESCE(SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END), 0) AS paid_total
     FROM withdrawal_requests WHERE created_at BETWEEN ? AND ?`,
    [from, to]
  );

  const byWallet = await safeQuery(
    `SELECT COALESCE(wm.name, wr.wallet_name) AS wallet,
            COUNT(*) AS requests,
            COALESCE(SUM(CASE WHEN wr.status = 'success' THEN wr.amount ELSE 0 END), 0) AS paid
     FROM withdrawal_requests wr
     LEFT JOIN withdrawal_methods wm ON wm.id = wr.method_id
     WHERE wr.created_at BETWEEN ? AND ?
     GROUP BY wallet ORDER BY paid DESC`,
    [from, to]
  );

  return {
    period,
    summary: summary || {},
    by_wallet: byWallet,
    chart: await getTimeSeries('withdrawal_requests', 'created_at', 'amount', from, to, query.groupBy, "status = 'success'"),
  };
}

export async function getClientsReport(query) {
  const period = parseReportPeriod(query);
  const { from, to } = period;

  const [summary] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(status = 'blocked') AS blocked,
            SUM(created_at BETWEEN ? AND ?) AS new_clients
     FROM users`,
    [from, to]
  );

  const [active] = await pool.query(
    `SELECT COUNT(DISTINCT user_id) AS c FROM workouts WHERE started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [ACTIVE_DAYS]
  );

  const total = num(summary[0], 'total');
  const activeCount = num(active[0], 'c');
  const blocked = num(summary[0], 'blocked');

  const topKm = await safeQuery(
    `SELECT u.id, u.name, u.phone, COALESCE(SUM(w.distance_km), 0) AS km
     FROM users u LEFT JOIN workouts w ON w.user_id = u.id AND w.status = 'approved'
     GROUP BY u.id ORDER BY km DESC LIMIT 10`
  );

  const topBonus = await safeQuery(
    `SELECT u.id, u.name, u.phone, COALESCE(wb.total_earned, 0) AS bonus
     FROM users u LEFT JOIN user_bonus_wallets wb ON wb.user_id = u.id
     ORDER BY bonus DESC LIMIT 10`
  );

  const topWorkouts = await safeQuery(
    `SELECT u.id, u.name, u.phone, COUNT(w.id) AS workouts
     FROM users u LEFT JOIN workouts w ON w.user_id = u.id
     GROUP BY u.id ORDER BY workouts DESC LIMIT 10`
  );

  return {
    period,
    summary: {
      total,
      new: num(summary[0], 'new_clients'),
      active: activeCount,
      inactive: Math.max(0, total - activeCount - blocked),
      blocked,
    },
    top_km: topKm,
    top_bonus: topBonus,
    top_workouts: topWorkouts,
    chart: await safeQuery(
      `SELECT DATE_FORMAT(created_at, ?) AS bucket, COUNT(*) AS count
       FROM users WHERE created_at BETWEEN ? AND ?
       GROUP BY bucket ORDER BY bucket`,
      [groupBySql(query.groupBy), from, to]
    ),
  };
}

export async function getShoesReport(query) {
  const period = parseReportPeriod(query);
  const { from, to } = period;

  const [summary] = await safeQuery(
    `SELECT COUNT(*) AS total,
            SUM(status = 'activated') AS activated,
            SUM(status = 'new') AS not_activated,
            SUM(status = 'blocked') AS blocked,
            SUM(status = 'activated' AND activated_at BETWEEN ? AND ?) AS sold_period
     FROM shoes`,
    [from, to]
  );

  const byModel = await safeQuery(
    `SELECT model_name, COUNT(*) AS total,
            SUM(status = 'activated') AS activated,
            SUM(status = 'new') AS not_activated,
            SUM(status = 'blocked') AS blocked
     FROM shoes GROUP BY model_name ORDER BY total DESC`
  );

  return {
    period,
    summary: summary || {},
    by_model: byModel,
  };
}

export async function getFinanceReport(query) {
  const period = parseReportPeriod(query);
  const { from, to } = period;

  const [shop] = await safeQuery(
    `SELECT COALESCE(SUM(total_amount), 0) AS shop_income, COUNT(*) AS orders
     FROM shop_orders WHERE created_at BETWEEN ? AND ? AND status != 'cancelled'`,
    [from, to]
  );

  const [bonuses] = await safeQuery(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM user_bonus_transactions
     WHERE created_at BETWEEN ? AND ? AND type IN ('earn','manual') AND amount > 0`,
    [from, to]
  );

  const [withdrawals] = await safeQuery(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM withdrawal_requests
     WHERE created_at BETWEEN ? AND ? AND status = 'success'`,
    [from, to]
  );

  const shopIncome = num(shop[0], 'shop_income');
  const bonusExpense = num(bonuses[0], 'total');
  const withdrawExpense = num(withdrawals[0], 'total');
  const otherExpense = 0;
  const totalIncome = shopIncome;
  const totalExpense = bonusExpense + withdrawExpense + otherExpense;
  const profit = Math.round((totalIncome - totalExpense) * 100) / 100;

  return {
    period,
    breakdown: {
      shop_income: shopIncome,
      shoe_sales_income: shopIncome,
      bonus_expense: bonusExpense,
      withdrawal_expense: withdrawExpense,
      other_expense: otherExpense,
      total_income: totalIncome,
      total_expense: Math.round(totalExpense * 100) / 100,
      profit,
    },
    formula: 'Прибыль = Продажи − Бонусы − Выводы − Прочие расходы',
    charts: {
      income: await getTimeSeries('shop_orders', 'created_at', 'total_amount', from, to, query.groupBy, "status != 'cancelled'"),
      expenses: await getBonusTimeSeries(from, to, query.groupBy),
=======
            COALESCE(SUM(CASE WHEN status = 'approved' THEN distance_km ELSE 0 END), 0) AS total_km
     FROM workouts w WHERE ${clause}`,
    params
  );
  const st = stats[0];
  const approved = Number(st.approved) || 0;
  const totalKm = n(st.total_km);

  const [topKm] = await pool.query(
    `SELECT u.id, u.name, u.phone, COALESCE(SUM(w.distance_km), 0) AS km
     FROM workouts w JOIN users u ON u.id = w.user_id
     WHERE w.status = 'approved' AND ${clause}
     GROUP BY u.id ORDER BY km DESC LIMIT 10`,
    params
  );

  let topBonus = [];
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.phone, COALESCE(SUM(t.amount), 0) AS bonus
       FROM user_bonus_transactions t
       JOIN users u ON u.id = t.user_id
       JOIN workouts w ON w.id = t.workout_id
       WHERE t.type = 'earn' AND w.status = 'approved' AND ${clause}
       GROUP BY u.id ORDER BY bonus DESC LIMIT 10`,
      params
    );
    topBonus = rows;
  } catch {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.phone, COALESCE(SUM(w.calculated_bonus), 0) AS bonus
       FROM workouts w JOIN users u ON u.id = w.user_id
       WHERE w.status = 'approved' AND ${clause}
       GROUP BY u.id ORDER BY bonus DESC LIMIT 10`,
      params
    );
    topBonus = rows;
  }

  const [chart] = await pool.query(
    `SELECT DATE(started_at) AS d, COUNT(*) AS workouts,
            COALESCE(SUM(CASE WHEN status = 'approved' THEN distance_km ELSE 0 END), 0) AS km
     FROM workouts WHERE ${clause}
     GROUP BY DATE(started_at) ORDER BY d`,
    params
  );

  return {
    period: { preset, start, end },
    summary: {
      total: Number(st.total) || 0,
      approved,
      rejected: Number(st.rejected) || 0,
      suspicious: Number(st.suspicious) || 0,
      total_km: totalKm,
      avg_km: approved ? n(totalKm / approved) : 0,
    },
    top_by_km: topKm.map((r) => ({ ...r, km: n(r.km) })),
    top_by_bonus: topBonus.map((r) => ({ ...r, bonus: n(r.bonus) })),
    charts: chart.map((r) => ({
      date: r.d,
      workouts: Number(r.workouts),
      km: n(r.km),
    })),
  };
}

export async function getReportsBonuses(query) {
  const { start, end, preset } = parseReportPeriod(query);
  const earned = await sumBonusEarned(start, end);
  const spent = await sumBonusSpent(start, end);

  const [fund] = await pool.query(
    `SELECT current_balance FROM accounts WHERE type = 'bonus_fund' LIMIT 1`
  ).catch(() => [[{ current_balance: 0 }]]);

  const [clients] = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE status != 'blocked'`);
  const clientCount = Number(clients[0]?.c) || 1;

  const levels = await bonusByLevels(start, end);

  const [chart] = await pool.query(
    `SELECT DATE(created_at) AS d, COALESCE(SUM(amount), 0) AS earned
     FROM user_bonus_transactions WHERE type = 'earn' AND created_at >= ? AND created_at <= ?
     GROUP BY DATE(created_at) ORDER BY d`,
    [start, end]
  ).catch(() => [[]]);

  return {
    period: { preset, start, end },
    summary: {
      earned,
      spent,
      fund_balance: n(fund[0]?.current_balance),
      avg_per_client: n(earned / clientCount),
    },
    by_level: levels,
    charts: { earned: chart.map((r) => ({ date: r.d, amount: n(r.earned) })) },
  };
}

async function bonusByLevels(start, end) {
  const [levels] = await pool.query(
    `SELECT name, code, from_km, to_km FROM customer_levels WHERE status = 'active' ORDER BY from_km`
  ).catch(() => [[]]);
  if (!levels.length) {
    return [
      { code: 'bronze', name: 'Bronze', earned: 0 },
      { code: 'silver', name: 'Silver', earned: 0 },
      { code: 'gold', name: 'Gold', earned: 0 },
    ];
  }

  const { clause, params } = sqlBetween('w.started_at', start, end);
  const [userKm] = await pool.query(
    `SELECT w.user_id, COALESCE(SUM(w.distance_km), 0) AS km
     FROM workouts w WHERE w.status = 'approved' AND ${clause}
     GROUP BY w.user_id`,
    params
  );

  let bonusRows = [];
  try {
    const [b] = await pool.query(
      `SELECT w.user_id, COALESCE(SUM(t.amount), 0) AS bonus
       FROM user_bonus_transactions t
       JOIN workouts w ON w.id = t.workout_id
       WHERE t.type = 'earn' AND w.status = 'approved' AND ${clause}
       GROUP BY w.user_id`,
      params
    );
    bonusRows = b;
  } catch {
    const [b] = await pool.query(
      `SELECT w.user_id, COALESCE(SUM(w.calculated_bonus), 0) AS bonus
       FROM workouts w WHERE w.status = 'approved' AND ${clause}
       GROUP BY w.user_id`,
      params
    );
    bonusRows = b;
  }

  const bonusByUser = new Map(bonusRows.map((r) => [r.user_id, n(r.bonus)]));
  const result = levels.map((lv) => ({ code: lv.code, name: lv.name, earned: 0 }));

  for (const row of userKm) {
    const km = Number(row.km) || 0;
    const bonus = bonusByUser.get(row.user_id) || 0;
    const lv =
      levels.find((l) => km >= Number(l.from_km) && km < Number(l.to_km)) || levels[levels.length - 1];
    const slot = result.find((r) => r.code === lv.code);
    if (slot) slot.earned = n(slot.earned + bonus);
  }
  return result;
}

export async function getReportsWithdrawals(query) {
  const { start, end, preset } = parseReportPeriod(query);
  if (!(await tableExists('withdrawal_requests'))) {
    return { period: { preset, start, end }, summary: {}, by_wallet: [], rows: [] };
  }
  const { clause, params } = sqlBetween('created_at', start, end);

  const [stats] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(status = 'success') AS success,
            SUM(status = 'rejected') AS rejected,
            SUM(status IN ('pending', 'processing')) AS pending,
            COALESCE(SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END), 0) AS paid
     FROM withdrawal_requests WHERE ${clause}`,
    params
  );

  const [byWallet] = await pool.query(
    `SELECT wm.name, wm.code, COUNT(*) AS cnt,
            COALESCE(SUM(CASE WHEN wr.status = 'success' THEN wr.amount ELSE 0 END), 0) AS paid
     FROM withdrawal_requests wr
     JOIN withdrawal_methods wm ON wm.id = wr.method_id
     WHERE ${clause.replace(/created_at/g, 'wr.created_at')}
     GROUP BY wm.id ORDER BY paid DESC`,
    params
  );

  const [rows] = await pool.query(
    `SELECT wr.id, wr.created_at, u.name AS client_name, wm.name AS wallet_name,
            wr.amount, wr.status
     FROM withdrawal_requests wr
     JOIN users u ON u.id = wr.user_id
     JOIN withdrawal_methods wm ON wm.id = wr.method_id
     WHERE ${clause.replace(/created_at/g, 'wr.created_at')}
     ORDER BY wr.created_at DESC LIMIT 200`,
    params
  );

  return {
    period: { preset, start, end },
    summary: {
      total: Number(stats[0]?.total) || 0,
      success: Number(stats[0]?.success) || 0,
      rejected: Number(stats[0]?.rejected) || 0,
      pending: Number(stats[0]?.pending) || 0,
      paid_total: n(stats[0]?.paid),
    },
    by_wallet: byWallet.map((r) => ({ ...r, paid: n(r.paid) })),
    rows,
  };
}

export async function getReportsClients(query) {
  const { start, end, preset } = parseReportPeriod(query);
  const { clause, params } = sqlBetween('u.created_at', start, end);

  const [newClients] = await pool.query(
    `SELECT COUNT(*) AS c FROM users u WHERE ${clause}`,
    params
  );

  const inactiveSince = new Date(end);
  inactiveSince.setDate(inactiveSince.getDate() - 30);

  const [inactive] = await pool.query(
    `SELECT COUNT(*) AS c FROM users u
     WHERE u.status = 'active' AND NOT EXISTS (
       SELECT 1 FROM workouts w WHERE w.user_id = u.id AND w.started_at >= ?
     )`,
    [inactiveSince]
  );

  const [blocked] = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE status = 'blocked'`);

  const users = await countUsers(30);

  const wClause = sqlBetween('w.started_at', start, end);

  const [topKm] = await pool.query(
    `SELECT u.id, u.name, u.phone, COALESCE(SUM(w.distance_km), 0) AS km, COUNT(*) AS workouts
     FROM workouts w JOIN users u ON u.id = w.user_id
     WHERE w.status = 'approved' AND ${wClause.clause}
     GROUP BY u.id ORDER BY km DESC LIMIT 10`,
    wClause.params
  );

  const [topWorkouts] = await pool.query(
    `SELECT u.id, u.name, u.phone, COUNT(*) AS workouts
     FROM workouts w JOIN users u ON u.id = w.user_id
     WHERE w.status = 'approved' AND ${wClause.clause}
     GROUP BY u.id ORDER BY workouts DESC LIMIT 10`,
    wClause.params
  );

  return {
    period: { preset, start, end },
    summary: {
      new_clients: Number(newClients[0]?.c) || 0,
      active_clients: users.active,
      inactive_clients: Number(inactive[0]?.c) || 0,
      blocked_clients: Number(blocked[0]?.c) || 0,
      total_clients: users.total,
    },
    top_by_km: topKm.map((r) => ({ ...r, km: n(r.km) })),
    top_by_workouts: topWorkouts,
  };
}

export async function getReportsShoes(query) {
  const { start, end, preset } = parseReportPeriod(query);
  const shop = await sumShopIncome(start, end);

  const [qr] = await pool.query(
    `SELECT
       SUM(status = 'activated') AS activated,
       SUM(status = 'new') AS not_activated,
       SUM(status = 'blocked') AS blocked,
       COUNT(*) AS total
     FROM shoes`
  );

  const [byModel] = await pool.query(
    `SELECT s.model_name, COUNT(*) AS total,
            SUM(s.status = 'activated') AS activated
     FROM shoes s GROUP BY s.model_name ORDER BY total DESC`
  );

  const [soldByModel] = await pool.query(
    `SELECT p.name AS model_name, COALESCE(SUM(o.quantity), 0) AS sold
     FROM shop_orders o JOIN products p ON p.id = o.product_id
     WHERE o.status IN (?) AND o.created_at >= ? AND o.created_at <= ?
     GROUP BY p.id ORDER BY sold DESC`,
    [ORDER_INCOME_STATUSES, start, end]
  );

  return {
    period: { preset, start, end },
    summary: {
      pairs_sold: shop.pairs,
      qr_activated: Number(qr[0]?.activated) || 0,
      qr_not_activated: Number(qr[0]?.not_activated) || 0,
      qr_blocked: Number(qr[0]?.blocked) || 0,
      qr_total: Number(qr[0]?.total) || 0,
    },
    by_model: byModel,
    sold_by_model: soldByModel.map((r) => ({ ...r, sold: Number(r.sold) })),
  };
}

export async function getReportsFinance(query) {
  const { start, end, preset } = parseReportPeriod(query);
  const shop = await sumShopIncome(start, end);
  const adRevenue = await sumAdRevenue(start, end);
  const bonusExpense = await sumBonusEarned(start, end);
  const withdrawExpense = await sumWithdrawals(start, end);
  const otherExpense = 0;

  const income = n(shop.revenue + adRevenue);
  const expense = n(bonusExpense + withdrawExpense + otherExpense);
  const profit = n(income - expense);

  const [chart] = await pool.query(
    `SELECT DATE(o.created_at) AS d, COALESCE(SUM(o.total_amount), 0) AS sales
     FROM shop_orders o
     WHERE o.status IN (?) AND o.created_at >= ? AND o.created_at <= ?
     GROUP BY DATE(o.created_at) ORDER BY d`,
    [ORDER_INCOME_STATUSES, start, end]
  );

  return {
    period: { preset, start, end },
    breakdown: {
      shop_sales: shop.revenue,
      ad_revenue: adRevenue,
      income,
      bonus_expense: bonusExpense,
      withdrawal_expense: withdrawExpense,
      other_expense: otherExpense,
      expense,
      profit,
    },
    formula: 'Прибыль = Продажи + Реклама − Бонусы − Выводы − Прочие расходы',
    charts: {
      sales: chart.map((r) => ({ date: r.d, amount: n(r.sales) })),
>>>>>>> 4d494ec200d088c040073d667f839c42c5d207eb
    },
  };
}

<<<<<<< HEAD
export async function buildDailyTelegramReport() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const from = yesterday.toISOString().slice(0, 10);
  const data = await getDashboardReport({ preset: 'yesterday', from, to: from });
  const c = data.cards;
  return (
    `📊 <b>RunBonus Отчёт</b>\n\n` +
    `Новых клиентов: ${c.new_clients}\n` +
    `Продано кроссовок: ${c.shoes_sold}\n` +
    `Тренировок: ${c.workouts_count}\n` +
    `Километров: ${c.total_km} км\n` +
    `Начислено бонусов: ${c.bonuses_earned} сомони\n` +
    `Вывод средств: ${c.withdrawals_paid} сомони\n` +
    `Доход: ${c.income} сомони\n` +
    `Прибыль: ${c.profit} сомони`
=======
/** Сводка для утреннего Telegram-отчёта (вчера). */
export async function buildDailyTelegramReport() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);

  const dash = await getReportsDashboard({ period: 'custom', from: start.toISOString(), to: end.toISOString() });
  const { clause, params } = sqlBetween('w.started_at', start, end);
  const [w] = await pool.query(
    `SELECT COUNT(*) AS c FROM workouts w WHERE w.status = 'approved' AND ${clause}`,
    params
  );

  const [newU] = await pool.query(
    `SELECT COUNT(*) AS c FROM users WHERE created_at >= ? AND created_at <= ?`,
    [start, end]
  );

  return (
    `📊 <b>RunBonus Отчёт</b>\n\n` +
    `Новых клиентов: ${Number(newU[0]?.c) || 0}\n` +
    `Продано кроссовок: ${dash.cards.shoes_sold_pairs}\n` +
    `Тренировок: ${Number(w[0]?.c) || 0}\n` +
    `Километров: ${dash.cards.total_km} км\n` +
    `Начислено бонусов: ${dash.cards.bonuses_earned} сомони\n` +
    `Вывод средств: ${dash.cards.withdrawn} сомони\n` +
    `Доход: ${dash.cards.income} сомони\n` +
    `Прибыль: ${dash.cards.profit} сомони`
>>>>>>> 4d494ec200d088c040073d667f839c42c5d207eb
  );
}
