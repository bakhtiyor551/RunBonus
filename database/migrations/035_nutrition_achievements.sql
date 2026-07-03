-- RunBonus+ Nutrition: достижения

CREATE TABLE IF NOT EXISTS nutrition_achievements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(60) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(255) NOT NULL,
  icon VARCHAR(40) NOT NULL DEFAULT 'emoji_events',
  category ENUM('streak', 'weight', 'workout', 'food', 'ai', 'water', 'protein') NOT NULL,
  metric VARCHAR(40) NOT NULL,
  threshold INT NOT NULL,
  bonus_points INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uk_achievement_slug (slug),
  INDEX idx_achievement_category (category, sort_order)
);

CREATE TABLE IF NOT EXISTS user_nutrition_achievements (
  user_id INT NOT NULL,
  achievement_id INT NOT NULL,
  unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, achievement_id),
  INDEX idx_user_ach_unlocked (user_id, unlocked_at),
  CONSTRAINT fk_unach_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_unach_achievement FOREIGN KEY (achievement_id) REFERENCES nutrition_achievements(id) ON DELETE CASCADE
);
