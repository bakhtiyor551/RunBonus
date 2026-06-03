/** Реквизиты для мобильного перевода (задайте в .env на сервере). */
export const MOBILE_PAYMENT_ACCOUNTS = [
  {
    id: 'alif',
    provider: 'Alif Mobi',
    number: process.env.SHOP_ALIF_WALLET || '+992 90 000 00 01',
    holder: process.env.SHOP_ALIF_HOLDER || 'RunBonus',
  },
  {
    id: 'dc',
    provider: 'DC Wallet',
    number: process.env.SHOP_DC_WALLET || '+992 90 000 00 02',
    holder: process.env.SHOP_DC_HOLDER || 'RunBonus',
  },
  {
    id: 'eskhata',
    provider: 'Эсхата Онлайн',
    number: process.env.SHOP_ESKHATA_WALLET || '+992 90 000 00 03',
    holder: process.env.SHOP_ESKHATA_HOLDER || 'RunBonus',
  },
];
