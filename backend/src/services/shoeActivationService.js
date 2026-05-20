export async function activateShoeForUser(conn, userId, uniqueIdRaw) {
  const unique_id = uniqueIdRaw?.trim()?.toUpperCase();
  if (!unique_id) {
    const err = new Error('Введите код');
    err.status = 400;
    throw err;
  }

  const [shoes] = await conn.query('SELECT * FROM shoes WHERE unique_id = ? FOR UPDATE', [unique_id]);

  if (!shoes.length) {
    const err = new Error('Код не найден');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const shoe = shoes[0];

  if (shoe.status === 'blocked') {
    const err = new Error('Код заблокирован');
    err.status = 403;
    err.code = 'BLOCKED';
    throw err;
  }

  if (shoe.status === 'expired') {
    const err = new Error('Срок кода истёк');
    err.status = 403;
    err.code = 'EXPIRED';
    throw err;
  }

  if (shoe.status === 'activated') {
    const err = new Error('Этот код уже активирован');
    err.status = 409;
    err.code = 'ALREADY_USED';
    throw err;
  }

  await conn.query(
    `UPDATE shoes SET status = 'activated', activated_by_user_id = ?, activated_at = NOW()
     WHERE id = ?`,
    [userId, shoe.id]
  );

  await conn.query(
    `INSERT INTO user_active_shoes (user_id, shoe_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE shoe_id = VALUES(shoe_id)`,
    [userId, shoe.id]
  );

  return {
    id: shoe.id,
    unique_id: shoe.unique_id,
    model_name: shoe.model_name,
  };
}
