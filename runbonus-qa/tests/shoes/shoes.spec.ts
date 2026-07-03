import ActivatePage from '../../pages/ActivatePage';
import HomePage from '../../pages/HomePage';
import { apiLoginAndInject } from '../../helpers/apiHelper';
import { config } from '../../helpers/config';

describe('SHOES', () => {
  before(async () => {
    await apiLoginAndInject();
    await HomePage.open('/');
  });

  it('TC-SHOES-001: Активация кроссовок по коду', async () => {
    await ActivatePage.openActivate();
    await ActivatePage.enterManualCode(config.shoeCode);
    await ActivatePage.tapActivate();
    const msg = await ActivatePage.getStatusMessage();
    expect(
      (await ActivatePage.isActivated()) || /уже|привязан/i.test(msg)
    ).toBe(true);
  });

  it('TC-SHOES-002: Повторное сканирование — QR уже используется', async () => {
    await ActivatePage.openActivate();
    await ActivatePage.enterManualCode(config.shoeCode);
    await ActivatePage.tapActivate();
    await browser.pause(1500);
    const msg = await ActivatePage.getStatusMessage();
    expect(
      (await ActivatePage.isAlreadyUsed()) || /уже|привязан|активирован/i.test(msg)
    ).toBe(true);
  });
});
