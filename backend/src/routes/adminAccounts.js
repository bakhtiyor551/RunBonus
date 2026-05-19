import { Router } from 'express';
import { pool } from '../db.js';
import { authAdmin } from '../middleware/auth.js';
import {
  listAccounts,
  getAccountById,
  createAccount,
  topupAccount,
  setAccountStatus,
  getAccountTransactions,
  getUserWalletInfo,
} from '../services/accountService.js';

const router = Router();

router.get('/accounts', authAdmin, async (_req, res) => {
  try {
    res.json(await listAccounts());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки счетов' });
  }
});

router.post('/accounts', authAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { name, type, initial_balance, currency, comment } = req.body;
    if (!name || !type) {
      return res.status(400).json({ error: 'Укажите название и тип счёта' });
    }
    if (!['bonus_fund', 'cash', 'bank'].includes(type)) {
      return res.status(400).json({ error: 'Недопустимый тип счёта' });
    }

    await conn.beginTransaction();
    const account = await createAccount(
      conn,
      { name, type, initial_balance, currency, comment },
      req.adminId
    );
    await conn.commit();
    res.status(201).json(account);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания счёта' });
  } finally {
    conn.release();
  }
});

router.get('/accounts/:id', authAdmin, async (req, res) => {
  try {
    const account = await getAccountById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Счёт не найден' });
    res.json(account);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.post('/accounts/:id/topup', authAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { amount, comment } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Укажите сумму пополнения' });
    }

    await conn.beginTransaction();
    const result = await topupAccount(conn, req.params.id, amount, comment, req.adminId);
    await conn.commit();
    const account = await getAccountById(req.params.id);
    res.json({ ok: true, ...result, account });
  } catch (err) {
    await conn.rollback();
    if (err.message === 'ACCOUNT_NOT_FOUND') {
      return res.status(404).json({ error: 'Счёт не найден' });
    }
    if (err.message === 'ACCOUNT_NOT_ACTIVE') {
      return res.status(400).json({ error: 'Счёт заблокирован или закрыт' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка пополнения' });
  } finally {
    conn.release();
  }
});

router.get('/accounts/:id/transactions', authAdmin, async (req, res) => {
  try {
    const account = await getAccountById(req.params.id);
    if (!account) return res.status(404).json({ error: 'Счёт не найден' });
    const transactions = await getAccountTransactions(req.params.id);
    res.json({ account, transactions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки истории' });
  }
});

router.post('/accounts/:id/status', authAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const account = await setAccountStatus(req.params.id, status);
    res.json(account);
  } catch (err) {
    if (err.message === 'ACCOUNT_NOT_FOUND') {
      return res.status(404).json({ error: 'Счёт не найден' });
    }
    if (err.message === 'INVALID_STATUS') {
      return res.status(400).json({ error: 'Недопустимый статус' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления статуса' });
  }
});

router.get('/users/:id/bonus-wallet', authAdmin, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, name, phone FROM users WHERE id = ?', [
      req.params.id,
    ]);
    if (!users.length) return res.status(404).json({ error: 'Клиент не найден' });
    const wallet = await getUserWalletInfo(req.params.id);
    res.json({ user: users[0], wallet });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

export default router;
