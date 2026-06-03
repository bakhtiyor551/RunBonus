-- Курьеры и назначение доставки заказов

CREATE TABLE IF NOT EXISTS couriers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_couriers_status (status)
);

ALTER TABLE shop_orders
  ADD COLUMN courier_id BIGINT NULL AFTER address,
  ADD COLUMN delivery_assigned_at TIMESTAMP NULL AFTER courier_id;
