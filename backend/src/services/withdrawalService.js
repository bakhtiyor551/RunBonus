import { pool } from '../db.js';
import { ensureUserWallet, getUserWallet } from './accountService.js';
import { sendTelegramMessage, formatWithdrawalTelegramMessage } from './telegramService.js';

const ACTIVE_STATUSES = ['pending', 'processing'];

let withdrawalSchemaReady = null;

export async function isWithdrawalSchemaReady(conn = pool) {
  if (withdrawalSchemaReady !== null) return withdrawalSchemaReady;
  try {
    await conn.query('SELECT 1 FROM withdrawal_methods LIMIT 1');
    await conn.query('SELECT blocked_balance FROM user_bonus_wallets LIMIT 1');
    withdrawalSchemaReady = true;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR') {
      withdrawalSchemaReady = false;
      return false;
    }
    throw err;
  }
  return withdrawalSchemaReady;
}

export function mapWithdrawalError(err) {
  if (err.status && err.message && !err.message.startsWith('ER_')) {
    return err;
  }
  const code = err.code;
  const msg = String(err.message || '');
  if (code === 'INSUFFICIENT_AVAILABLE' || msg.includes('INSUFFICIENT_AVAILABLE')) {
    const e = new Error('Недостаточно доступного баланса');
    e.status = 400;
    return e;
  }
  if (code === 'INSUFFICIENT_BALANCE' || msg.includes('INSUFFICIENT_BALANCE')) {
    const e = new Error('Недостаточно средств на счёте');
    e.status = 400;
    return e;
  }
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') {
    const e = new Error('Модуль вывода не настроен на сервере. Запустите миграцию 004_withdrawals.sql');
    e.status = 503;
    return e;
  }
  if (msg.includes('withdraw_hold') || msg.includes('Data truncated for column')) {
    const e = new Error('База данных не обновлена. Нужна миграция вывода средств (004_withdrawals.sql)');
    e.status = 503;
    return e;
  }
  const e = new Error(err.message || 'Ошибка создания заявки');
  e.status = err.status || 500;
  return e;
}

export async function getWithdrawalSettings(conn = pool) {
  if (await isWithdrawalSchemaReady(conn)) {
    await ensureWithdrawalDefaults(conn);
  }
  const [rows] = await conn.query('SELECT * FROM withdrawal_settings WHERE id = 1');
  if (!rows.length) {
    return { enabled: true, min_amount: 20, max_daily_amount: 100 };
  }
  const s = rows[0];
  return {
    enabled: !!s.enabled,
    min_amount: Number(s.min_amount),
    max_daily_amount: Number(s.max_daily_amount),
  };
}

export async function getWalletSummary(conn, userId, lock = false) {
  const wallet = await ensureUserWallet(conn, userId, lock);
  const balance = Number(wallet.balance);
  const blocked = Number(wallet.blocked_balance || 0);
  return {
    balance,
    blocked_balance: blocked,
    available_balance: Math.round((balance - blocked) * 100) / 100,
    total_withdrawn: Number(wallet.total_withdrawn || 0),
  };
}

export async function getUserDailyWithdrawnSum(conn, userId) {
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM withdrawal_requests
     WHERE user_id = ? AND status IN ('pending', 'processing', 'success')
       AND DATE(created_at) = CURDATE()`,
    [userId]
  );
  return Number(rows[0].total);
}

async function logStatusChange(conn, { requestId, adminId, oldStatus, newStatus, comment, ip }) {
  await conn.query(
    `INSERT INTO withdrawal_status_logs (request_id, admin_id, old_status, new_status, comment, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [requestId, adminId ?? null, oldStatus ?? null, newStatus, comment ?? null, ip ?? null]
  );
}

async function holdBalance(conn, userId, amount, requestId) {
  const wallet = await ensureUserWallet(conn, userId, true);
  const balanceBefore = Number(wallet.balance);
  const blockedBefore = Number(wallet.blocked_balance || 0);
  const blockedAfter = Math.round((blockedBefore + amount) * 100) / 100;

  if (blockedAfter > balanceBefore) {
    const err = new Error('Недостаточно доступного баланса');
    err.status = 400;
    err.code = 'INSUFFICIENT_AVAILABLE';
    throw err;
  }

  await conn.query(
    'UPDATE user_bonus_wallets SET blocked_balance = ? WHERE user_id = ?',
    [blockedAfter, userId]
  );

  await conn.query(
    `INSERT INTO user_bonus_transactions
     (user_id, type, amount, balance_before, balance_after, comment)
     VALUES (?, 'withdraw_hold', ?, ?, ?, ?)`,
    [
      userId,
      amount,
      balanceBefore,
      balanceBefore,
      `Заморозка на вывод #${requestId}`,
    ]
  );
}

