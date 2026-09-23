-- Rewards / milestones system (replaces money-per-km accrual)

ALTER TABLE users
  ADD COLUMN total_distance_km DECIMAL(12,3) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS reward_milestones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  distance_km DECIMAL(10,2) NOT NULL,
  description TEXT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reward_milestones_distance (distance_km)
);

CREATE TABLE IF NOT EXISTS rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  type ENUM('PRODUCT','DISCOUNT','SPECIAL','VIP') NOT NULL DEFAULT 'PRODUCT',
  description TEXT NULL,
  image VARCHAR(500) NULL,
  stock INT NOT NULL DEFAULT 0,
  reserved INT NOT NULL DEFAULT 0,
  discount_percent DECIMAL(5,2) NULL,
  discount_min_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_max_amount DECIMAL(12,2) NULL,
  discount_valid_days INT NOT NULL DEFAULT 30,
  discount_usage_limit INT NOT NULL DEFAULT 1,
  requires_size TINYINT(1) NOT NULL DEFAULT 0,
  size_options JSON NULL,
  cost_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS milestone_rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  milestone_id INT NOT NULL,
  reward_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_milestone_reward (milestone_id, reward_id),
  CONSTRAINT fk_mr_milestone FOREIGN KEY (milestone_id) REFERENCES reward_milestones(id) ON DELETE CASCADE,
  CONSTRAINT fk_mr_reward FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reward_stock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reward_id INT NOT NULL,
  size VARCHAR(32) NOT NULL DEFAULT '',
  color VARCHAR(64) NOT NULL DEFAULT '',
  quantity INT NOT NULL DEFAULT 0,
  reserved INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_reward_stock_variant (reward_id, size, color),
  CONSTRAINT fk_rs_reward FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  milestone_id INT NOT NULL,
  reward_id INT NULL,
  status ENUM(
    'LOCKED','AVAILABLE','CHOOSING','SELECTED',
    'PROCESSING','READY','DELIVERED','CANCELLED'
  ) NOT NULL DEFAULT 'AVAILABLE',
  selected_at DATETIME NULL,
  processed_at DATETIME NULL,
  delivered_at DATETIME NULL,
  promo_code VARCHAR(64) NULL,
  admin_comment TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_milestone (user_id, milestone_id),
  KEY idx_user_rewards_status (status),
  KEY idx_user_rewards_user (user_id),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_milestone FOREIGN KEY (milestone_id) REFERENCES reward_milestones(id),
  CONSTRAINT fk_ur_reward FOREIGN KEY (reward_id) REFERENCES rewards(id)
);

CREATE TABLE IF NOT EXISTS reward_delivery (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_reward_id INT NOT NULL,
  user_id INT NOT NULL,
  reward_id INT NOT NULL,
  size VARCHAR(32) NULL,
  color VARCHAR(64) NULL,
  phone VARCHAR(32) NULL,
  address TEXT NULL,
  city VARCHAR(120) NULL,
  delivery_status ENUM('new','processing','ready','shipped','delivered','cancelled') NOT NULL DEFAULT 'new',
  tracking_number VARCHAR(120) NULL,
  admin_comment TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rd_user_reward (user_reward_id),
  CONSTRAINT fk_rd_ur FOREIGN KEY (user_reward_id) REFERENCES user_rewards(id) ON DELETE CASCADE,
  CONSTRAINT fk_rd_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rd_reward FOREIGN KEY (reward_id) REFERENCES rewards(id)
);

CREATE TABLE IF NOT EXISTS reward_promo_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_reward_id INT NOT NULL,
  user_id INT NOT NULL,
  reward_id INT NOT NULL,
  milestone_id INT NOT NULL,
  code VARCHAR(64) NOT NULL,
  discount_percent DECIMAL(5,2) NOT NULL,
  min_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  max_amount DECIMAL(12,2) NULL,
  status ENUM('ACTIVE','USED','EXPIRED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  expires_at DATETIME NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_promo_code (code),
  KEY idx_promo_user (user_id),
  CONSTRAINT fk_promo_ur FOREIGN KEY (user_reward_id) REFERENCES user_rewards(id) ON DELETE CASCADE
);

