-- RunBonus+ Nutrition: трекер веса

CREATE TABLE IF NOT EXISTS nutrition_weight_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  weight_kg DECIMAL(5, 2) NOT NULL,
  body_fat_pct DECIMAL(4, 1) NULL,
  logged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source ENUM('manual', 'smart_scale') NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_weight_user_date (user_id, logged_at),
  CONSTRAINT fk_weight_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
