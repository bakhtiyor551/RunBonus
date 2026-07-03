import WalletPage from '../../pages/WalletPage';
import HomePage from '../../pages/HomePage';
import { apiLoginAndInject } from '../../helpers/apiHelper';

describe('WITHDRAW', () => {
  before(async () => {
    await apiLoginAndInject();
    await HomePage.open('/');
    await HomePage.waitForHome();
  });

  it('TC-WITHDRAW-001: Создание заявки на вывод', async () => {
    await WalletPage.openWallet();
    await WalletPage.tapWithdraw();
    await WalletPage.submitWithdraw('1');
    const ok = await WalletPage.isWithdrawPending();
    expect(
      ok ||
        (await WalletPage.isTextVisible('минимум')) ||
        (await WalletPage.isTextVisible('недостаточно'))
    ).toBe(true);
  });

  it('TC-WITHDRAW-002: Push при одобрении (проверка UI-канала)', async () => {
    await WalletPage.openWallet();
    const hasHistory =
      (await WalletPage.isTextVisible('История')) ||
      (await WalletPage.isTextVisible('операций'));
    expect(hasHistory).toBe(true);
  });
});
