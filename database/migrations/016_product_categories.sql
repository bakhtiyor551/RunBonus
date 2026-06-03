-- Категории товаров магазина

CREATE TABLE IF NOT EXISTS product_categories (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  is_builtin TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_product_categories_status (status),
  KEY idx_product_categories_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO product_categories (id, name, sort_order, status, is_builtin)
VALUES
  ('shoes', 'Кроссовки', 10, 'active', 1),
  ('tshirt', 'Футболки', 20, 'active', 1),
  ('shorts', 'Шорты', 30, 'active', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);

ALTER TABLE products
  ADD COLUMN category_id VARCHAR(32) NULL AFTER slug,
  ADD KEY idx_products_category (category_id);

UPDATE products SET category_id = 'shoes' WHERE category_id IS NULL;
