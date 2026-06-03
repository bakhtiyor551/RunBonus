import { Router } from 'express';
import { pool } from '../db.js';
import { authUser, requireActiveUser } from '../middleware/auth.js';
import { validateShoeQr } from '../services/shoeValidateService.js';
import { listActiveProducts, getProductById, getUserShoeStatus } from '../services/shopService.js';
import { createOrder, listUserOrders } from '../services/orderService.js';
import { saveOrderReceiptFromDataUrl } from '../utils/orderReceipt.js';
import { listActivePaymentMethods } from '../services/paymentMethodService.js';
import { listActiveDeliveryMethods } from '../services/deliveryMethodService.js';
import { PAYMENT_METHODS } from '../constants/paymentMethods.js';
import { DELIVERY_METHODS } from '../constants/deliveryMethods.js';
import { getWalletSummary } from '../services/withdrawalService.js';
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

router.get('/products', async (_req, res) => {
  try {
    const products = await listActiveProducts();
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

router.get('/mobile-payment-accounts', (_req, res) => {
  res.json(MOBILE_PAYMENT_ACCOUNTS);
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
    } = req.body;
    if (!product_id || !customer_name?.trim() || !phone?.trim()) {
      return res.status(400).json({ error: 'Укажите товар, имя и телефон' });
    }
    const order = await createOrder(
      {
        product_id,
        size,
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

export default router;
