-- RunBonus+ Nutrition: трекер воды

CREATE TABLE IF NOT EXISTS nutrition_water_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount_ml INT NOT NULL,
  logged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_water_user_date (user_id, logged_at),
  CONSTRAINT fk_water_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE user_nutrition_profile
  ADD COLUMN daily_water_ml INT NULL;
