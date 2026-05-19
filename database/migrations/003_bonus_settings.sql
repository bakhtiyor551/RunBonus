CREATE TABLE IF NOT EXISTS bonus_settings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  price_per_km DECIMAL(10, 2) NOT NULL DEFAULT 3.00,
  daily_limit DECIMAL(10, 2) NOT NULL DEFAULT 10.00,
  total_limit_per_shoe DECIMAL(10, 2) NOT NULL DEFAULT 200.00,
  min_distance_km DECIMAL(10, 2) NOT NULL DEFAULT 0.50,
  min_duration_minutes INT NOT NULL DEFAULT 5,
  max_speed_kmh DECIMAL(10, 2) NOT NULL DEFAULT 18.00,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bonus_settings_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  field_name VARCHAR(64) NOT NULL,
  field_label VARCHAR(120) NOT NULL,
  old_value VARCHAR(255) NULL,
  new_value VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  INDEX idx_bonus_settings_log_created (created_at)
);

ALTER TABLE workouts ADD COLUMN price_per_km DECIMAL(10, 2) NULL;
ALTER TABLE workouts ADD COLUMN calculated_bonus DECIMAL(10, 2) NULL;

INSERT INTO bonus_settings (
  price_per_km, daily_limit, total_limit_per_shoe,
  min_distance_km, min_duration_minutes, max_speed_kmh, status
)
SELECT 3, 10, 200, 0.5, 5, 18, 'active'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM bonus_settings LIMIT 1);
