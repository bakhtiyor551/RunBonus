-- RunBonus+ подписка и модуль «Питание и калории»

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  plan ENUM('runbonus_plus') NOT NULL DEFAULT 'runbonus_plus',
  status ENUM('active', 'expired', 'cancelled') NOT NULL DEFAULT 'active',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  source ENUM('admin', 'purchase', 'promo', 'trial') NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sub_user_status (user_id, status),
  CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_nutrition_profile (
  user_id INT PRIMARY KEY,
  weight_kg DECIMAL(5, 2) NULL,
  height_cm INT NULL,
  birth_year INT NULL,
  gender ENUM('male', 'female', 'other') NULL,
  activity_level ENUM('sedentary', 'light', 'moderate', 'active', 'very_active') NOT NULL DEFAULT 'moderate',
  goal ENUM('lose', 'maintain', 'gain') NOT NULL DEFAULT 'maintain',
  daily_calories INT NULL,
  daily_protein_g INT NULL,
  daily_fat_g INT NULL,
  daily_carbs_g INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_nutrition_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS food_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  country VARCHAR(40) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS nutrition_foods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NULL,
  name VARCHAR(120) NOT NULL,
  name_en VARCHAR(120) NULL,
  country VARCHAR(40) NULL,
  serving_grams INT NOT NULL DEFAULT 100,
  calories_per_100g DECIMAL(8, 2) NOT NULL,
  protein_per_100g DECIMAL(8, 2) NOT NULL DEFAULT 0,
  fat_per_100g DECIMAL(8, 2) NOT NULL DEFAULT 0,
  carbs_per_100g DECIMAL(8, 2) NOT NULL DEFAULT 0,
  fiber_per_100g DECIMAL(8, 2) NOT NULL DEFAULT 0,
  sugar_per_100g DECIMAL(8, 2) NOT NULL DEFAULT 0,
  sodium_mg DECIMAL(8, 2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  search_keywords VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_food_name (name),
  INDEX idx_food_country (country),
  FULLTEXT INDEX idx_food_search (name, name_en, search_keywords),
  CONSTRAINT fk_food_category FOREIGN KEY (category_id) REFERENCES food_categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS nutrition_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  food_id INT NULL,
  name VARCHAR(120) NOT NULL,
  meal_type ENUM('breakfast', 'lunch', 'dinner', 'snack') NOT NULL DEFAULT 'snack',
  grams DECIMAL(8, 2) NOT NULL DEFAULT 100,
  portions DECIMAL(4, 2) NOT NULL DEFAULT 1,
  calories DECIMAL(8, 2) NOT NULL,
  protein_g DECIMAL(8, 2) NOT NULL DEFAULT 0,
  fat_g DECIMAL(8, 2) NOT NULL DEFAULT 0,
  carbs_g DECIMAL(8, 2) NOT NULL DEFAULT 0,
  fiber_g DECIMAL(8, 2) NOT NULL DEFAULT 0,
  source ENUM('manual', 'search', 'photo_ai', 'favorite') NOT NULL DEFAULT 'manual',
  photo_url VARCHAR(500) NULL,
  ai_confidence DECIMAL(5, 2) NULL,
  logged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_nutrition_log_user_date (user_id, logged_at),
  CONSTRAINT fk_nlog_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_nlog_food FOREIGN KEY (food_id) REFERENCES nutrition_foods(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS nutrition_favorites (
  user_id INT NOT NULL,
  food_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, food_id),
  CONSTRAINT fk_nfav_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_nfav_food FOREIGN KEY (food_id) REFERENCES nutrition_foods(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS nutrition_ai_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  photo_url VARCHAR(500) NULL,
  detected_name VARCHAR(120) NULL,
  confidence DECIMAL(5, 2) NULL,
  grams DECIMAL(8, 2) NULL,
  calories DECIMAL(8, 2) NULL,
  protein_g DECIMAL(8, 2) NULL,
  fat_g DECIMAL(8, 2) NULL,
  carbs_g DECIMAL(8, 2) NULL,
  fiber_g DECIMAL(8, 2) NULL,
  alternatives_json JSON NULL,
  raw_response_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_user (user_id, created_at),
  CONSTRAINT fk_ai_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS nutrition_diary_streaks (
  user_id INT PRIMARY KEY,
  current_streak INT NOT NULL DEFAULT 0,
  best_streak INT NOT NULL DEFAULT 0,
  last_log_date DATE NULL,
  bonus_awarded_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_streak_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Категории
INSERT IGNORE INTO food_categories (id, name, slug, country, sort_order) VALUES
  (1, 'Завтрак', 'breakfast', NULL, 1),
  (2, 'Обед', 'lunch', NULL, 2),
  (3, 'Ужин', 'dinner', NULL, 3),
  (4, 'Перекус', 'snack', NULL, 4),
  (5, 'Таджикская кухня', 'tajik', 'TJ', 10),
  (6, 'Русская кухня', 'russian', 'RU', 11),
  (7, 'Узбекская кухня', 'uzbek', 'UZ', 12);

-- База блюд (калории на 100 г)
INSERT IGNORE INTO nutrition_foods (id, category_id, name, name_en, country, serving_grams, calories_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g, fiber_per_100g, search_keywords) VALUES
  (1, 5, 'Плов', 'Plov', 'TJ', 350, 243, 7.4, 10.9, 29.1, 1.5, 'plov pilaf rice'),
  (2, 5, 'Курутоб', 'Qurutob', 'TJ', 400, 165, 8.2, 6.5, 18.0, 3.0, 'qurutob flatbread yogurt'),
  (3, 5, 'Шашлык', 'Shashlik', 'TJ', 200, 250, 22.0, 16.0, 2.0, 0.0, 'shashlik kebab meat'),
  (4, 5, 'Манту', 'Manti', 'TJ', 300, 220, 10.5, 8.0, 26.0, 1.8, 'manti dumplings'),
  (5, 5, 'Самбуса', 'Sambusa', 'TJ', 120, 290, 8.0, 16.0, 28.0, 2.0, 'sambusa samosa'),
  (6, 5, 'Шурбо', 'Shurbo', 'TJ', 350, 85, 5.5, 3.5, 8.0, 1.5, 'shurbo soup'),
  (7, 5, 'Оши бурида', 'Oshi purida', 'TJ', 350, 180, 6.0, 7.0, 22.0, 2.0, 'oshi purida'),
  (8, 5, 'Тушбера', 'Tushbera', 'TJ', 300, 175, 9.0, 5.5, 20.0, 1.2, 'tushbera dumplings soup'),
  (9, 5, 'Лепёшка', 'Non', 'TJ', 150, 275, 8.5, 3.0, 52.0, 2.5, 'non lepyoshka bread'),
  (10, 5, 'Чака', 'Chaka', 'TJ', 100, 120, 12.0, 6.0, 4.0, 0.0, 'chaka cottage cheese'),
  (11, 5, 'Каймак', 'Qaymoq', 'TJ', 50, 340, 2.5, 35.0, 3.0, 0.0, 'qaymoq cream'),
  (12, 6, 'Борщ', 'Borscht', 'RU', 350, 65, 3.0, 2.5, 8.0, 1.8, 'borscht soup'),
  (13, 6, 'Пельмени', 'Pelmeni', 'RU', 300, 230, 11.0, 10.0, 24.0, 1.5, 'pelmeni dumplings'),
  (14, 6, 'Блины', 'Blini', 'RU', 150, 227, 6.5, 9.0, 28.0, 1.0, 'blini pancakes'),
  (15, 7, 'Плов (узбекский)', 'Uzbek plov', 'UZ', 350, 250, 7.8, 11.5, 28.5, 1.6, 'uzbek plov'),
  (16, 7, 'Лагман', 'Lagman', 'UZ', 400, 145, 8.0, 6.0, 15.0, 2.0, 'lagman noodles'),
  (17, 1, 'Овсяная каша', 'Oatmeal', NULL, 250, 88, 3.0, 1.5, 15.0, 2.0, 'oatmeal oats breakfast'),
  (18, 3, 'Салат овощной', 'Vegetable salad', NULL, 200, 45, 1.5, 2.0, 6.0, 2.5, 'salad vegetables'),
  (19, 4, 'Яблоко', 'Apple', NULL, 180, 52, 0.3, 0.2, 14.0, 2.4, 'apple fruit'),
  (20, 4, 'Банан', 'Banana', NULL, 120, 89, 1.1, 0.3, 23.0, 2.6, 'banana fruit'),
  (21, 2, 'Куриная грудка', 'Chicken breast', NULL, 200, 165, 31.0, 3.6, 0.0, 0.0, 'chicken breast protein'),
  (22, 2, 'Рис отварной', 'Boiled rice', NULL, 200, 130, 2.7, 0.3, 28.0, 0.4, 'rice boiled'),
  (23, 4, 'Йогурт', 'Yogurt', NULL, 150, 59, 3.5, 3.3, 4.7, 0.0, 'yogurt dairy'),
  (24, 1, 'Яичница', 'Fried eggs', NULL, 150, 196, 13.0, 15.0, 1.0, 0.0, 'eggs fried breakfast'),
  (25, 3, 'Рыба запечённая', 'Baked fish', NULL, 200, 140, 22.0, 5.0, 0.0, 0.0, 'fish baked');
