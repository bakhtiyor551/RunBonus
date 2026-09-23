/** Ответ для клиента: километры и статус проверки, без денежной модели. */
export function buildClientFinishResponse({
  finalStatus,
  bonusAmount,
  distanceKm,
  durationSeconds,
  balanceAfter,
  rejectReason,
  levelUp,
}) {
  const approved = finalStatus === 'approved';

  let message;
  if (approved) {
    message = undefined;
  } else if (rejectReason) {
    message = rejectReason;
  } else {
    message = 'Дистанция на проверке';
  }

  return {
    title: 'Тренировка завершена!',
    status: finalStatus,
    distance_km: Number(distanceKm) || 0,
    duration_seconds: Number(durationSeconds) || 0,
    bonus_credited: false,
    bonus_earned: 0,
    balance_after: undefined,
    reject_reason: rejectReason || undefined,
    message,
    level_up: levelUp || undefined,
  };
}

/** Сообщения для клиента при старте (без упоминания лимитов). */
export const CLIENT_START_ERRORS = {
  NO_SHOE: 'Сначала активируйте кроссовки',
  SHOE_INACTIVE: 'Кроссовки не активированы',
  CANNOT_START: 'Сейчас нельзя начать тренировку. Попробуйте позже',
  GENERIC: 'Не удалось начать тренировку',
};
