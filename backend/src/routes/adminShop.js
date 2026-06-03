import { Router } from 'express';
import { authAdmin } from '../middleware/auth.js';
import {
  adminListProducts,
  adminSaveProduct,
  listAllShopCategoriesAdmin,
} from '../services/shopService.js';
import {
  listAdminOrders,
  getOrderById,
  updateOrderStatus,
  assignQrToOrder,
} from '../services/orderService.js';
import { pool } from '../db.js';
import {
  listCouriers,
  createCourier,
  updateCourier,
  assignCourierToOrder,
} from '../services/courierService.js';

const router = Router();

router.get('/categories', authAdmin, async (_req, res) => {
  try {
    const categories = await listAllShopCategoriesAdmin();
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.get('/products', authAdmin, async (_req, res) => {
  try {
    const products = await adminListProducts();
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.post('/products', authAdmin, async (req, res) => {
  try {
    const product = await adminSaveProduct(req.body);
    res.status(201).json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

router.put('/products/:id', authAdmin, async (req, res) => {
  try {
    const product = await adminSaveProduct(req.body, Number(req.params.id));
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

router.delete('/products/:id', authAdmin, async (req, res) => {
  try {
    await pool.query(`UPDATE products SET status = 'inactive' WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.get('/orders', authAdmin, async (_req, res) => {
  try {
    const orders = await listAdminOrders();
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.get('/orders/:id', authAdmin, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Не найден' });
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.put('/orders/:id/status', authAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await updateOrderStatus(Number(req.params.id), status);
    res.json(order);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.get('/couriers', authAdmin, async (_req, res) => {
  try {
    const couriers = await listCouriers();
    res.json(couriers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки курьеров' });
  }
});

router.post('/couriers', authAdmin, async (req, res) => {
  try {
    const courier = await createCourier(req.body);
    res.status(201).json(courier);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.put('/couriers/:id', authAdmin, async (req, res) => {
  try {
    const courier = await updateCourier(Number(req.params.id), req.body);
    res.json(courier);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

router.put('/orders/:id/delivery', authAdmin, async (req, res) => {
  try {
    const { courier_id } = req.body;
    if (!courier_id) {
      return res.status(400).json({ error: 'Выберите курьера' });
    }
    const { orderId } = await assignCourierToOrder(Number(req.params.id), Number(courier_id));
    const order = await getOrderById(orderId);
    res.json({ message: 'Курьер назначен', order });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Ошибка назначения доставки' });
  }
});

router.post('/orders/:id/assign-qr', authAdmin, async (req, res) => {
  try {
    const { unique_id } = req.body;
    if (!unique_id?.trim()) {
      return res.status(400).json({ error: 'Укажите QR/ID кроссовок' });
    }
    const result = await assignQrToOrder(Number(req.params.id), unique_id);
    res.json({
      message: 'QR привязан, кроссовки активированы для клиента',
      ...result,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ error: 'Ошибка привязки QR' });
  }
});

export default router;
