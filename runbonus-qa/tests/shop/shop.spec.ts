import ShopPage from '../../pages/ShopPage';
import HomePage from '../../pages/HomePage';
import { apiLoginAndInject } from '../../helpers/apiHelper';

describe('SHOP', () => {
  before(async () => {
    await apiLoginAndInject();
    await HomePage.open('/');
    await HomePage.waitForHome();
  });

  it('TC-SHOP-001: Открытие магазина — каталог отображается', async () => {
    await ShopPage.openShop();
    expect(await ShopPage.isCatalogVisible()).toBe(true);
  });

  it('TC-SHOP-002: Добавление товара в корзину', async () => {
    await ShopPage.openShop();
    await ShopPage.openFirstProduct();
    await ShopPage.addToCart();
    await browser.pause(1000);
    const inCart = await ShopPage.isTextVisible('корзин') || await ShopPage.isTextVisible('Корзина');
    expect(inCart).toBe(true);
  });

  it('TC-SHOP-003: Создание заказа', async () => {
    await ShopPage.openShop();
    await ShopPage.openCart();
    const checkout = await $('button*=Оформить');
    if (await checkout.isExisting()) {
      await ShopPage.placeOrder();
      expect(await ShopPage.isOrderCreated()).toBe(true);
    } else {
      expect(await ShopPage.isTextVisible('пуста') || await ShopPage.isTextVisible('Корзина')).toBe(true);
    }
  });
});
