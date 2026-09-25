/** Ответ для клиента: километры и статус проверки (backend source of truth). */
export function buildClientFinishResponse({
  finalStatus,
  bonusAmount,
  distanceKm,
  approvedDistanceKm,
  durationSeconds,
  balanceAfter,
  rejectReason,
  validationReasons,
}) {
  const approved = finalStatus === 'approved';
  const dist = Number(distanceKm) || 0;
  const approvedKm = approved ? Number(approvedDistanceKm ?? dist) || 0 : 0;

  let message;
  if (approved) {
    message = undefined;
  } else if (rejectReason) {
    message = rejectReason;
  } else if (finalStatus === 'suspicious') {
    message = 'Тренировка на проверке у администратора';
  } else if (finalStatus === 'processing') {
    message = 'Идёт проверка GPS…';
  } else {
    message = 'Дистанция на проверке';
  }

  return {
    title: 'Тренировка завершена!',
    status: finalStatus,
    distance_km: dist,
    distanceKm: dist,
    approved_distance_km: approvedKm,
    approvedDistanceKm: approvedKm,
    duration_seconds: Number(durationSeconds) || 0,
    bonus_credited: false,
    bonus_earned: 0,
    balance_after: undefined,
    reject_reason: rejectReason || undefined,
    validation_reasons: validationReasons || undefined,
    message,
  };
}

/** Сообщения для клиента при старте (без упоминания лимитов). */
export const CLIENT_START_ERRORS = {
  NO_SHOE: 'Сначала активируйте кроссовки',
  SHOE_INACTIVE: 'Кроссовки не активированы',
  CANNOT_START: 'Сейчас нельзя начать тренировку. Попробуйте позже',
  ACTIVE_WORKOUT: 'Уже есть активная тренировка',
  GENERIC: 'Не удалось начать тренировку',
};
