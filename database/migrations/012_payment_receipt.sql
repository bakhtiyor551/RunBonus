-- Чек оплаты (мобильный перевод)

ALTER TABLE shop_orders
  ADD COLUMN payment_receipt_url VARCHAR(512) NULL AFTER payment_details;
