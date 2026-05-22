CREATE TABLE IF NOT EXISTS customer_levels (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) NOT NULL,
  from_km DECIMAL(10,2) NOT NULL,
  to_km DECIMAL(10,2) NOT NULL,
  price_per_km DECIMAL(10,2) NOT NULL,
  color VARCHAR(50) NULL,
  icon VARCHAR(100) NULL,
  status ENUM('active','inactive') DEFAULT 'active',
  description TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_customer_levels_code (code)
);

CREATE TABLE IF NOT EXISTS user_shoe_progress (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  shoe_id BIGINT NOT NULL,
  total_km DECIMAL(10,2) DEFAULT 0,
  total_bonus DECIMAL(10,2) DEFAULT 0,
  current_level_id BIGINT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_shoe (user_id, shoe_id),
  KEY idx_user_shoe_progress_user (user_id)
);

CREATE TABLE IF NOT EXISTS user_level_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  shoe_id BIGINT NOT NULL,
  level_id BIGINT NOT NULL,
  reached_km DECIMAL(10,2) NOT NULL,
  reached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_level_history_user (user_id),
  KEY idx_level_history_shoe (shoe_id)
);

ALTER TABLE workouts ADD COLUMN level_snapshot JSON NULL;
ALTER TABLE workouts ADD COLUMN bonus_breakdown JSON NULL;

INSERT INTO customer_levels (name, code, from_km, to_km, price_per_km, color, icon, status, description)
SELECT * FROM (
  SELECT 'Bronze' AS name, 'bronze' AS code, 0 AS from_km, 50 AS to_km, 2.50 AS price_per_km,
         '#CD7F32' AS color, 'military_tech' AS icon, 'active' AS status,
         'Стартовый уровень: 0–50 км' AS description
  UNION ALL
  SELECT 'Silver', 'silver', 50, 80, 2.00, '#C0C0C0', 'workspace_premium', 'active', '50–80 км'
  UNION ALL
  SELECT 'Gold', 'gold', 80, 200, 0.30, '#FFD700', 'emoji_events', 'active', '80–200 км'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM customer_levels LIMIT 1);
