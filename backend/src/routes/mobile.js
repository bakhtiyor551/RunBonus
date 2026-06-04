import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { config } from '../config.js';
import { authUser, requireActiveUser } from '../middleware/auth.js';
import { validateShoeQr } from '../services/shoeValidateService.js';
import {
  listActiveProducts,
  getProductById,
  getUserShoeStatus,
} from '../services/shopService.js';
import { listCatalogShopCategories } from '../services/shopCategoryService.js';
import { createOrder, listUserOrders } from '../services/orderService.js';
import { saveOrderReceiptFromDataUrl } from '../utils/orderReceipt.js';
import { listActivePaymentMethods } from '../services/paymentMethodService.js';
import { listActiveDeliveryMethods } from '../services/deliveryMethodService.js';
import { PAYMENT_METHODS } from '../constants/paymentMethods.js';
import { DELIVERY_METHODS } from '../constants/deliveryMethods.js';
import { getWalletSummary } from '../services/withdrawalService.js';
import { listActiveMobilePaymentAccounts } from '../services/mobilePaymentAccountService.js';
import { MOBILE_PAYMENT_ACCOUNTS } from '../constants/mobilePaymentAccounts.js';

const router = Router();

router.post('/shoes/validate-qr', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { unique_id } = req.body;
    const result = await validateShoeQr(conn, unique_id);
    if (!result.valid) {
      return res.status(400).json({ error: result.error, code: result.code, valid: false });
    }
    res.json({ valid: true, message: 'Кроссовки можно активировать', shoe: result.shoe });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка проверки QR' });
  } finally {
    conn.release();
  }
});

router.get('/shoes/status', authUser, async (req, res) => {
  try {
    const status = await getUserShoeStatus(req.userId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.get('/shop-categories', async (_req, res) => {
  try {
    const categories = await listCatalogShopCategories();
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.json([]);
  }
});

/** Каталог для магазина: категории и товары одним запросом. */
router.get('/shop-catalog', async (req, res) => {
  try {
    const filterId =
      req.query.category_id != null && String(req.query.category_id).trim() !== ''
        ? String(req.query.category_id).trim()
        : null;
    const categories = await listCatalogShopCategories();
    let products = [];
    try {
      products = await listActiveProducts({ categoryId: filterId });
    } catch (err) {
      console.error('shop-catalog products:', err);
      products = await listActiveProducts({ categoryId: null });
    }
    res.json({ categories, products });
  } catch (err) {
    console.error(err);
    const categories = await listCatalogShopCategories().catch(() => []);
    const products = await listActiveProducts({ categoryId: null }).catch(() => []);
    res.json({ categories, products });
  }
});

router.get('/products', async (req, res) => {
  try {
    const filterId =
      req.query.category_id != null && String(req.query.category_id).trim() !== ''
        ? String(req.query.category_id).trim()
        : null;
    const products = await listActiveProducts({ categoryId: filterId });
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки каталога' });
  }
});

router.get('/products/:id', async (req, res) => {
  try {
    const product = await getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.get('/payment-methods', authUser, async (req, res) => {
  try {
    const summary = await getWalletSummary(pool, req.userId);
    const available_bonus = summary.available_balance;
    const methods = await listActivePaymentMethods({
      hideBonusIfNoBalance: true,
      availableBonus: available_bonus,
    });
    res.json({ methods, available_bonus });
  } catch (err) {
    console.error(err);
    res.json({ methods: PAYMENT_METHODS, available_bonus: 0 });
  }
});

router.get('/delivery-methods', authUser, async (_req, res) => {
  try {
    const methods = await listActiveDeliveryMethods();
    res.json(methods);
  } catch (err) {
    console.error(err);
    res.json(
      DELIVERY_METHODS.map((m) => ({
        id: m.id,
        label: m.label,
        requiresAddress: m.requiresAddress,
      }))
    );
  }
});

router.get('/mobile-payment-accounts', async (_req, res) => {
  try {
    const accounts = await listActiveMobilePaymentAccounts();
    res.json(accounts.length ? accounts : MOBILE_PAYMENT_ACCOUNTS);
  } catch (err) {
    console.error(err);
    res.json(MOBILE_PAYMENT_ACCOUNTS);
  }
});

/** Один чек на все позиции корзины (не дублировать base64 в каждом заказе). */
router.post('/order-receipt', authUser, requireActiveUser, async (req, res) => {
  try {
    const { payment_receipt_base64 } = req.body;
    if (!payment_receipt_base64) {
      return res.status(400).json({ error: 'Загрузите чек' });
    }
    const key = `pending-${req.userId}-${Date.now()}`;
    const receipt_url = saveOrderReceiptFromDataUrl(key, payment_receipt_base64);
    res.json({ receipt_url });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Не удалось сохранить чек' });
  }
});

router.post('/orders', authUser, requireActiveUser, async (req, res) => {
  try {
    const {
      product_id,
      size,
      color,
      color_id,
      quantity,
      customer_name,
      phone,
      city,
      address,
      delivery_method,
      comment,
      payment_method,
      payment_details,
      payment_receipt_base64,
      payment_receipt_url,
      apply_delivery_fee,
    } = req.body;
    if (!product_id || !customer_name?.trim() || !phone?.trim()) {
      return res.status(400).json({ error: 'Укажите товар, имя и телефон' });
    }
    const order = await createOrder(
      {
        product_id,
        size,
        color,
        color_id,
        quantity,
        customer_name,
        phone,
        city,
        address,
        delivery_method,
        comment,
        payment_method,
        payment_details,
        payment_receipt_base64,
        payment_receipt_url,
        apply_delivery_fee,
      },
      req.userId
    );
    res.status(201).json({
      message: 'Ваш заказ принят. Мы свяжемся с вами для подтверждения.',
      order,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Не удалось оформить заказ' });
  }
});

router.get('/my-orders', authUser, async (req, res) => {
  try {
    const orders = await listUserOrders(req.userId);
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки заказов' });
  }
});

router.get('/ads/banners', async (req, res) => {
  try {
    const { listActiveBanners } = await import('../services/adsService.js');
    const placement = req.query.placement || 'banner_home';
    const user = {
      city: req.query.city?.trim() || null,
      level_code: req.query.level?.trim() || null,
    };
    const banners = await listActiveBanners({ placement, user });
    res.json(banners);
  } catch (err) {
    console.error(err);
    res.json([]);
  }
});

function optionalUserId(req, res, next) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), config.jwtSecret);
      req.userId = payload.userId;
    } catch {
      /* токен недействителен — событие без user_id */
    }
  }
  next();
}

router.post('/ads/event', optionalUserId, async (req, res) => {
  try {
    const { recordAdEvent } = await import('../services/adsService.js');
    const { campaign_id, event_type } = req.body || {};
    if (!campaign_id || !['impression', 'click', 'open'].includes(event_type)) {
      return res.status(400).json({ error: 'Некорректные данные' });
    }
    await recordAdEvent({
      campaignId: campaign_id,
      userId: req.userId || null,
      eventType: event_type,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

export default router;
