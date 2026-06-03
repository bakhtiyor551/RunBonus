-- Категории магазина и варианты цвета товара

CREATE TABLE IF NOT EXISTS shop_categories (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  slug VARCHAR(64) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_shop_categories_status (status),
  KEY idx_shop_categories_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO shop_categories (id, name, slug, sort_order, status)
VALUES
  (1, 'Бег', 'running', 10, 'active'),
  (2, 'Город', 'urban', 20, 'active'),
  (3, 'Трейл', 'trail', 30, 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name);

ALTER TABLE products
  ADD COLUMN category_id BIGINT NULL AFTER status,
  ADD KEY idx_products_category (category_id);

UPDATE products p
SET category_id = CASE p.slug
  WHEN 'runner-pro' THEN 1
  WHEN 'urban-sprint' THEN 2
  WHEN 'trail-max' THEN 3
  ELSE category_id
END
WHERE p.slug IN ('runner-pro', 'urban-sprint', 'trail-max');

CREATE TABLE IF NOT EXISTS product_colors (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  label VARCHAR(120) NOT NULL,
  hex_code VARCHAR(7) NULL,
  image_url TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  KEY idx_product_colors_product (product_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO product_colors (product_id, label, sort_order, status)
SELECT p.id, p.color, 10, 'active'
FROM products p
WHERE p.color IS NOT NULL AND TRIM(p.color) != ''
  AND NOT EXISTS (SELECT 1 FROM product_colors pc WHERE pc.product_id = p.id LIMIT 1);

ALTER TABLE shop_orders
  ADD COLUMN order_color VARCHAR(120) NULL AFTER size;
