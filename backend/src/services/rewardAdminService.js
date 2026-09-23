import { pool } from '../db.js';

export async function listMilestones() {
  const [rows] = await pool.query(
    `SELECT m.*,
      (SELECT COUNT(*) FROM milestone_rewards mr WHERE mr.milestone_id = m.id AND mr.active = 1) AS rewards_count,
      (SELECT COUNT(*) FROM user_rewards ur WHERE ur.milestone_id = m.id) AS unlocked_count
     FROM reward_milestones m
     ORDER BY m.distance_km ASC`
  );
  return rows;
}

export async function saveMilestone(data, id = null) {
  const payload = [
    data.name,
    data.distance_km,
    data.description || null,
    data.status || 'active',
    data.sort_order ?? 0,
  ];
  if (id) {
    await pool.query(
      `UPDATE reward_milestones
       SET name=?, distance_km=?, description=?, status=?, sort_order=?
       WHERE id=?`,
      [...payload, id]
    );
    return id;
  }
  const [res] = await pool.query(
    `INSERT INTO reward_milestones (name, distance_km, description, status, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
    payload
  );
  return res.insertId;
}

export async function listRewards() {
  const [rows] = await pool.query(`SELECT * FROM rewards ORDER BY id DESC`);
  for (const r of rows) {
    if (typeof r.size_options === 'string') {
      try {
        r.size_options = JSON.parse(r.size_options);
      } catch {
        r.size_options = [];
      }
    }
    const [stock] = await pool.query(
      `SELECT * FROM reward_stock WHERE reward_id = ? ORDER BY size`,
      [r.id]
    );
    r.stock_variants = stock;
    r.available = Math.max(0, Number(r.stock) - Number(r.reserved));
  }
  return rows;
}

export async function saveReward(data, id = null) {
  const sizeOptions = data.size_options
    ? JSON.stringify(data.size_options)
    : null;
  const payload = [
    data.name,
    data.type || 'PRODUCT',
    data.description || null,
    data.image || null,
    data.stock ?? 0,
    data.discount_percent ?? null,
    data.discount_min_amount ?? 0,
    data.discount_max_amount ?? null,
    data.discount_valid_days ?? 30,
    data.discount_usage_limit ?? 1,
    data.requires_size ? 1 : 0,
    sizeOptions,
    data.cost_amount ?? 0,
    data.active == null ? 1 : data.active ? 1 : 0,
  ];
  if (id) {
    await pool.query(
      `UPDATE rewards SET
        name=?, type=?, description=?, image=?, stock=?,
        discount_percent=?, discount_min_amount=?, discount_max_amount=?,
        discount_valid_days=?, discount_usage_limit=?,
        requires_size=?, size_options=?, cost_amount=?, active=?
       WHERE id=?`,
      [...payload, id]
    );
    return id;
  }
  const [res] = await pool.query(
    `INSERT INTO rewards
      (name, type, description, image, stock, discount_percent, discount_min_amount,
       discount_max_amount, discount_valid_days, discount_usage_limit,
       requires_size, size_options, cost_amount, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    payload
  );
  return res.insertId;
}

export async function setMilestoneRewards(milestoneId, rewardIds = []) {
  await pool.query(`DELETE FROM milestone_rewards WHERE milestone_id = ?`, [milestoneId]);
  let sort = 10;
  for (const rewardId of rewardIds) {
    await pool.query(
      `INSERT INTO milestone_rewards (milestone_id, reward_id, sort_order, active)
       VALUES (?, ?, ?, 1)`,
      [milestoneId, rewardId, sort]
    );
    sort += 10;
  }
}

export async function getMilestoneRewardLinks(milestoneId) {
  const [rows] = await pool.query(
    `SELECT mr.*, r.name AS reward_name, r.type AS reward_type
     FROM milestone_rewards mr
     JOIN rewards r ON r.id = mr.reward_id
     WHERE mr.milestone_id = ?
     ORDER BY mr.sort_order`,
    [milestoneId]
  );
  return rows;
}

export async function upsertStockVariant({ rewardId, size = '', color = '', quantity }) {
  await pool.query(
    `INSERT INTO reward_stock (reward_id, size, color, quantity, reserved)
     VALUES (?, ?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
    [rewardId, size, color, quantity]
  );
}

export async function listUserRewards(filters = {}) {
  const where = ['1=1'];
  const params = [];
  if (filters.status) {
    where.push('ur.status = ?');
    params.push(filters.status);
  }
  if (filters.user_id) {
    where.push('ur.user_id = ?');
    params.push(filters.user_id);
  }
  if (filters.milestone_id) {
    where.push('ur.milestone_id = ?');
    params.push(filters.milestone_id);
  }
  if (filters.q) {
    where.push('(u.name LIKE ? OR u.phone LIKE ? OR r.name LIKE ?)');
    const q = `%${filters.q}%`;
    params.push(q, q, q);
  }
  if (filters.city) {
    where.push('rd.city = ?');
    params.push(filters.city);
  }

  const [rows] = await pool.query(
    `SELECT ur.*,
            u.name AS user_name, u.phone AS user_phone, u.total_distance_km,
            m.name AS milestone_name, m.distance_km,
            r.name AS reward_name, r.type AS reward_type, r.cost_amount,
            rd.size, rd.color, rd.city, rd.address, rd.phone AS delivery_phone,
            rd.delivery_status, rd.tracking_number, rd.admin_comment AS delivery_comment,
            rpc.code AS promo_code, rpc.status AS promo_status, rpc.expires_at
     FROM user_rewards ur
     JOIN users u ON u.id = ur.user_id
     JOIN reward_milestones m ON m.id = ur.milestone_id
     LEFT JOIN rewards r ON r.id = ur.reward_id
     LEFT JOIN reward_delivery rd ON rd.user_reward_id = ur.id
     LEFT JOIN reward_promo_codes rpc ON rpc.user_reward_id = ur.id
     WHERE ${where.join(' AND ')}
     ORDER BY ur.updated_at DESC
     LIMIT 500`,
    params
  );
  return rows;
}

export async function updateUserRewardStatus(id, status, { adminComment, trackingNumber } = {}) {
  const allowed = ['AVAILABLE', 'SELECTED', 'PROCESSING', 'READY', 'DELIVERED', 'CANCELLED'];
  if (!allowed.includes(status)) {
    const err = new Error('Некорректный статус');
    err.code = 'BAD_STATUS';
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[ur]] = await conn.query(`SELECT * FROM user_rewards WHERE id = ? FOR UPDATE`, [id]);
    if (!ur) {
      const err = new Error('Запись не найдена');
      err.code = 'NOT_FOUND';
      throw err;
    }

    const extra = [];
    const params = [status];
    if (adminComment != null) {
      extra.push('admin_comment = ?');
      params.push(adminComment);
    }
    if (status === 'READY' || status === 'PROCESSING') {
      extra.push('processed_at = COALESCE(processed_at, NOW())');
    }
    if (status === 'DELIVERED') {
      extra.push('delivered_at = NOW()');
    }
    params.push(id);
    await conn.query(
      `UPDATE user_rewards SET status = ?${extra.length ? ', ' + extra.join(', ') : ''} WHERE id = ?`,
      params
    );

    const deliveryMap = {
      PROCESSING: 'processing',
      READY: 'ready',
      DELIVERED: 'delivered',
      CANCELLED: 'cancelled',
    };
    if (deliveryMap[status]) {
      await conn.query(
        `UPDATE reward_delivery
         SET delivery_status = ?,
             tracking_number = COALESCE(?, tracking_number),
             admin_comment = COALESCE(?, admin_comment)
         WHERE user_reward_id = ?`,
        [deliveryMap[status], trackingNumber || null, adminComment || null, id]
      );
    }

    // On deliver physical: consume reserved stock
    if (status === 'DELIVERED' && ur.reward_id) {
      const [[reward]] = await conn.query(`SELECT * FROM rewards WHERE id = ?`, [ur.reward_id]);
      const [[del]] = await conn.query(
        `SELECT size FROM reward_delivery WHERE user_reward_id = ?`,
        [id]
      );
      if (reward && reward.type !== 'DISCOUNT') {
        if (reward.requires_size && del?.size) {
          await conn.query(
            `UPDATE reward_stock
             SET quantity = GREATEST(0, quantity - 1),
                 reserved = GREATEST(0, reserved - 1)
             WHERE reward_id = ? AND size = ?`,
            [reward.id, del.size]
          );
        } else {
          await conn.query(
            `UPDATE rewards
             SET stock = GREATEST(0, stock - 1),
                 reserved = GREATEST(0, reserved - 1)
             WHERE id = ?`,
            [reward.id]
          );
        }
      }
    }

    await conn.commit();
    return listUserRewards({}).then((rows) => rows.find((r) => r.id === id));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function adminChangeReward(userRewardId, { rewardId, size, comment }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[ur]] = await conn.query(`SELECT * FROM user_rewards WHERE id = ? FOR UPDATE`, [
      userRewardId,
    ]);
    if (!ur) {
      const err = new Error('Не найдено');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const [[reward]] = await conn.query(`SELECT * FROM rewards WHERE id = ?`, [rewardId]);
    if (!reward) {
      const err = new Error('Награда не найдена');
      err.code = 'NOT_FOUND';
      throw err;
    }
    await conn.query(
      `UPDATE user_rewards SET reward_id = ?, status = 'PROCESSING', admin_comment = ?, processed_at = NOW()
       WHERE id = ?`,
      [rewardId, comment || null, userRewardId]
    );
    if (reward.type !== 'DISCOUNT') {
      await conn.query(
        `INSERT INTO reward_delivery (user_reward_id, user_id, reward_id, size, delivery_status)
         VALUES (?, ?, ?, ?, 'processing')
         ON DUPLICATE KEY UPDATE reward_id = VALUES(reward_id), size = VALUES(size), delivery_status = 'processing'`,
        [userRewardId, ur.user_id, rewardId, size || null]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function listPromoCodes(filters = {}) {
  const where = ['1=1'];
  const params = [];
  if (filters.status) {
    where.push('p.status = ?');
    params.push(filters.status);
  }
  const [rows] = await pool.query(
    `SELECT p.*, u.name AS user_name, u.phone AS user_phone, r.name AS reward_name, m.distance_km
     FROM reward_promo_codes p
     JOIN users u ON u.id = p.user_id
     JOIN rewards r ON r.id = p.reward_id
     JOIN reward_milestones m ON m.id = p.milestone_id
     WHERE ${where.join(' AND ')}
     ORDER BY p.created_at DESC
     LIMIT 500`,
    params
  );
  return rows;
}

export async function getRewardsStats() {
  const [[users]] = await pool.query(`SELECT COUNT(*) AS c FROM users`);
  const [milestones] = await pool.query(
    `SELECT m.id, m.name, m.distance_km,
      (SELECT COUNT(DISTINCT ur.user_id) FROM user_rewards ur WHERE ur.milestone_id = m.id) AS reached
     FROM reward_milestones m
     WHERE m.status = 'active'
     ORDER BY m.distance_km`
  );
  const [[selected]] = await pool.query(
    `SELECT COUNT(*) AS c FROM user_rewards
     WHERE status IN ('SELECTED','PROCESSING','READY','DELIVERED') AND reward_id IS NOT NULL`
  );
  const [[delivered]] = await pool.query(
    `SELECT COUNT(*) AS c FROM user_rewards WHERE status = 'DELIVERED'`
  );
  const [[activePromos]] = await pool.query(
    `SELECT COUNT(*) AS c FROM reward_promo_codes WHERE status = 'ACTIVE'`
  );
  const [[giftCost]] = await pool.query(
    `SELECT COALESCE(SUM(r.cost_amount), 0) AS c
     FROM user_rewards ur
     JOIN rewards r ON r.id = ur.reward_id
     WHERE ur.status IN ('PROCESSING','READY','DELIVERED') AND r.type <> 'DISCOUNT'`
  );
  const [stock] = await pool.query(
    `SELECT id, name, stock, reserved, (stock - reserved) AS available, cost_amount
     FROM rewards WHERE type IN ('PRODUCT','SPECIAL','VIP') AND active = 1`
  );

  return {
    totalUsers: Number(users.c),
    milestones: milestones.map((m) => ({
      id: m.id,
      name: m.name,
      distanceKm: Number(m.distance_km),
      reached: Number(m.reached),
    })),
    selectedCount: Number(selected.c),
    deliveredCount: Number(delivered.c),
    activePromoCount: Number(activePromos.c),
    giftCostTotal: Number(giftCost.c),
    stock,
  };
}
