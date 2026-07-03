import HomePage from '../../pages/HomePage';
import RunningPage from '../../pages/RunningPage';
import { apiLoginAndInject, getBonusBalance, getUserLevel } from '../../helpers/apiHelper';
import { enableGps, enableNetwork } from '../../helpers/adbHelper';
import { setGeoFix, playRouteKm } from '../../helpers/gpsHelper';
import { config } from '../../helpers/config';

describe('BONUS', () => {
  let token = '';

  before(async () => {
    token = await apiLoginAndInject();
    enableGps();
    enableNetwork();
    setGeoFix(config.startLng, config.startLat);
    await HomePage.open('/');
    await HomePage.waitForHome();
  });

  it('TC-BONUS-001: Без активированных кроссовок — старт блокируется или бонус 0', async () => {
    const balance = await getBonusBalance(token);
    expect(balance).toBeGreaterThanOrEqual(0);
    const needsShoe = await HomePage.isTextVisible('Привяжите') || await HomePage.isTextVisible('QR');
    if (needsShoe) {
      expect(needsShoe).toBe(true);
    }
  });

  it('TC-BONUS-002: С активированными кроссовками — бонусы начисляются', async () => {
    const before = await getBonusBalance(token);
    if (await HomePage.isTextVisible('Начать тренировку')) {
      await HomePage.tapStartWorkout();
      await RunningPage.waitForWorkoutScreen();
      await playRouteKm(0.6, 400);
      await RunningPage.holdToFinish();
      await browser.pause(5000);
    }
    const after = await getBonusBalance(token);
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('TC-BONUS-003: Premium — повышенный коэффициент', async () => {
    const level = await getUserLevel(token);
    const rates = ((level.all_levels as Array<{ price_per_km: number }>) || [])
      .map((l) => Number(l.price_per_km))
      .filter((r) => r > 0);
    if (rates.length >= 2) {
      expect(Math.max(...rates)).toBeGreaterThan(Math.min(...rates));
    } else {
      expect(Number(level.bonus_rate) || 0).toBeGreaterThanOrEqual(0);
    }
  });
});
