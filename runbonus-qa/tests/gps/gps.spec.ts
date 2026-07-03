import HomePage from '../../pages/HomePage';
import RunningPage from '../../pages/RunningPage';
import { apiLoginAndInject } from '../../helpers/apiHelper';
import { enableGps, disableGps } from '../../helpers/adbHelper';
import { setGeoFix } from '../../helpers/gpsHelper';
import { config } from '../../helpers/config';

describe('GPS', () => {
  before(async () => {
    await apiLoginAndInject();
    enableGps();
    setGeoFix(config.startLng, config.startLat);
    await HomePage.open('/');
    await HomePage.waitForHome();
  });

  it('TC-GPS-001: Получение GPS координат', async () => {
    await HomePage.tapStartWorkout();
    await RunningPage.waitForWorkoutScreen();
    const running = await RunningPage.isTimerRunning();
    expect(running || (await RunningPage.isTextVisible('Активна'))).toBe(true);
  });

  it('TC-GPS-002: Потеря GPS — предупреждение', async () => {
    await HomePage.open('/');
    if (await HomePage.isTextVisible('Начать тренировку')) {
      await HomePage.tapStartWorkout();
      await RunningPage.waitForWorkoutScreen();
    }
    disableGps();
    await browser.pause(5000);
    const warning = await RunningPage.hasGpsWarning();
    expect(warning).toBe(true);
    enableGps();
    setGeoFix(config.startLng, config.startLat);
  });

  it('TC-GPS-003: Восстановление GPS — тренировка продолжается', async () => {
    enableGps();
    setGeoFix(config.startLng + 0.0001, config.startLat + 0.0001);
    await browser.pause(3000);
    const active =
      (await RunningPage.isTimerRunning()) ||
      (await RunningPage.isTextVisible('Активна')) ||
      (await RunningPage.isTextVisible('Продолжить'));
    expect(active).toBe(true);
  });
});
