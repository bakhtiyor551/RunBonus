/** Ответ для клиента без лимитов и внутренних причин. */
export function buildClientFinishResponse({
  finalStatus,
  bonusAmount,
  distanceKm,
  balanceAfter,
  rejectReason,
}) {
  const credited = finalStatus === 'approved' && bonusAmount > 0;

  let message;
  if (credited) {
    message = undefined;
  } else if (rejectReason) {
    message = rejectReason;
  } else {
    message = 'Бонус не начислен по правилам программы';
  }

  return {
    title: 'Тренировка завершена',
    status: finalStatus,
    distance_km: Number(distanceKm) || 0,
    bonus_credited: credited,
    bonus_earned: credited ? bonusAmount : 0,
    balance_after: balanceAfter != null ? balanceAfter : undefined,
    reject_reason: rejectReason || undefined,
    message,
  };
}

/** Сообщения для клиента при старте (без упоминания лимитов). */
export const CLIENT_START_ERRORS = {
  NO_SHOE: 'Сначала активируйте кроссовки',
  SHOE_INACTIVE: 'Кроссовки не активированы',
  CANNOT_START: 'Сейчас нельзя начать тренировку. Попробуйте позже',
  GENERIC: 'Не удалось начать тренировку',
};
