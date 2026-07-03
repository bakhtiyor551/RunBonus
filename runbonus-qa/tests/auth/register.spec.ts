import LoginPage from '../../pages/LoginPage';
import { prepareAppSession, isTextOnScreen } from '../../helpers/webviewHelper';

describe('REGISTER', () => {
  before(async () => {
    await prepareAppSession({ clearData: true });
    await LoginPage.open('/register');
    await browser.pause(2000);
  });

  it('TC-REG-001: Форма регистрации отображается', async () => {
    const visible =
      (await isTextOnScreen('Регистрация')) ||
      (await isTextOnScreen('Имя')) ||
      (await isTextOnScreen('Фамилия')) ||
      (await isTextOnScreen('Данные'));
    expect(visible).toBe(true);
  });
});
