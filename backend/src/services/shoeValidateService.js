/**
 * Проверка QR/ID кроссовок до активации (регистрация).
 */
export async function validateShoeQr(conn, uniqueIdRaw) {
  const unique_id = uniqueIdRaw?.trim()?.toUpperCase();
  if (!unique_id) {
    return { valid: false, error: 'QR-код недействителен', code: 'INVALID' };
  }

  const [shoes] = await conn.query(
    `SELECT s.*, sb.id AS batch_ok
     FROM shoes s
     LEFT JOIN shoe_batches sb ON sb.id = s.batch_id
     WHERE s.unique_id = ?`,
    [unique_id]
  );

  if (!shoes.length) {
    return { valid: false, error: 'QR-код недействителен', code: 'NOT_FOUND' };
  }

  const shoe = shoes[0];

  if (shoe.status === 'blocked') {
    return { valid: false, error: 'QR-код заблокирован', code: 'BLOCKED' };
  }

  if (shoe.status === 'expired') {
    return { valid: false, error: 'QR-код недействителен', code: 'EXPIRED' };
  }

  if (shoe.status === 'activated') {
    return { valid: false, error: 'QR-код уже использован', code: 'ALREADY_USED' };
  }

  if (shoe.status !== 'new') {
    return { valid: false, error: 'QR-код недействителен', code: 'INVALID_STATUS' };
  }

  return {
    valid: true,
    shoe: {
      unique_id: shoe.unique_id,
      model_name: shoe.model_name,
      batch_id: shoe.batch_id,
    },
  };
}