async function releaseHold(conn, userId, amount, requestId, txType, comment) {
  const wallet = await ensureUserWallet(conn, userId, true);
  const balanceBefore = Number(wallet.balance);
  const blockedBefore = Number(wallet.blocked_balance || 0);
  const blockedAfter = Math.round(Math.max(0, blockedBefore - amount) * 100) / 100;

  await conn.query(
    'UPDATE user_bonus_wallets SET blocked_balance = ? WHERE user_id = ?',
    [blockedAfter, userId]
  );

  await conn.query(
    `INSERT INTO user_bonus_transactions
     (user_id, type, amount, balance_before, balance_after, comment)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, txType, amount, balanceBefore, balanceBefore, comment || `Вывод #${requestId}`]
  );
}

async function finalizeWithdraw(conn, userId, amount, requestId, adminComment) {
  const wallet = await ensureUserWallet(conn, userId, true);
  const balanceBefore = Number(wallet.balance);
  const blockedBefore = Number(wallet.blocked_balance || 0);
  const balanceAfter = Math.round((balanceBefore - amount) * 100) / 100;
  const blockedAfter = Math.round(Math.max(0, blockedBefore - amount) * 100) / 100;

  if (balanceAfter < 0) {
    const err = new Error('Недостаточно средств на счёте');
    err.status = 400;
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }

  await conn.query(
    `UPDATE user_bonus_wallets SET
      balance = ?,
      blocked_balance = ?,
      total_spent = total_spent + ?,
      total_withdrawn = total_withdrawn + ?
     WHERE user_id = ?`,
    [balanceAfter, blockedAfter, amount, amount, userId]
  );

  await conn.query(
    `INSERT INTO user_bonus_transactions
     (user_id, type, amount, balance_before, balance_after, comment)
     VALUES (?, 'withdraw_success', ?, ?, ?, ?)`,
    [userId, amount, balanceBefore, balanceAfter, adminComment || `Вывод успешно #${requestId}`]
  );

  await conn.query(
    `INSERT INTO bonuses (user_id, type, amount, balance_after, comment)
     VALUES (?, 'spend', ?, ?, ?)`,
    [userId, amount, balanceAfter, adminComment || `Вывод #${requestId}`]
  );

  return balanceAfter;
}

