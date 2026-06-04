-- Склад: история движений остатков (product_sizes.stock_qty — текущий остаток)

CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  size VARCHAR(20) NOT NULL,
  quantity INT NOT NULL,
  movement_type ENUM('in', 'out') NOT NULL,
  reason ENUM('receipt', 'order', 'cancel', 'adjust') NOT NULL DEFAULT 'receipt',
  order_id BIGINT NULL,
  comment VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_stock_movements_product (product_id),
  KEY idx_stock_movements_order (order_id),
  KEY idx_stock_movements_created (created_at),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES shop_orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
