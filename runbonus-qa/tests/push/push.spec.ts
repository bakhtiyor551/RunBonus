import HomePage from '../../pages/HomePage';
import ShopPage from '../../pages/ShopPage';
import { apiLoginAndInject } from '../../helpers/apiHelper';
import { ensureWebView } from '../../helpers/webviewHelper';

describe('PUSH', () => {
  before(async () => {
    await apiLoginAndInject();
    await HomePage.open('/');
    await HomePage.waitForHome();
  });

  it('TC-PUSH-001: Канал уведомлений — заказы', async () => {
    await browser.url('capacitor://localhost/orders');
    await browser.pause(1500);
    await ensureWebView();
    const page =
      (await ShopPage.isTextVisible('Заказ')) ||
      (await ShopPage.isTextVisible('Мои')) ||
      (await ShopPage.isTextVisible('заказ'));
    expect(page).toBe(true);
  });

  it('TC-PUSH-002: Вывод средств — раздел кошелька доступен', async () => {
    await HomePage.tapNav('Кошелёк');
    await HomePage.waitForText('Доступный баланс');
    expect(await HomePage.isTextVisible('Вывод средств')).toBe(true);
  });
});