-- Seed milestones
INSERT INTO reward_milestones (name, distance_km, description, status, sort_order)
SELECT * FROM (
  SELECT '50 км' AS name, 50 AS distance_km, 'Первая награда RunBonus' AS description, 'active' AS status, 10 AS sort_order
  UNION ALL SELECT '100 км', 100, 'Вторая награда', 'active', 20
  UNION ALL SELECT '200 км', 200, 'Третья награда', 'active', 30
  UNION ALL SELECT '300 км', 300, 'Премиальная награда', 'active', 40
  UNION ALL SELECT '500 км', 500, 'VIP-награда RunBonus', 'active', 50
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM reward_milestones LIMIT 1);

-- Seed rewards
INSERT INTO rewards (name, type, description, stock, reserved, discount_percent, discount_valid_days, requires_size, size_options, cost_amount, active)
SELECT * FROM (
  SELECT 'Спортивная бутылка RunBonus' AS name, 'PRODUCT' AS type, 'Спортивная бутылка RunBonus' AS description,
         100 AS stock, 0 AS reserved, NULL AS discount_percent, 30 AS discount_valid_days,
         0 AS requires_size, NULL AS size_options, 25 AS cost_amount, 1 AS active
  UNION ALL SELECT 'Футболка RunBonus', 'PRODUCT', 'Футболка RunBonus', 100, 0, NULL, 30, 1,
         JSON_ARRAY('S','M','L','XL','XXL'), 45, 1
  UNION ALL SELECT 'Скидка 30%', 'DISCOUNT', 'Скидка 30% на следующую покупку', 0, 0, 30, 30, 0, NULL, 0, 1
  UNION ALL SELECT 'Спортивная сумка', 'PRODUCT', 'Спортивная сумка RunBonus', 50, 0, NULL, 30, 0, NULL, 80, 1
  UNION ALL SELECT 'Скидка на кроссовки', 'DISCOUNT', 'Скидка на кроссовки RunBonus', 0, 0, 20, 45, 0, NULL, 0, 1
  UNION ALL SELECT 'Большая скидка', 'DISCOUNT', 'Большая скидка на покупку', 0, 0, 40, 45, 0, NULL, 0, 1
  UNION ALL SELECT 'Специальный подарок', 'SPECIAL', 'Специальный подарок RunBonus', 30, 0, NULL, 30, 0, NULL, 120, 1
  UNION ALL SELECT 'Премиальный подарок', 'SPECIAL', 'Премиальный подарок за 300 км', 20, 0, NULL, 30, 0, NULL, 200, 1
  UNION ALL SELECT 'VIP Gift Box', 'VIP', 'VIP-награда RunBonus за 500 км', 10, 0, NULL, 30, 0, NULL, 500, 1
) AS r
WHERE NOT EXISTS (SELECT 1 FROM rewards LIMIT 1);

-- Link milestone ↔ rewards (by names/distances)
INSERT INTO milestone_rewards (milestone_id, reward_id, sort_order, active)
SELECT m.id, r.id, x.sort_order, 1
FROM (
  SELECT 50 AS distance_km, 'Спортивная бутылка RunBonus' AS reward_name, 10 AS sort_order
  UNION ALL SELECT 50, 'Футболка RunBonus', 20
  UNION ALL SELECT 50, 'Скидка 30%', 30
  UNION ALL SELECT 100, 'Спортивная сумка', 10
  UNION ALL SELECT 100, 'Скидка на кроссовки', 20
  UNION ALL SELECT 200, 'Большая скидка', 10
  UNION ALL SELECT 200, 'Специальный подарок', 20
  UNION ALL SELECT 300, 'Премиальный подарок', 10
  UNION ALL SELECT 500, 'VIP Gift Box', 10
) x
JOIN reward_milestones m ON m.distance_km = x.distance_km
JOIN rewards r ON r.name = x.reward_name
WHERE NOT EXISTS (SELECT 1 FROM milestone_rewards LIMIT 1);

-- T-shirt size stock
INSERT INTO reward_stock (reward_id, size, color, quantity, reserved)
SELECT r.id, s.size, '', s.qty, 0
FROM rewards r
JOIN (
  SELECT 'S' AS size, 12 AS qty
  UNION ALL SELECT 'M', 25
  UNION ALL SELECT 'L', 31
  UNION ALL SELECT 'XL', 18
  UNION ALL SELECT 'XXL', 14
) s
WHERE r.name = 'Футболка RunBonus'
  AND NOT EXISTS (SELECT 1 FROM reward_stock WHERE reward_id = r.id);
