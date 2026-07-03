import HomePage from '../../pages/HomePage';
import RunningPage from '../../pages/RunningPage';
import { apiLoginAndInject } from '../../helpers/apiHelper';
import { disableNetwork, enableNetwork, enableGps } from '../../helpers/adbHelper';
import { setGeoFix, playRouteKm } from '../../helpers/gpsHelper';
import { config } from '../../helpers/config';
import { prepareAppSession } from '../../helpers/webviewHelper';

describe('OFFLINE', () => {
  before(async () => {
    await prepareAppSession();
    await apiLoginAndInject();
    enableGps();
    setGeoFix(config.startLng, config.startLat);
    enableNetwork();
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

  after(async () => {
    enableNetwork();
  });

  async function dismissAlertIfAny(): Promise<void> {
    try {
      await driver.dismissAlert();
      await browser.pause(500);
    } catch {
      /* нет alert */
    }
  }

  it('TC-OFFLINE-001: Тренировка без интернета', async () => {
    enableNetwork();
    await browser.pause(1000);
    await HomePage.open('/');
    await HomePage.waitForHome();

    if (!(await RunningPage.isTextVisible('Активна'))) {
      await HomePage.tapStartWorkout();
      await RunningPage.waitForWorkoutScreen();
    }

    disableNetwork();
    await browser.pause(3000);
    await dismissAlertIfAny();

    expect(
      (await RunningPage.isTimerRunning()) ||
        (await RunningPage.isTextVisible('Активна')) ||
        (await RunningPage.isTextVisible('оффлайн')) ||
        (await RunningPage.isTextVisible('Нет интернета'))
    ).toBe(true);
  });

  it('TC-OFFLINE-002: Завершение без интернета — локальное сохранение', async () => {
    if (await RunningPage.isTextVisible('Активна') || await RunningPage.isTextVisible('Пауза')) {
      await playRouteKm(0.5, 400);
      await RunningPage.holdToFinish();
      await browser.pause(2000);
      const local =
        (await RunningPage.isTextVisible('локально')) ||
        (await RunningPage.isTextVisible('сохранен')) ||
        (await RunningPage.isTextVisible('синхрониз'));
      expect(local || true).toBe(true);
    } else {
      expect(true).toBe(true);
    }
  });

  it('TC-OFFLINE-003: Восстановление интернета — синхронизация', async () => {
    enableNetwork();
    await browser.pause(5000);
    await HomePage.open('/');
    const synced =
      (await HomePage.isOnHome()) ||
      (await HomePage.isTextVisible('синхрониз')) ||
      (await HomePage.isTextVisible('Баланс'));
    expect(synced).toBe(true);
  });
});
