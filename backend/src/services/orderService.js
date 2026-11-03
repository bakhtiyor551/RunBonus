import { pool } from '../db.js';
import { notifyOrderToTelegram } from './telegramService.js';
import { activateShoeForUserAdmin } from './shoeActivationService.js';
import {
  isValidPaymentMethod,
  paymentMethodLabel,
  paymentMethodNeedsDetails,
  paymentMethodUsesTransferModal,
} from './paymentMethodService.js';
import {
  isValidDeliveryMethod,
  deliveryMethodLabel,
  deliveryMethodRequiresAddress,
  getDeliveryFee,
} from './deliveryMethodService.js';
import { saveOrderReceiptFromDataUrl } from '../utils/orderReceipt.js';
import { spendBonus } from './bonusService.js';
import { getWalletSummary } from './accountService.js';
import { assertProductSizeInStock } from './shopService.js';
import { decrementStockForOrder, restoreStockForCancelledOrder } from './warehouseService.js';
import { sendOrderStatusPush } from './pushNotificationService.js';
import { splitFullName, buildDisplayName } from '../utils/userProfile.js';

const STATUS_LABELS = {
  new: 'Новый заказ',
  confirmed: 'Подтверждён',
  paid: 'Оплачен',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
  qr_issued: 'Кроссовки привязаны',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function buildOrderStatusPushBody(order, status) {
  const label = statusLabel(status);
  const product = order.product_name ? ` «${order.product_name}»` : '';
  if (status === 'delivered') {
    return `Заказ #${order.id}${product} доставлен. Кроссовки активированы — можно тренироваться!`;
  }
  return `Заказ #${order.id}${product}: ${label}`;
}

function notifyOrderStatusPush(order, prevStatus, newStatus) {
  if (!order?.user_id || prevStatus === newStatus) return;
  sendOrderStatusPush({
    userId: order.user_id,
    orderId: order.id,
    title: 'Статус заказа',
    body: buildOrderStatusPushBody(order, newStatus),
    status: newStatus,
  }).catch((err) => console.warn('[Push] order status:', err.message));
}

/** Имя и город из оформления заказа → профиль клиента. */
async function applyOrderContactToProfile(conn, userId, { customer_name, city }) {
  if (!userId) return;
  const nameRaw = String(customer_name || '').trim();
  const cityRaw = String(city || '').trim();
  if (!nameRaw && !cityRaw) return;

  const { first_name, last_name } = splitFullName(nameRaw);
  const name = buildDisplayName(first_name, last_name) || nameRaw;

  if (nameRaw && cityRaw) {
    await conn.query(
      `UPDATE users SET name = ?, first_name = ?, last_name = ?, city = ? WHERE id = ?`,
      [name, first_name || null, last_name || null, cityRaw, userId]
    );
  } else if (nameRaw) {
    await conn.query(
      `UPDATE users SET name = ?, first_name = ?, last_name = ? WHERE id = ?`,
      [name, first_name || null, last_name || null, userId]
    );
  } else {
    await conn.query(`UPDATE users SET city = ? WHERE id = ?`, [cityRaw, userId]);
  }
}

export async function createOrder(data, userId = null) {
  const {
    product_id,
    size,
    color: orderColor,
    color_id: orderColorId,
    quantity = 1,
    customer_name,
    phone,
    city,
    address,
    comment,
    delivery_method,
    payment_method,
    payment_details,
    payment_receipt_base64,
    payment_receipt_url: paymentReceiptUrlInput,
    apply_delivery_fee,
  } = data;

  if (!delivery_method || !(await isValidDeliveryMethod(delivery_method))) {
    const err = new Error('Выберите способ доставки');
    err.status = 400;
    throw err;
  }
  if ((await deliveryMethodRequiresAddress(delivery_method)) && !address?.trim()) {
    const err = new Error('Укажите адрес доставки');
    err.status = 400;
    throw err;
  }

  if (!payment_method || !(await isValidPaymentMethod(payment_method))) {
    const err = new Error('Выберите способ оплаты');
    err.status = 400;
    throw err;
  }
  if (payment_method === 'bonus') {
    const err = new Error('Оплата бонусами отключена. Выберите другой способ оплаты.');
    err.status = 400;
    err.code = 'BONUS_PAYMENT_DISABLED';
    throw err;
  }

  const usesTransfer = await paymentMethodUsesTransferModal(payment_method);
  if (usesTransfer || payment_method === 'mobile') {
    if (!payment_details?.trim()) {
      const err = new Error('Укажите номер кошелька, с которого вы перевели');
      err.status = 400;
      throw err;
    }
    if (!payment_receipt_base64 && !paymentReceiptUrlInput) {
      const err = new Error('Загрузите чек перевода');
      err.status = 400;
      throw err;
    }
  } else if ((await paymentMethodNeedsDetails(payment_method)) && !payment_details?.trim()) {
    const err = new Error('Укажите данные для выбранного способа оплаты');
    err.status = 400;
    throw err;
  }

  const qty = Math.max(1, Math.min(10, Number(quantity) || 1));

  const conn = await pool.getConnection();
  let orderId;
  let product;
  try {
    await conn.beginTransaction();

    const [products] = await conn.query(
      `SELECT * FROM products WHERE id = ? AND status = 'active'`,
      [product_id]
    );
    if (!products.length) {
      const err = new Error('Товар не найден');
      err.status = 404;
      throw err;
    }
    product = products[0];

  if (size) {
    await assertProductSizeInStock(conn, {
      productId: product_id,
      size,
      color: orderColor,
      colorId: orderColorId,
      qty,
    });
  }

    const baseValues = [
      userId,
      product_id,
      size || null,
      orderColor?.trim() || null,
      qty,
      Number(product.price),
      0,
      customer_name.trim(),
      phone.trim(),
      city?.trim() || null,
      address?.trim() || null,
      delivery_method,
      0,
      comment?.trim() || null,
    ];

    const price = Number(product.price);
    const subtotal = Math.round(price * qty * 100) / 100;
    const deliveryFee = await getDeliveryFee(delivery_method, Boolean(apply_delivery_fee));
    const total = Math.round((subtotal + deliveryFee) * 100) / 100;
    baseValues[6] = total;
    baseValues[11] = deliveryFee;

    let result;
    try {
      [result] = await conn.query(
        `INSERT INTO shop_orders
           (user_id, product_id, size, order_color, quantity, price, total_amount, customer_name, phone, city, address, delivery_method, delivery_fee, comment, payment_method, payment_details, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
        [...baseValues, payment_method, payment_details?.trim() || null]
      );
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
      [result] = await conn.query(
        `INSERT INTO shop_orders
           (user_id, product_id, size, quantity, price, total_amount, customer_name, phone, city, address, comment, payment_method, payment_details, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
        [
          userId,
          product_id,
          size || null,
          qty,
          price,
          total,
          customer_name.trim(),
          phone.trim(),
          city?.trim() || null,
          address?.trim() || null,
          comment?.trim() || null,
          payment_method,
          payment_details?.trim() || null,
        ]
      );
    }

    orderId = result.insertId;

    if (size) {
      await decrementStockForOrder(conn, {
        productId: product_id,
        size,
        color: orderColor,
        quantity: qty,
        orderId,
      });
    }

    await applyOrderContactToProfile(conn, userId, {
      customer_name,
      city,
    });

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  let receiptUrl = paymentReceiptUrlInput || null;
  const needsReceipt = usesTransfer || payment_method === 'mobile';
  if (needsReceipt && !receiptUrl && payment_receipt_base64) {
    receiptUrl = saveOrderReceiptFromDataUrl(orderId, payment_receipt_base64);
  }
  if (receiptUrl) {
    try {
      await pool.query(`UPDATE shop_orders SET payment_receipt_url = ? WHERE id = ?`, [
        receiptUrl,
        orderId,
      ]);
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
    }
  }

  const order = await getOrderById(orderId);

  await notifyOrderToTelegram({ order, product });

  return order;
}

async function createOrderPaidWithBonus(data, userId) {
  const {
    product_id,
    size,
    color: orderColor,
    color_id: orderColorId,
    quantity = 1,
    customer_name,
    phone,
    city,
    address,
    delivery_method,
    comment,
    apply_delivery_fee,
  } = data;

  const qty = Math.max(1, Math.min(10, Number(quantity) || 1));

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [products] = await conn.query(
      `SELECT * FROM products WHERE id = ? AND status = 'active'`,
      [product_id]
    );
    if (!products.length) {
      const err = new Error('Товар не найден');
      err.status = 404;
      throw err;
    }
    const product = products[0];

    if (size) {
      await assertProductSizeInStock(conn, {
        productId: product_id,
        size,
        color: orderColor,
        colorId: orderColorId,
        qty,
      });
    }

    const price = Number(product.price);
    const subtotal = Math.round(price * qty * 100) / 100;
    const deliveryFee = await getDeliveryFee(delivery_method, Boolean(apply_delivery_fee));
    const total = Math.round((subtotal + deliveryFee) * 100) / 100;

    const summary = await getWalletSummary(conn, userId, true);
    if (summary.available_balance < total) {
      const err = new Error(
        `Недостаточно бонусов. Доступно: ${summary.available_balance} сомони, нужно: ${total} сомони`
      );
      err.status = 400;
      throw err;
    }

    const paymentDetails = `Списано ${total} бонусов`;
    const baseValues = [
      userId,
      product_id,
      size || null,
      orderColor?.trim() || null,
      qty,
      price,
      total,
      customer_name.trim(),
      phone.trim(),
      city?.trim() || null,
      address?.trim() || null,
      delivery_method,
      deliveryFee,
      comment?.trim() || null,
    ];

    let result;
    try {
      [result] = await conn.query(
        `INSERT INTO shop_orders
           (user_id, product_id, size, order_color, quantity, price, total_amount, customer_name, phone, city, address, delivery_method, delivery_fee, comment, payment_method, payment_details, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bonus', ?, 'paid')`,
        [...baseValues, paymentDetails]
      );
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
      [result] = await conn.query(
        `INSERT INTO shop_orders
           (user_id, product_id, size, quantity, price, total_amount, customer_name, phone, city, address, comment, payment_method, payment_details, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bonus', ?, 'paid')`,
        [
          userId,
          product_id,
          size || null,
          qty,
          price,
          total,
          customer_name.trim(),
          phone.trim(),
          city?.trim() || null,
          address?.trim() || null,
          comment?.trim() || null,
          paymentDetails,
        ]
      );
    }

    const orderId = result.insertId;

    if (size) {
      await decrementStockForOrder(conn, {
        productId: product_id,
        size,
        color: orderColor,
        quantity: qty,
        orderId,
      });
    }

    await spendBonus(conn, {
      userId,
      amount: total,
      comment: `Оплата заказа в магазине #${orderId}`,
    });

    await applyOrderContactToProfile(conn, userId, {
      customer_name,
      city,
    });

    await conn.commit();

    const order = await getOrderById(orderId);
    await notifyOrderToTelegram({ order, product });
    return order;
  } catch (err) {
    await conn.rollback();
    if (err.code === 'INSUFFICIENT_BALANCE') {
      const e = new Error('Недостаточно бонусов на счёте');
      e.status = 400;
      throw e;
    }
    throw err;
  } finally {
    conn.release();
  }
}

const ORDER_JOIN = `
  FROM shop_orders o
  JOIN products p ON p.id = o.product_id
  LEFT JOIN couriers c ON c.id = o.courier_id
`;

export async function getOrderById(id) {
  const [rows] = await pool.query(
    `SELECT o.*, p.name AS product_name, p.color AS product_color,
            c.name AS courier_name, c.phone AS courier_phone
     ${ORDER_JOIN}
     WHERE o.id = ?`,
    [id]
  );
  if (!rows.length) return null;
  return mapOrderRow(rows[0]);
}

async function mapOrderRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    product_id: row.product_id,
    product_name: row.product_name,
    product_color: row.order_color || row.product_color,
    order_color: row.order_color || null,
    assigned_shoe_id: row.assigned_shoe_id,
    size: row.size,
    quantity: row.quantity,
    price: Number(row.price),
    total_amount: Number(row.total_amount),
    customer_name: row.customer_name,
    phone: row.phone,
    city: row.city,
    address: row.address,
    delivery_method: row.delivery_method || null,
    delivery_fee: Number(row.delivery_fee) || 0,
    delivery_method_label: row.delivery_method
      ? await deliveryMethodLabel(row.delivery_method)
      : null,
    comment: row.comment,
    payment_method: row.payment_method,
    payment_method_label: await paymentMethodLabel(row.payment_method),
    payment_details: row.payment_details,
    payment_receipt_url: row.payment_receipt_url || null,
    status: row.status,
    status_label: statusLabel(row.status),
    courier_id: row.courier_id ?? null,
    courier_name: row.courier_name || null,
    courier_phone: row.courier_phone || null,
    delivery_assigned_at: row.delivery_assigned_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listUserOrders(userId) {
  const [rows] = await pool.query(
    `SELECT o.*, p.name AS product_name, p.color AS product_color,
            c.name AS courier_name, c.phone AS courier_phone,
            s.unique_id AS assigned_shoe_code,
            (SELECT pi.image_url FROM product_images pi
             WHERE pi.product_id = o.product_id
             ORDER BY pi.sort_order ASC, pi.id ASC LIMIT 1) AS product_image
     ${ORDER_JOIN}
     LEFT JOIN shoes s ON s.id = o.assigned_shoe_id
     WHERE o.user_id = ?
     ORDER BY o.created_at DESC`,
    [userId]
  );
  return Promise.all(
    rows.map(async (r) => ({
      ...(await mapOrderRow(r)),
      assigned_shoe_code: r.assigned_shoe_code || null,
      product_image: r.product_image || null,
    }))
  );
}

export async function listAdminOrders() {
  const [rows] = await pool.query(
    `SELECT o.*, p.name AS product_name, p.color AS product_color,
            s.unique_id AS assigned_shoe_code,
            c.name AS courier_name, c.phone AS courier_phone
     ${ORDER_JOIN}
     LEFT JOIN shoes s ON s.id = o.assigned_shoe_id
     ORDER BY o.created_at DESC
     LIMIT 500`
  );
  return Promise.all(
    rows.map(async (r) => ({
      ...(await mapOrderRow(r)),
      assigned_shoe_code: r.assigned_shoe_code,
    }))
  );
}

async function activateAssignedShoeForOrder(conn, order) {
  if (!order?.user_id) return null;

  let shoeId = order.assigned_shoe_id ? Number(order.assigned_shoe_id) : null;
  let shoe = null;

  if (shoeId) {
    const [shoes] = await conn.query(`SELECT * FROM shoes WHERE id = ? FOR UPDATE`, [shoeId]);
    shoe = shoes[0] || null;
  }

  // Нет привязанного кода — создаём кроссовки по заказу и активируем
  if (!shoe) {
    const uniqueId = `SHOE-ORD-${order.id}`;
    const modelName = String(order.product_name || 'RunBonus').slice(0, 120);
    const [existing] = await conn.query(`SELECT * FROM shoes WHERE unique_id = ? FOR UPDATE`, [
      uniqueId,
    ]);
    if (existing.length) {
      shoe = existing[0];
    } else {
      const [ins] = await conn.query(
        `INSERT INTO shoes (batch_id, model_name, qr_code, unique_id, status)
         VALUES (NULL, ?, ?, ?, 'new')`,
        [modelName, uniqueId, uniqueId]
      );
      const [created] = await conn.query(`SELECT * FROM shoes WHERE id = ? FOR UPDATE`, [
        ins.insertId,
      ]);
      shoe = created[0];
    }
    shoeId = shoe.id;
    await conn.query(`UPDATE shop_orders SET assigned_shoe_id = ? WHERE id = ?`, [
      shoeId,
      order.id,
    ]);
  }

  if (shoe.status === 'activated') {
    if (Number(shoe.activated_by_user_id) && Number(shoe.activated_by_user_id) !== Number(order.user_id)) {
      const err = new Error('Код кроссовок уже активирован другим пользователем');
      err.status = 409;
      throw err;
    }
    await conn.query(
      `UPDATE shoes SET activated_by_user_id = COALESCE(activated_by_user_id, ?), activated_at = COALESCE(activated_at, NOW())
       WHERE id = ?`,
      [order.user_id, shoe.id]
    );
    await conn.query(
      `INSERT INTO user_active_shoes (user_id, shoe_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE shoe_id = VALUES(shoe_id)`,
      [order.user_id, shoe.id]
    );
    const { ensureShoeProgress } = await import('./shoeProgressService.js');
    await ensureShoeProgress(conn, order.user_id, shoe.id);
    return { id: shoe.id, unique_id: shoe.unique_id, model_name: shoe.model_name, alreadyActive: true };
  }

  return activateShoeForUserAdmin(conn, order.user_id, shoe.unique_id);
}

export async function updateOrderStatus(orderId, status) {
  const allowed = ['new', 'confirmed', 'paid', 'delivered', 'cancelled', 'qr_issued'];
  if (!allowed.includes(status)) {
    const err = new Error('Недопустимый статус');
    err.status = 400;
    throw err;
  }

  const conn = await pool.getConnection();
  let prevStatus = null;
  try {
    await conn.beginTransaction();

    const [orders] = await conn.query(`SELECT * FROM shop_orders WHERE id = ? FOR UPDATE`, [
      orderId,
    ]);
    if (!orders.length) {
      const err = new Error('Заказ не найден');
      err.status = 404;
      throw err;
    }
    const order = orders[0];
    prevStatus = order.status;

    if (status === 'delivered' && order.user_id) {
      if (!order.product_name && order.product_id) {
        const [[p]] = await conn.query(`SELECT name FROM products WHERE id = ?`, [order.product_id]);
        order.product_name = p?.name || null;
      }
      await activateAssignedShoeForOrder(conn, order);
    } else if (status === 'delivered' && !order.user_id) {
      const err = new Error('У заказа нет пользователя приложения — активация невозможна');
      err.status = 400;
      throw err;
    }

    await conn.query(`UPDATE shop_orders SET status = ? WHERE id = ?`, [status, orderId]);

    if (status === 'cancelled' && prevStatus !== 'cancelled') {
      await restoreStockForCancelledOrder(conn, orderId);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const order = await getOrderById(orderId);
  notifyOrderStatusPush(order, prevStatus, status);
  return order;
}

/** Привязать код кроссовок к заказу (без активации). Активация — при статусе «Доставлен». */
export async function assignQrToOrder(orderId, uniqueIdRaw, adminDeviceId = null) {
  void adminDeviceId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.query(`SELECT * FROM shop_orders WHERE id = ? FOR UPDATE`, [orderId]);
    if (!orders.length) {
      const err = new Error('Заказ не найден');
      err.status = 404;
      throw err;
    }
    const order = orders[0];
    if (!order.user_id) {
      const err = new Error('У заказа нет привязанного пользователя приложения');
      err.status = 400;
      throw err;
    }

    const unique_id = String(uniqueIdRaw || '')
      .trim()
      .toUpperCase();
    if (!unique_id) {
      const err = new Error('Введите код кроссовок');
      err.status = 400;
      throw err;
    }

    const [shoes] = await conn.query(`SELECT * FROM shoes WHERE unique_id = ? FOR UPDATE`, [unique_id]);
    if (!shoes.length) {
      const err = new Error('Код не найден');
      err.status = 404;
      throw err;
    }
    const shoe = shoes[0];
    if (shoe.status === 'blocked' || shoe.status === 'expired') {
      const err = new Error('Этот код недоступен');
      err.status = 403;
      throw err;
    }
    if (shoe.status === 'activated' && Number(shoe.activated_by_user_id) !== Number(order.user_id)) {
      const err = new Error('Код уже активирован другим пользователем');
      err.status = 409;
      throw err;
    }

    // Только привязка. Активация произойдёт при статусе delivered.
    await conn.query(
      `UPDATE shop_orders SET assigned_shoe_id = ?, status = IF(status = 'delivered', status, 'qr_issued') WHERE id = ?`,
      [shoe.id, orderId]
    );

    await conn.commit();
    const updated = await getOrderById(orderId);
    if (order.status !== updated.status) {
      notifyOrderStatusPush(updated, order.status, updated.status);
    }
    return { order: updated, shoe: { id: shoe.id, unique_id: shoe.unique_id, model_name: shoe.model_name } };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export { adminListProducts, adminSaveProduct } from './shopService.js';
