import { BasePage } from './BasePage';

export class WalletPage extends BasePage {
  async openWallet(): Promise<void> {
    await this.tapNav('Кошелёк');
    await this.waitForText('Доступный баланс');
  }

  async tapWithdraw(): Promise<void> {
    const btn = await $('button*=Вывод средств');
    await btn.waitForClickable({ timeout: 10000 });
    await btn.click();
    await browser.pause(1000);
  }

  async submitWithdraw(amount: string): Promise<void> {
    const input = await $('input[type="number"], input[type="tel"]');
    if (await input.isExisting()) {
      await input.setValue(amount);
    }
    const btn = await $('button*=Создать заявку');
    if (await btn.isExisting()) {
      await btn.click();
    } else {
      const submit = await $('button[type="submit"]');
      await submit.click();
    }
    await browser.pause(2000);
  }

  async isWithdrawPending(): Promise<boolean> {
    return (
      (await this.isTextVisible('Новая')) ||
      (await this.isTextVisible('на рассмотрении')) ||
      (await this.isTextVisible('заявка'))
    );
  }
}

export default new WalletPage();
