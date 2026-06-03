-- Способы доставки (корзина + админка)

CREATE TABLE IF NOT EXISTS delivery_methods (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  label VARCHAR(128) NOT NULL,
  requires_address TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  is_builtin TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_delivery_methods_status (status),
  KEY idx_delivery_methods_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO delivery_methods (id, label, requires_address, sort_order, status, is_builtin)
VALUES
  ('courier', 'Доставка курьером', 1, 10, 'active', 1),
  ('pickup', 'Самовывоз', 0, 20, 'active', 1)
ON DUPLICATE KEY UPDATE label = VALUES(label);

ALTER TABLE shop_orders
  ADD COLUMN delivery_method VARCHAR(32) NULL AFTER address;

INSERT INTO payment_methods (id, label, needs_details, details_label, uses_transfer_modal, sort_order, status, is_builtin)
VALUES ('delivery', 'Доставка', 0, NULL, 0, 15, 'active', 1)
ON DUPLICATE KEY UPDATE label = VALUES(label);
