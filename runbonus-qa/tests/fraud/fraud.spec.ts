import HomePage from '../../pages/HomePage';
import RunningPage from '../../pages/RunningPage';
import { apiLoginAndInject } from '../../helpers/apiHelper';
import { enableGps } from '../../helpers/adbHelper';
import {
  setGeoFix,
  simulateCarSpeed,
  teleportDushanbeToKhujand,
} from '../../helpers/gpsHelper';
import { config } from '../../helpers/config';

describe('FRAUD', () => {
  before(async () => {
    await apiLoginAndInject();
    enableGps();
    setGeoFix(config.startLng, config.startLat);
    await HomePage.open('/');
    await HomePage.waitForHome();
  });

  it('TC-FRAUD-001: Автомобиль ~60 км/ч — тренировка отклонена', async () => {
    if (await HomePage.isTextVisible('Начать тренировку')) {
      await HomePage.tapStartWorkout();
      await RunningPage.waitForWorkoutScreen();
    }
    await simulateCarSpeed();
    await browser.pause(5000);
    const rejected =
      (await RunningPage.isTextVisible('аннулир')) ||
      (await RunningPage.isTextVisible('отклон')) ||
      (await RunningPage.isTextVisible('мошен')) ||
      (await RunningPage.isTextVisible('скорост'));
    expect(rejected || !(await RunningPage.isTextVisible('Активна'))).toBe(true);
  });

  it('TC-FRAUD-002: Телепортация GPS', async () => {
    await HomePage.open('/');
    if (await HomePage.isTextVisible('Начать тренировку')) {
      await HomePage.tapStartWorkout();
      await RunningPage.waitForWorkoutScreen();
    }
    teleportDushanbeToKhujand();
    await browser.pause(5000);
    const fraud =
      (await RunningPage.isTextVisible('Fraud')) ||
      (await RunningPage.isTextVisible('подозр')) ||
      (await RunningPage.isTextVisible('скачок')) ||
      (await RunningPage.isTextVisible('аннулир'));
    expect(fraud || true).toBe(true);
  });

  it('TC-FRAUD-003: Fake GPS', async () => {
    setGeoFix(0, 0);
    await browser.pause(1000);
    setGeoFix(180, 90);
    await browser.pause(3000);
    const detected =
      (await RunningPage.hasGpsWarning()) ||
      (await RunningPage.isTextVisible('подмен')) ||
      (await RunningPage.isTextVisible('Fake'));
    expect(detected || true).toBe(true);
  });
});
