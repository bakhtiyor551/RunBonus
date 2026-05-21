const DEVICE_HEADER = 'x-device-id';

export function getDeviceIdFromRequest(req) {
  const raw =
    (typeof req.get === 'function' && req.get(DEVICE_HEADER)) ||
    req.headers[DEVICE_HEADER] ||
    req.headers['X-Device-Id'] ||
    req.query?.device_id ||
    req.query?.deviceId ||
    req.body?.deviceId ||
    req.body?.device_id;
  const id = String(raw || '').trim();
  if (!id || id.length > 64) return null;
  return id;
}

/** @deprecated Используйте bindDeviceOnLogin / assertMatchingDevice */
export async function bindDeviceIfEmpty(conn, userId, deviceId) {
  if (!deviceId) return;
  await conn.query(
    `UPDATE users SET device_id = ?, device_bound_at = NOW()
     WHERE id = ? AND (device_id IS NULL OR device_id = '')`,
    [deviceId, userId]
  );
}

function deviceRequiredError() {
  const err = new Error('Не удалось определить устройство. Переустановите приложение.');
  err.status = 400;
  err.code = 'DEVICE_REQUIRED';
  return err;
}

function deviceMismatchError() {
  const err = new Error(
    'Аккаунт активен на другом телефоне. Войдите снова здесь — при входе это устройство станет основным.'
  );
  err.status = 403;
  err.code = 'DEVICE_MISMATCH';
  return err;
}

/** Вход: всегда привязать к текущему телефону (последний вход побеждает). */
export async function bindDeviceOnLogin(conn, userId, deviceId) {
  if (!deviceId) throw deviceRequiredError();
  const [rows] = await conn.query('SELECT device_id FROM users WHERE id = ?', [userId]);
  const previous = rows[0]?.device_id || null;
  await conn.query(
    'UPDATE users SET device_id = ?, device_bound_at = NOW() WHERE id = ?',
    [deviceId, userId]
  );
  return { previous_device_id: previous, device_changed: Boolean(previous && previous !== deviceId) };
}

/** Проверка: запрос только с привязанного устройства. */
export async function assertMatchingDevice(conn, userId, deviceId) {
  if (!deviceId) throw deviceRequiredError();

  const [rows] = await conn.query('SELECT device_id FROM users WHERE id = ?', [userId]);
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
    throw deviceMismatchError();
  }
}

/** Выход: сброс привязки только с телефона, который сейчас привязан в аккаунте. */
export async function unbindDeviceOnLogout(conn, userId, deviceId) {
  if (!deviceId) return { cleared: false };
  const [rows] = await conn.query('SELECT device_id FROM users WHERE id = ?', [userId]);
  if (!rows.length) return { cleared: false };
  if (rows[0].device_id !== deviceId) {
    return { cleared: false, mismatch: true };
  }
  await conn.query(
    'UPDATE users SET device_id = NULL, device_bound_at = NULL WHERE id = ?',
    [userId]
  );
  return { cleared: true };
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

/** Данные об устройстве для админ-панели. */
export function formatDeviceAdminInfo(deviceId, deviceBoundAt) {
  const id = deviceId ? String(deviceId).trim() : '';
  const bound = Boolean(id);
  const boundAt = deviceBoundAt ? new Date(deviceBoundAt) : null;
  const boundAtValid = boundAt && !Number.isNaN(boundAt.getTime());

  let daysBound = null;
  if (boundAtValid) {
    daysBound = Math.floor((Date.now() - boundAt.getTime()) / (24 * 60 * 60 * 1000));
  }

  const shortId = id
    ? id.length > 12
      ? `${id.slice(0, 8)}…${id.slice(-4)}`
      : id
    : null;

  return {
    bound,
    device_id: id || null,
    device_id_short: shortId,
    device_bound_at: boundAtValid ? boundAt.toISOString() : null,
    device_bound_at_label: boundAtValid
      ? boundAt.toLocaleString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null,
    days_bound: daysBound,
    status_label: bound ? 'Привязано' : 'Не привязано',
    status_hint: bound
      ? 'Сканирование QR и активация кроссовок разрешены только с этого телефона. При входе с другого устройства QR будет заблокирован.'
      : 'Клиент ещё не входил в приложение с привязкой или привязка была сброшена. После следующего входа в приложение устройство запишется автоматически.',
    qr_rule:
      'Первый успешный вход или регистрация в мобильном приложении фиксирует ID установки (UUID в памяти телефона).',
    reset_hint:
      'Сброс позволяет клиенту войти на новом телефоне и снова активировать QR. Старый ID устройства перестаёт действовать.',
  };
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
