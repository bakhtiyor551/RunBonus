-- Способ оплаты в заказах магазина

ALTER TABLE shop_orders
  ADD COLUMN payment_method VARCHAR(32) NULL AFTER comment,
  ADD COLUMN payment_details VARCHAR(255) NULL AFTER payment_method;
