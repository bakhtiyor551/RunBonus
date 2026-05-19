import bcrypt from 'bcryptjs';
import { pool } from './db.js';

async function seed() {
  const adminHash = await bcrypt.hash('admin123', 10);
  await pool.query(
    `INSERT IGNORE INTO admin_users (login, password_hash, role)
     VALUES ('admin', ?, 'super_admin')`,
    [adminHash]
  );

  const [funds] = await pool.query(
    "SELECT id FROM accounts WHERE type = 'bonus_fund' LIMIT 1"
  );
  if (!funds.length) {
    const [acc] = await pool.query(
      `INSERT INTO accounts (name, type, initial_balance, current_balance, currency, comment, status)
       VALUES (?, 'bonus_fund', 10000, 10000, 'TJS', ?, 'active')`,
      [
        'Бонусный фонд RunBonus',
        'Основной счёт для начисления бонусов клиентам',
      ]
    );
    await pool.query(
      `INSERT INTO account_transactions
       (account_id, type, amount, balance_before, balance_after, comment)
       VALUES (?, 'topup', 10000, 0, 10000, ?)`,
      [acc.insertId, 'Начальный баланс при открытии счёта']
    );
    console.log('Бонусный фонд: 10 000 сомони');
  }

  const [usersWithoutWallet] = await pool.query(
    `SELECT u.id FROM users u
     LEFT JOIN user_bonus_wallets w ON w.user_id = u.id
     WHERE w.id IS NULL`
  );
  for (const u of usersWithoutWallet) {
    const [last] = await pool.query(
      'SELECT balance_after FROM bonuses WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [u.id]
    );
    const balance = last.length ? Number(last[0].balance_after) : 0;
    const [earned] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS t FROM bonuses WHERE user_id = ? AND type IN ('earn', 'manual_add')`,
      [u.id]
    );
    const [spent] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS t FROM bonuses WHERE user_id = ? AND type IN ('spend', 'manual_remove')`,
      [u.id]
    );
    await pool.query(
      'INSERT INTO user_bonus_wallets (user_id, balance, total_earned, total_spent) VALUES (?, ?, ?, ?)',
      [u.id, balance, Number(earned[0].t), Number(spent[0].t)]
    );
  }

  const [shoes] = await pool.query('SELECT id FROM shoes LIMIT 1');
  if (!shoes.length) {
    await pool.query(
      `INSERT INTO shoes (model_name, qr_code, unique_id, status)
       VALUES ('Demo Runner', 'SHOE-DEMO-001', 'SHOE-DEMO-001', 'new')`
    );
    console.log('Тестовый код для активации: SHOE-DEMO-001');
  }

  console.log('Seed OK. Админ: login=admin, password=admin123');
  await pool.end();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
