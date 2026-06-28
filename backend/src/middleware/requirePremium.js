import { isPremiumActive } from '../services/subscriptionService.js';

export async function requirePremium(req, res, next) {
  try {
    const premium = await isPremiumActive(req.userId);
    if (!premium) {
      return res.status(403).json({
        error: 'Питание доступно только в RunBonus+',
        code: 'PREMIUM_REQUIRED',
      });
    }
    next();
  } catch (err) {
    console.error('[requirePremium]', err);
    res.status(500).json({ error: 'Ошибка проверки подписки' });
  }
}

/** Проверка premium без блокировки — для preview */
export async function attachPremiumFlag(req, _res, next) {
  try {
    req.isPremium = await isPremiumActive(req.userId);
  } catch {
    req.isPremium = false;
  }
  next();
}
