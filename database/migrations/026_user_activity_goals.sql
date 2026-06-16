CREATE TABLE IF NOT EXISTS user_activity_goals (
  user_id INT PRIMARY KEY,
  daily_distance_km DECIMAL(8, 2) NOT NULL DEFAULT 8.00,
  daily_steps INT NOT NULL DEFAULT 8000,
  daily_active_minutes INT NOT NULL DEFAULT 60,
  daily_calories INT NOT NULL DEFAULT 600,
  weekly_distance_km DECIMAL(8, 2) NOT NULL DEFAULT 30.00,
  weekly_steps INT NOT NULL DEFAULT 50000,
  monthly_distance_km DECIMAL(8, 2) NOT NULL DEFAULT 120.00,
  monthly_bonus DECIMAL(12, 2) NOT NULL DEFAULT 200.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_activity_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
