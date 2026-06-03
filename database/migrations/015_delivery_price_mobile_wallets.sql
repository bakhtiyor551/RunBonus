-- Цена доставки + кошельки для мобильного перевода (админка)

ALTER TABLE delivery_methods
  ADD COLUMN price DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER requires_address;

UPDATE delivery_methods SET price = 25.00 WHERE id = 'courier';
UPDATE delivery_methods SET price = 0 WHERE id = 'pickup';

ALTER TABLE shop_orders
  ADD COLUMN delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER delivery_method;

CREATE TABLE IF NOT EXISTS mobile_payment_accounts (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  provider VARCHAR(128) NOT NULL,
  number VARCHAR(64) NOT NULL,
  holder VARCHAR(128) NOT NULL DEFAULT 'RunBonus',
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_mobile_payment_accounts_status (status),
  KEY idx_mobile_payment_accounts_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO mobile_payment_accounts (id, provider, number, holder, sort_order, status)
VALUES
  ('alif', 'Alif Mobi', '+992 90 000 00 01', 'RunBonus', 10, 'active'),
  ('dc', 'DC Wallet', '+992 90 000 00 02', 'RunBonus', 20, 'active'),
  ('eskhata', 'Эсхата Онлайн', '+992 90 000 00 03', 'RunBonus', 30, 'active')
ON DUPLICATE KEY UPDATE provider = VALUES(provider);
