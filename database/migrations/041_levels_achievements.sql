-- Levels + Achievements (separate from Rewards / milestones)

CREATE TABLE IF NOT EXISTS runbonus_levels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  level_number INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  min_distance DECIMAL(12,3) NOT NULL DEFAULT 0,
  max_distance DECIMAL(12,3) NULL,
  icon VARCHAR(64) NULL,
  color VARCHAR(32) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_runbonus_levels_number (level_number),
  KEY idx_runbonus_levels_distance (min_distance)
);

CREATE TABLE IF NOT EXISTS achievements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  type ENUM('DISTANCE','WORKOUT_COUNT','STREAK','EVENT','SPECIAL') NOT NULL,
  target_value DECIMAL(12,3) NOT NULL DEFAULT 0,
  icon VARCHAR(64) NULL,
  image VARCHAR(500) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_achievements_code (code),
  KEY idx_achievements_type (type, active)
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  achievement_id INT NOT NULL,
  unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_achievement (user_id, achievement_id),
  KEY idx_user_achievements_user (user_id),
  CONSTRAINT fk_ua_achievement FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE
);

INSERT INTO runbonus_levels (level_number, name, description, min_distance, max_distance, icon, color, sort_order, active)
SELECT * FROM (
  SELECT 0 AS level_number, 'Новичок' AS name, 'Старт пути RunBonus' AS description, 0 AS min_distance, 49.999 AS max_distance, '🩵' AS icon, '#7DD3FC' AS color, 0 AS sort_order, 1 AS active
  UNION ALL SELECT 1, 'Runner', 'Первые 50 км', 50, 99.999, '🔵', '#3B82F6', 10, 1
  UNION ALL SELECT 2, 'Active Runner', 'Активный бегун', 100, 199.999, '🔷', '#6366F1', 20, 1
  UNION ALL SELECT 3, 'Runner Pro', 'Профессиональный уровень', 200, 499.999, '🟢', '#22C55E', 30, 1
  UNION ALL SELECT 4, 'Runner Advanced', 'Продвинутый бегун', 500, 799.999, '🟢', '#16A34A', 40, 1
  UNION ALL SELECT 5, 'Runner Expert', 'Эксперт', 800, 999.999, '🟡', '#EAB308', 50, 1
  UNION ALL SELECT 6, 'Runner Master', 'Мастер', 1000, 1999.999, '🟠', '#F97316', 60, 1
  UNION ALL SELECT 7, 'Elite Runner', 'Элита', 2000, 4999.999, '🩷', '#EC4899', 70, 1
  UNION ALL SELECT 8, 'Ultra Runner', 'Ультра', 5000, 7999.999, '🔴', '#EF4444', 80, 1
  UNION ALL SELECT 9, 'Legend', 'Легенда', 8000, 9999.999, '🟡', '#FACC15', 90, 1
  UNION ALL SELECT 10, 'RunBonus Legend', 'Вершина RunBonus', 10000, NULL, '⚫', '#111827', 100, 1
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM runbonus_levels LIMIT 1);

INSERT INTO achievements (code, name, description, type, target_value, icon, sort_order, active)
SELECT * FROM (
  SELECT 'first_km' AS code, 'First KM' AS name, 'Пробегите первые 1 км' AS description, 'DISTANCE' AS type, 1 AS target_value, '🏁' AS icon, 10 AS sort_order, 1 AS active
  UNION ALL SELECT 'dist_5', '5 KM Runner', 'Достигните 5 км суммарно', 'DISTANCE', 5, '🥉', 20, 1
  UNION ALL SELECT 'dist_10', '10 KM Runner', 'Достигните 10 км суммарно', 'DISTANCE', 10, '🥈', 30, 1
  UNION ALL SELECT 'dist_50', '50 KM', 'Достигните 50 км суммарно', 'DISTANCE', 50, '🏆', 40, 1
  UNION ALL SELECT 'dist_100', '100 KM', 'Достигните 100 км суммарно', 'DISTANCE', 100, '💎', 50, 1
  UNION ALL SELECT 'dist_200', '200 KM', 'Достигните 200 км суммарно', 'DISTANCE', 200, '💎', 60, 1
  UNION ALL SELECT 'dist_500', '500 KM', 'Достигните 500 км суммарно', 'DISTANCE', 500, '👑', 70, 1
  UNION ALL SELECT 'dist_1000', '1000 KM', 'Достигните 1000 км суммарно', 'DISTANCE', 1000, '👑', 80, 1
  UNION ALL SELECT 'first_workout', 'First Workout', 'Первая подтверждённая тренировка', 'WORKOUT_COUNT', 1, '🏃', 100, 1
  UNION ALL SELECT 'workouts_10', '10 Workouts', '10 подтверждённых тренировок', 'WORKOUT_COUNT', 10, '🏃', 110, 1
  UNION ALL SELECT 'workouts_50', '50 Workouts', '50 подтверждённых тренировок', 'WORKOUT_COUNT', 50, '🏃', 120, 1
  UNION ALL SELECT 'workouts_100', '100 Workouts', '100 подтверждённых тренировок', 'WORKOUT_COUNT', 100, '🏃', 130, 1
  UNION ALL SELECT 'workouts_500', '500 Workouts', '500 подтверждённых тренировок', 'WORKOUT_COUNT', 500, '🏃', 140, 1
  UNION ALL SELECT 'streak_3', '3 Days', 'Тренировки 3 дня подряд', 'STREAK', 3, '🔥', 200, 1
  UNION ALL SELECT 'streak_7', '7 Days', 'Тренировки 7 дней подряд', 'STREAK', 7, '🔥', 210, 1
  UNION ALL SELECT 'streak_14', '14 Days', 'Тренировки 14 дней подряд', 'STREAK', 14, '🔥', 220, 1
  UNION ALL SELECT 'streak_30', '30 Days', 'Тренировки 30 дней подряд', 'STREAK', 30, '🔥', 230, 1
  UNION ALL SELECT 'streak_100', '100 Days', 'Тренировки 100 дней подряд', 'STREAK', 100, '🔥', 240, 1
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM achievements LIMIT 1);
