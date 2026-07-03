import HomePage from '../../pages/HomePage';
import RunningPage from '../../pages/RunningPage';
import { apiLoginAndInject } from '../../helpers/apiHelper';
import { enableGps } from '../../helpers/adbHelper';
import { setGeoFix, playRouteKm } from '../../helpers/gpsHelper';
import { config } from '../../helpers/config';
import { prepareAppSession } from '../../helpers/webviewHelper';

describe('RUNNING', () => {
  before(async () => {
    await prepareAppSession();
    await apiLoginAndInject();
    enableGps();
    setGeoFix(config.startLng, config.startLat);
    await HomePage.open('/');
    await HomePage.waitForHome();

    if (await HomePage.isTextVisible('Продолжить тренировку')) {
      await HomePage.tapStartWorkout();
      await RunningPage.waitForWorkoutScreen();
      await RunningPage.holdToFinish();
      await browser.pause(3000);
      await HomePage.open('/');
      await HomePage.waitForHome();
    }
  });

  it('TC-RUN-001: Старт тренировки — таймер работает', async () => {
    await HomePage.tapStartWorkout();
    await RunningPage.waitForWorkoutScreen();
    expect(
      (await RunningPage.isTimerRunning()) || (await RunningPage.isTextVisible('Активна'))
    ).toBe(true);
  });

  it('TC-RUN-002: Пауза — время остановлено', async () => {
    await RunningPage.tapPause();
    await browser.pause(2000);
    expect(await RunningPage.isPaused() || await RunningPage.isTextVisible('Пауза')).toBe(true);
  });

  it('TC-RUN-003: Продолжение тренировки', async () => {
    await RunningPage.tapResume();
    await browser.pause(1500);
    expect(
      (await RunningPage.isTimerRunning()) || (await RunningPage.isTextVisible('Активна'))
    ).toBe(true);
  });

  it('TC-RUN-004: Финиш — тренировка сохранена', async () => {
    await playRouteKm(0.6, 500);
    await RunningPage.holdToFinish();
    await browser.pause(3000);
    const saved =
      (await HomePage.isOnHome()) ||
      (await RunningPage.isTextVisible('сохранен')) ||
      (await RunningPage.isTextVisible('завершен'));
    expect(saved).toBe(true);
  });

  it('TC-RUN-ROUTE-1KM: Маршрут 1 км', async () => {
    await HomePage.open('/');
    if (await HomePage.isTextVisible('Начать тренировку')) {
      await HomePage.tapStartWorkout();
      await RunningPage.waitForWorkoutScreen();
    }
    await playRouteKm(1, 800);
    const dist = await RunningPage.getDistanceText();
    expect(dist.length).toBeGreaterThan(0);
  });

  it('TC-RUN-ROUTE-5KM: Маршрут 5 км (сокращённый в FAST)', async () => {
    await playRouteKm(1.5, 300);
    const dist = await RunningPage.getDistanceText();
    expect(dist).toBeTruthy();
  });
});
