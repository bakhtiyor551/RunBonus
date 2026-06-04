import { pool } from '../db.js';
import { parseReportPeriod, groupBySql } from '../utils/reportPeriod.js';
import { statusLabel as orderStatusLabel } from './orderService.js';

const ACTIVE_DAYS = 30;

async function safeQuery(sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR') {
      console.warn('[reports]', err.message);
      return [];
    }
    throw err;
  }
}

function num(row, key, fallback = 0) {
  return Number(row?.[key]) || fallback;
}

export async function getDashboardReport(query) {
  const period = parseReportPeriod(query);
  const { from, to } = period;

  const [[usersTotal], [usersNew], [usersActive], [usersBlocked]] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS c FROM users`),
    pool.query(`SELECT COUNT(*) AS c FROM users WHERE created_at BETWEEN ? AND ?`, [from, to]),
    pool.query(
      `SELECT COUNT(DISTINCT w.user_id) AS c FROM workouts w
       WHERE w.started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [ACTIVE_DAYS]
    ),
    pool.query(`SELECT COUNT(*) AS c FROM users WHERE status = 'blocked'`),
  ]);

  const shopRows = await safeQuery(
    `SELECT COUNT(*) AS orders_count,
            COALESCE(SUM(CASE WHEN status != 'cancelled' THEN quantity ELSE 0 END), 0) AS items_sold,
            COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0) AS revenue
     FROM shop_orders WHERE created_at BETWEEN ? AND ?`,
    [from, to]
  );

  const workoutRows = await safeQuery(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(distance_km), 0) AS km,
            SUM(status = 'approved') AS approved,
            SUM(status = 'rejected') AS rejected,
            SUM(status = 'suspicious') AS suspicious
     FROM workouts WHERE started_at BETWEEN ? AND ?`,
    [from, to]
  );

  const bonusRows = await safeQuery(
    `SELECT COALESCE(SUM(CASE WHEN type IN ('earn','manual') AND amount > 0 THEN amount ELSE 0 END), 0) AS earned,
            COALESCE(SUM(CASE WHEN type = 'spend' OR amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS spent
     FROM user_bonus_transactions WHERE created_at BETWEEN ? AND ?`,
    [from, to]
  );

  const withdrawRows = await safeQuery(
    `SELECT COALESCE(SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END), 0) AS paid,
            COUNT(*) AS total_requests
     FROM withdrawal_requests WHERE created_at BETWEEN ? AND ?`,
    [from, to]
  );

  const shoeRows = await safeQuery(
    `SELECT COUNT(*) AS sold FROM shoes WHERE status = 'activated' AND activated_at BETWEEN ? AND ?`,
    [from, to]
  );

  const fundRows = await safeQuery(
    `SELECT COALESCE(current_balance, 0) AS balance FROM accounts WHERE type = 'bonus_fund' AND status = 'active' LIMIT 1`
  );

  const revenue = num(shopRows[0], 'revenue');
  const bonusExpense = num(bonusRows[0], 'earned');
  const withdrawExpense = num(withdrawRows[0], 'paid');
  const profit = Math.round((revenue - bonusExpense - withdrawExpense) * 100) / 100;

  return {
    period,
    cards: {
      total_clients: num(usersTotal[0], 'c'),
      new_clients: num(usersNew[0], 'c'),
      active_clients: num(usersActive[0], 'c'),
      blocked_clients: num(usersBlocked[0], 'c'),
      shoes_sold: num(shoeRows[0], 'sold') || num(shopRows[0], 'items_sold'),
      shop_orders: num(shopRows[0], 'orders_count'),
      total_km: Math.round(num(workoutRows[0], 'km') * 10) / 10,
      workouts_count: num(workoutRows[0], 'total'),
      bonuses_earned: bonusExpense,
      bonuses_spent: num(bonusRows[0], 'spent'),
      withdrawals_paid: withdrawExpense,
      bonus_fund: num(fundRows[0], 'balance'),
      income: revenue,
      expense: Math.round((bonusExpense + withdrawExpense) * 100) / 100,
      profit,
    },
    charts: {
      sales: await getTimeSeries('shop_orders', 'created_at', 'total_amount', from, to, query.groupBy, "status != 'cancelled'"),
      workouts: await getWorkoutTimeSeries(from, to, query.groupBy),
      bonuses: await getBonusTimeSeries(from, to, query.groupBy),
    },
  };
}

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
    `SELECT COUNT(*) AS total,
            SUM(status = 'approved') AS approved,
            SUM(status = 'rejected') AS rejected,
            SUM(status = 'suspicious') AS suspicious,
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
    },
  };
}

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
  );
}
