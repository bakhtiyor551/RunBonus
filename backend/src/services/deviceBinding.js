const DEVICE_HEADER = 'x-device-id';

export function getDeviceIdFromRequest(req) {
  const raw = req.headers[DEVICE_HEADER] || req.body?.deviceId || req.body?.device_id;
  const id = String(raw || '').trim();
  if (!id || id.length > 64) return null;
  return id;
}

export async function bindDeviceIfEmpty(conn, userId, deviceId) {
  if (!deviceId) return;
  await conn.query(
    `UPDATE users SET device_id = ?, device_bound_at = NOW()
     WHERE id = ? AND (device_id IS NULL OR device_id = '')`,
    [deviceId, userId]
  );
}

/** Активация QR только с привязанного устройства. */
export async function assertQrActivationDevice(conn, userId, deviceId) {
  if (!deviceId) {
    const err = new Error('Не удалось определить устройство. Переустановите приложение.');
    err.status = 400;
    err.code = 'DEVICE_REQUIRED';
    throw err;
  }

  const [rows] = await conn.query('SELECT device_id FROM users WHERE id = ? FOR UPDATE', [userId]);
  if (!rows.length) {
    const err = new Error('Пользователь не найден');
    err.status = 404;
    throw err;
  }

  const stored = rows[0].device_id;

  if (!stored) {
    await conn.query(
      'UPDATE users SET device_id = ?, device_bound_at = NOW() WHERE id = ?',
      [deviceId, userId]
    );
    return;
  }

  if (stored !== deviceId) {
    const err = new Error(
      'Активация QR доступна только на том устройстве, где вы впервые вошли в приложение.'
    );
    err.status = 403;
    err.code = 'DEVICE_MISMATCH';
    throw err;
  }
}

export function isDeviceMismatch(storedDeviceId, requestDeviceId) {
  if (!storedDeviceId || !requestDeviceId) return false;
  return storedDeviceId !== requestDeviceId;
}

/** Сброс привязки устройства (поддержка / админ). */
export async function resetUserDevice(conn, userId) {
  const [rows] = await conn.query('SELECT id, name, phone, device_id FROM users WHERE id = ?', [userId]);
  if (!rows.length) {
    const err = new Error('Клиент не найден');
    err.status = 404;
    throw err;
  }
  await conn.query(
    'UPDATE users SET device_id = NULL, device_bound_at = NULL WHERE id = ?',
    [userId]
  );
  return rows[0];
}
