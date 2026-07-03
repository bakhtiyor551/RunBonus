import { BasePage } from './BasePage';
import { ensureWebView } from '../helpers/webviewHelper';

export class ShopPage extends BasePage {
  async openShop(): Promise<void> {
    await this.tapNav('Магазин');
    await this.waitForText('Магазин');
  }

  async isCatalogVisible(): Promise<boolean> {
    await ensureWebView();
    const cards = await $$('.rb-shop-card');
    if (cards.length > 0) return true;
    return this.isTextVisible('сомони');
  }

  async openFirstProduct(): Promise<void> {
    const card = await $('.rb-shop-card');
    await card.waitForClickable({ timeout: 15000 });
    await card.click();
    await browser.pause(1000);
  }

  async addToCart(): Promise<void> {
    const btn = await $('button*=В корзину');
    if (await btn.isExisting()) {
      await btn.click();
      return;
    }
    const alt = await $('button*=Добавить');
    await alt.waitForClickable({ timeout: 10000 });
    await alt.click();
  }

  async openCart(): Promise<void> {
    const cart = await $('button*=Корзина');
    if (await cart.isExisting()) {
      await cart.click();
      return;
    }
    await browser.url('capacitor://localhost/cart');
    await browser.pause(1000);
  }

  async placeOrder(): Promise<void> {
    const btn = await $('button*=Оформить');
    await btn.waitForClickable({ timeout: 15000 });
    await btn.click();
    await browser.pause(2000);
  }

  async isOrderCreated(): Promise<boolean> {
    return (
      (await this.isTextVisible('Заказ')) ||
      (await this.isTextVisible('оформлен')) ||
      (await this.isTextVisible('Мои заказы'))
    );
  }
}

export default new ShopPage();
