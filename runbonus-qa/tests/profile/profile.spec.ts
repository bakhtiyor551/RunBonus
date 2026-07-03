import ProfilePage from '../../pages/ProfilePage';
import HomePage from '../../pages/HomePage';
import { apiLoginAndInject } from '../../helpers/apiHelper';

describe('PROFILE', () => {
  before(async () => {
    await apiLoginAndInject();
    await HomePage.open('/');
    await HomePage.waitForHome();
  });

  it('TC-PROFILE-001: Заполнение профиля', async () => {
    await ProfilePage.openProfile();
    await ProfilePage.tapEdit();
    await ProfilePage.fillProfile({
      firstName: 'Тест',
      lastName: 'Автотест',
    });
    const inputs = await $$('input[type="text"]');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it('TC-PROFILE-002: Сохранение профиля', async () => {
    await ProfilePage.openProfile();
    await ProfilePage.tapEdit();
    await ProfilePage.fillProfile({
      firstName: 'RunBonus',
      lastName: 'QA',
    });
    await ProfilePage.saveProfile();
    await browser.pause(1500);
    const name = await ProfilePage.getDisplayedName();
    expect(name.length).toBeGreaterThan(0);
  });
});