export async function createWithdrawalRequest(userId, body, ip) {
  const { method_id, wallet_number, amount, client_comment } = body;
  const amt = Math.round(Number(amount) * 100) / 100;

  if (!method_id || !wallet_number?.trim()) {
    const err = new Error('Укажите кошелёк и номер');
    err.status = 400;
    throw err;
  }
  if (!amt || amt <= 0) {
    const err = new Error('Сумма должна быть больше 0');
    err.status = 400;
    throw err;
  }

  if (!(await isWithdrawalSchemaReady())) {
    const err = new Error('Вывод средств временно недоступен. Обратитесь в поддержку.');
    err.status = 503;
    throw err;
  }

  const conn = await pool.getConnection();
  let request;
  let method;
  let userRow;
  let summaryBefore;
  try {
    await conn.beginTransaction();

    const [users] = await conn.query('SELECT id, name, phone, status FROM users WHERE id = ?', [userId]);
    if (!users.length) {
      const err = new Error('Пользователь не найден');
      err.status = 404;
      throw err;
    }
    if (users[0].status === 'blocked') {
      const err = new Error('Аккаунт заблокирован');
      err.status = 403;
      throw err;
    }

    const settings = await getWithdrawalSettings(conn);
    if (!settings.enabled) {
      const err = new Error('Вывод средств временно отключён');
      err.status = 403;
      throw err;
    }
    if (amt < settings.min_amount) {
      const err = new Error(`Минимальный вывод: ${settings.min_amount} сомони`);
      err.status = 400;
      throw err;
    }

    const dailySum = await getUserDailyWithdrawnSum(conn, userId);
    if (dailySum + amt > settings.max_daily_amount) {
      const err = new Error(`Максимум в день: ${settings.max_daily_amount} сомони`);
      err.status = 400;
      throw err;
    }

    const [activeReq] = await conn.query(
      `SELECT id FROM withdrawal_requests
       WHERE user_id = ? AND status IN ('pending', 'processing') LIMIT 1`,
      [userId]
    );
    if (activeReq.length) {
      const err = new Error('У вас уже есть заявка на вывод в обработке');
      err.status = 400;
      throw err;
    }

    const summary = await getWalletSummary(conn, userId, true);
    if (amt > summary.available_balance) {
      const err = new Error('Недостаточно доступного баланса');
      err.status = 400;
      throw err;
    }

    const [methods] = await conn.query(
      'SELECT * FROM withdrawal_methods WHERE id = ? AND status = ?',
      [method_id, 'active']
    );
    if (!methods.length) {
      const err = new Error('Кошелёк не найден');
      err.status = 400;
      throw err;
    }
    method = methods[0];
    userRow = users[0];

    const [ins] = await conn.query(
      `INSERT INTO withdrawal_requests
       (user_id, method_id, wallet_name, wallet_number, amount, status, client_comment)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [userId, method.id, method.name, wallet_number.trim(), amt, client_comment?.trim() || null]
    );
    const requestId = ins.insertId;

    await holdBalance(conn, userId, amt, requestId);
    await logStatusChange(conn, {
      requestId,
      oldStatus: null,
      newStatus: 'pending',
      comment: 'Создана клиентом',
      ip,
    });

    const [reqRows] = await conn.query('SELECT * FROM withdrawal_requests WHERE id = ?', [requestId]);
    request = reqRows[0];
    summaryBefore = summary;

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw mapWithdrawalError(err);
  } finally {
    conn.release();
  }

  try {
    const tgText = formatWithdrawalTelegramMessage({
      user: userRow,
      request,
      method,
      balance: summaryBefore.balance,
      available: summaryBefore.available_balance - amt,
    });
    const messageId = await sendTelegramMessage(tgText);
    if (messageId) {
      await pool.query('UPDATE withdrawal_requests SET telegram_message_id = ? WHERE id = ?', [
        messageId,
        request.id,
      ]);
    }
  } catch (err) {
    console.error('[withdrawal] post-commit notify:', err.message);
  }

  const after = await getWalletSummary(pool, userId);
  return { request: mapRequestRow(request, method), wallet: after };
}

export function mapRequestRow(r, method) {
  return {
    id: r.id,
    method_id: r.method_id,
    wallet_name: r.wallet_name || method?.name,
    wallet_number: r.wallet_number,
    amount: Number(r.amount),
    status: r.status,
    client_comment: r.client_comment,
    admin_comment: r.admin_comment,
    created_at: r.created_at,
    updated_at: r.updated_at,
    processed_at: r.processed_at,
    completed_at: r.completed_at,
    rejected_at: r.rejected_at,
    user_name: r.user_name,
    user_phone: r.user_phone,
    admin_login: r.admin_login,
  };
}

const STATUS_LABELS = {
  pending: 'Ожидает обработки',
  processing: 'В обработке',
  success: 'Успешно',
  rejected: 'Отклонено',
  cancelled: 'Отменено',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export async function listUserRequests(userId) {
  const [rows] = await pool.query(
    `SELECT wr.*, wm.name AS method_name
     FROM withdrawal_requests wr
     JOIN withdrawal_methods wm ON wm.id = wr.method_id
     WHERE wr.user_id = ?
     ORDER BY wr.created_at DESC
     LIMIT 100`,
    [userId]
  );
  return rows.map((r) => ({
    ...mapRequestRow(r, { name: r.method_name }),
    status_label: statusLabel(r.status),
  }));
}

export async function listAdminRequests(statusFilter) {
  let sql = `SELECT wr.*, u.name AS user_name, u.phone AS user_phone,
                    wm.name AS method_name, a.login AS admin_login
             FROM withdrawal_requests wr
             JOIN users u ON u.id = wr.user_id
             JOIN withdrawal_methods wm ON wm.id = wr.method_id
             LEFT JOIN admin_users a ON a.id = wr.admin_id`;
  const params = [];
  if (statusFilter) {
    sql += ' WHERE wr.status = ?';
    params.push(statusFilter);
  }
  sql += ' ORDER BY wr.created_at DESC LIMIT 500';
  const [rows] = await pool.query(sql, params);
  return rows.map((r) => ({
    ...mapRequestRow(r, { name: r.method_name }),
    status_label: statusLabel(r.status),
  }));
}

export async function getRequestById(id) {
  const [rows] = await pool.query(
    `SELECT wr.*, u.name AS user_name, u.phone AS user_phone,
            wm.name AS method_name, a.login AS admin_login
     FROM withdrawal_requests wr
     JOIN users u ON u.id = wr.user_id
     JOIN withdrawal_methods wm ON wm.id = wr.method_id
     LEFT JOIN admin_users a ON a.id = wr.admin_id
     WHERE wr.id = ?`,
    [id]
  );
  if (!rows.length) return null;
  const r = rows[0];
  const [logs] = await pool.query(
    `SELECT l.*, a.login AS admin_login FROM withdrawal_status_logs l
     LEFT JOIN admin_users a ON a.id = l.admin_id
     WHERE l.request_id = ? ORDER BY l.created_at ASC`,
    [id]
  );
  return {
    ...mapRequestRow(r, { name: r.method_name }),
    status_label: statusLabel(r.status),
    logs,
    wallet: await getWalletSummary(pool, r.user_id),
  };
}

async function transitionRequest(conn, { requestId, adminId, fromStatuses, toStatus, adminComment, ip, onTransition }) {
  const [rows] = await conn.query(
    'SELECT * FROM withdrawal_requests WHERE id = ? FOR UPDATE',
    [requestId]
  );
  if (!rows.length) {
    const err = new Error('Заявка не найдена');
    err.status = 404;
    throw err;
  }
  const req = rows[0];
  if (!fromStatuses.includes(req.status)) {
    const err = new Error(`Нельзя изменить статус с «${statusLabel(req.status)}»`);
    err.status = 400;
    throw err;
  }

  await onTransition(conn, req);

  const updates = { status: toStatus, admin_id: adminId, admin_comment: adminComment ?? req.admin_comment };
  const timeFields = [];
  if (toStatus === 'processing') timeFields.push('processed_at = NOW()');
  if (toStatus === 'success') timeFields.push('completed_at = NOW()');
  if (toStatus === 'rejected') timeFields.push('rejected_at = NOW()');

  await conn.query(
    `UPDATE withdrawal_requests SET status = ?, admin_id = ?, admin_comment = ?,
      updated_at = NOW()${timeFields.length ? ', ' + timeFields.join(', ') : ''}
     WHERE id = ?`,
    [toStatus, adminId, updates.admin_comment, requestId]
  );

  await logStatusChange(conn, {
    requestId,
    adminId,
    oldStatus: req.status,
    newStatus: toStatus,
    comment: adminComment,
    ip,
  });
}

export async function setProcessing(requestId, adminId, ip) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await transitionRequest(conn, {
      requestId,
      adminId,
      fromStatuses: ['pending'],
      toStatus: 'processing',
      ip,
      onTransition: async () => {},
    });
    await conn.commit();
    return getRequestById(requestId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function setSuccess(requestId, adminId, adminComment, ip) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await transitionRequest(conn, {
      requestId,
      adminId,
      fromStatuses: ['pending', 'processing'],
      toStatus: 'success',
      adminComment,
      ip,
      onTransition: async (c, req) => {
        await finalizeWithdraw(c, req.user_id, Number(req.amount), req.id, adminComment);
      },
    });
    await conn.commit();
    return getRequestById(requestId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function setRejected(requestId, adminId, adminComment, ip) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await transitionRequest(conn, {
      requestId,
      adminId,
      fromStatuses: ['pending', 'processing'],
      toStatus: 'rejected',
      adminComment,
      ip,
      onTransition: async (c, req) => {
        await releaseHold(
          c,
          req.user_id,
          Number(req.amount),
          req.id,
          'withdraw_reject',
          adminComment || `Отклонено #${req.id}`
        );
      },
    });
    await conn.commit();
    return getRequestById(requestId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function updateWithdrawalSettings(data) {
  await pool.query(
    `UPDATE withdrawal_settings SET
      enabled = ?,
      min_amount = ?,
      max_daily_amount = ?,
      updated_at = NOW()
     WHERE id = 1`,
    [data.enabled ? 1 : 0, data.min_amount, data.max_daily_amount]
  );
  return getWithdrawalSettings();
}

const DEFAULT_METHODS = [
  ['Душанбе Сити', 'dcity', 1],
  ['Алиф', 'alif', 2],
  ['Эсхата', 'eshata', 3],
  ['Спитамен', 'spitamen', 4],
  ['DC Next', 'dcnext', 5],
  ['Корти милли', 'korti', 6],
  ['Другое', 'other', 99],
];

/** Заполняет настройки и кошельки, если таблицы есть, но данных нет */
export async function ensureWithdrawalDefaults(conn = pool) {
  const [settings] = await conn.query('SELECT id FROM withdrawal_settings WHERE id = 1');
  if (!settings.length) {
    await conn.query(
      'INSERT INTO withdrawal_settings (id, enabled, min_amount, max_daily_amount) VALUES (1, 1, 20, 100)'
    );
  }
  const [methods] = await conn.query('SELECT id FROM withdrawal_methods LIMIT 1');
  if (!methods.length) {
    for (const [name, code, sort] of DEFAULT_METHODS) {
      await conn.query(
        `INSERT INTO withdrawal_methods (name, code, status, sort_order)
         VALUES (?, ?, 'active', ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), status = 'active'`,
        [name, code, sort]
      );
    }
  }
}

export async function listMethods(activeOnly = true, conn = pool) {
  if (await isWithdrawalSchemaReady(conn)) {
    await ensureWithdrawalDefaults(conn);
  }
  const sql = activeOnly
    ? 'SELECT * FROM withdrawal_methods WHERE status = ? ORDER BY sort_order, id'
    : 'SELECT * FROM withdrawal_methods ORDER BY sort_order, id';
  const params = activeOnly ? ['active'] : [];
  const [rows] = await conn.query(sql, params);
  return rows;
}
