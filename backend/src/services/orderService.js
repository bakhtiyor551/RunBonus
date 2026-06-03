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
import { getWalletSummary } from './withdrawalService.js';

const STATUS_LABELS = {
  new: 'Новый заказ',
  confirmed: 'Подтверждён',
  paid: 'Оплачен',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
  qr_issued: 'QR выдан',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export async function createOrder(data, userId = null) {
  const {
    product_id,
    size,
    color: orderColor,
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
    if (!userId) {
      const err = new Error('Для оплаты бонусами войдите в аккаунт');
      err.status = 401;
      throw err;
    }
    return createOrderPaidWithBonus(data, userId);
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

  const [products] = await pool.query(
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
    const [sizeRows] = await pool.query(
      `SELECT * FROM product_sizes WHERE product_id = ? AND size = ? AND status = 'active'`,
      [product_id, size]
    );
    if (!sizeRows.length || sizeRows[0].stock_qty < qty) {
      const err = new Error('Выбранный размер недоступен');
      err.status = 400;
      throw err;
    }
  }

  const price = Number(product.price);
  const subtotal = Math.round(price * qty * 100) / 100;
  const deliveryFee = await getDeliveryFee(delivery_method, Boolean(apply_delivery_fee));
  const total = Math.round((subtotal + deliveryFee) * 100) / 100;

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
    [result] = await pool.query(
      `INSERT INTO shop_orders
         (user_id, product_id, size, order_color, quantity, price, total_amount, customer_name, phone, city, address, delivery_method, delivery_fee, comment, payment_method, payment_details, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
      [...baseValues, payment_method, payment_details?.trim() || null]
    );
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
    [result] = await pool.query(
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

  const orderId = result.insertId;

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
      const [sizeRows] = await conn.query(
        `SELECT * FROM product_sizes WHERE product_id = ? AND size = ? AND status = 'active'`,
        [product_id, size]
      );
      if (!sizeRows.length || sizeRows[0].stock_qty < qty) {
        const err = new Error('Выбранный размер недоступен');
        err.status = 400;
        throw err;
      }
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

    await spendBonus(conn, {
      userId,
      amount: total,
      comment: `Оплата заказа в магазине #${orderId}`,
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
            c.name AS courier_name, c.phone AS courier_phone
     ${ORDER_JOIN}
     WHERE o.user_id = ?
     ORDER BY o.created_at DESC`,
    [userId]
  );
  return Promise.all(rows.map(mapOrderRow));
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

export async function updateOrderStatus(orderId, status) {
  const allowed = ['new', 'confirmed', 'paid', 'delivered', 'cancelled', 'qr_issued'];
  if (!allowed.includes(status)) {
    const err = new Error('Недопустимый статус');
    err.status = 400;
    throw err;
  }
  await pool.query(`UPDATE shop_orders SET status = ? WHERE id = ?`, [status, orderId]);
  return getOrderById(orderId);
}

export async function assignQrToOrder(orderId, uniqueIdRaw, adminDeviceId = null) {
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

    const shoe = await activateShoeForUserAdmin(conn, order.user_id, uniqueIdRaw);

    await conn.query(
      `UPDATE shop_orders SET assigned_shoe_id = ?, status = 'qr_issued' WHERE id = ?`,
      [shoe.id, orderId]
    );

    await conn.commit();
    return { order: await getOrderById(orderId), shoe };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export { adminListProducts, adminSaveProduct } from './shopService.js';
