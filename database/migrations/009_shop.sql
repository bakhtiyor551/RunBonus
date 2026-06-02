-- Магазин кроссовок и заказы

CREATE TABLE IF NOT EXISTS products (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NULL,
  description TEXT NULL,
  color VARCHAR(120) NULL,
  price DECIMAL(10, 2) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_products_status (status)
);

CREATE TABLE IF NOT EXISTS product_images (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  image_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_product_images_product (product_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_sizes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  size VARCHAR(20) NOT NULL,
  stock_qty INT NOT NULL DEFAULT 0,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  UNIQUE KEY uk_product_size (product_id, size),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shop_orders (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  product_id BIGINT NOT NULL,
  assigned_shoe_id INT NULL,
  size VARCHAR(20) NULL,
  quantity INT NOT NULL DEFAULT 1,
  price DECIMAL(10, 2) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  city VARCHAR(100) NULL,
  address TEXT NULL,
  comment TEXT NULL,
  status ENUM('new', 'confirmed', 'paid', 'delivered', 'cancelled', 'qr_issued') NOT NULL DEFAULT 'new',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_shop_orders_user (user_id),
  KEY idx_shop_orders_status (status),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_shoe_id) REFERENCES shoes(id) ON DELETE SET NULL
);

INSERT INTO products (name, slug, description, color, price, status) VALUES
('Runner Pro', 'runner-pro', 'Лёгкие кроссовки RunBonus для бега и ходьбы. Бонусы за каждый километр.', 'Black / Green', 350.00, 'active'),
('Urban Sprint', 'urban-sprint', 'Городская модель с усиленной подошвой. Участвует в программе RunBonus.', 'White / Neon', 420.00, 'active'),
('Trail Max', 'trail-max', 'Для пересечённой местности. Полная поддержка GPS-трекинга в приложении.', 'Grey / Orange', 480.00, 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO product_images (product_id, image_url, sort_order)
SELECT p.id, '', 0 FROM products p WHERE p.slug = 'runner-pro' AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id LIMIT 1);

INSERT INTO product_sizes (product_id, size, stock_qty, status)
SELECT p.id, s.size, 5, 'active' FROM products p
CROSS JOIN (
  SELECT '39' AS size UNION SELECT '40' UNION SELECT '41' UNION SELECT '42' UNION SELECT '43'
) s
WHERE p.slug = 'runner-pro'
ON DUPLICATE KEY UPDATE stock_qty = VALUES(stock_qty);

INSERT INTO product_sizes (product_id, size, stock_qty, status)
SELECT p.id, s.size, 3, 'active' FROM products p
CROSS JOIN (SELECT '40' AS size UNION SELECT '41' UNION SELECT '42' UNION SELECT '43') s
WHERE p.slug IN ('urban-sprint', 'trail-max')
ON DUPLICATE KEY UPDATE stock_qty = VALUES(stock_qty);
