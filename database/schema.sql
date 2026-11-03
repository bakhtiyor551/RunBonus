CREATE DATABASE IF NOT EXISTS runbonus CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE runbonus;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  first_name VARCHAR(60) NULL,
  last_name VARCHAR(60) NULL,
  avatar_url VARCHAR(500) NULL,
  device_id VARCHAR(64) NULL,
  device_bound_at TIMESTAMP NULL,
  phone VARCHAR(20) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  status ENUM('active', 'blocked') NOT NULL DEFAULT 'active',
  total_distance_km DECIMAL(12,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  login VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('super_admin', 'manager', 'seller') NOT NULL DEFAULT 'manager',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shoe_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  model_name VARCHAR(120) NOT NULL,
  quantity INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_id INT NULL,
  model_name VARCHAR(120) NOT NULL,
  qr_code VARCHAR(255) NOT NULL,
  unique_id VARCHAR(64) NOT NULL UNIQUE,
  status ENUM('new', 'activated', 'blocked', 'expired') NOT NULL DEFAULT 'new',
  activated_by_user_id INT NULL,
  activated_at TIMESTAMP NULL,
  max_bonus_limit DECIMAL(10, 2) NOT NULL DEFAULT 200.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (activated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (batch_id) REFERENCES shoe_batches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS workouts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  shoe_id INT NOT NULL,
  distance_km DECIMAL(10, 3) NOT NULL DEFAULT 0,
  duration_seconds INT NOT NULL DEFAULT 0,
  avg_speed DECIMAL(6, 2) NULL,
  max_speed DECIMAL(6, 2) NULL,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP NULL,
  status ENUM('in_progress', 'approved', 'rejected', 'suspicious', 'rejected_no_fund') NOT NULL DEFAULT 'in_progress',
  reject_reason VARCHAR(500) NULL,
  price_per_km DECIMAL(10, 2) NULL,
  calculated_bonus DECIMAL(10, 2) NULL,
  level_snapshot JSON NULL,
  bonus_breakdown JSON NULL,
  client_visible_map BOOLEAN NOT NULL DEFAULT FALSE,
  client_visible_limits BOOLEAN NOT NULL DEFAULT FALSE,
  background_tracking BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shoe_id) REFERENCES shoes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workout_points (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  workout_id INT NOT NULL,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  speed DECIMAL(6, 2) NULL,
  accuracy DECIMAL(8, 2) NULL,
  recorded_at TIMESTAMP NOT NULL,
  FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
  INDEX idx_workout_points_workout (workout_id)
);

CREATE TABLE IF NOT EXISTS bonuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  shoe_id INT NULL,
  workout_id INT NULL,
  type ENUM('earn', 'spend', 'manual_add', 'manual_remove') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  balance_after DECIMAL(10, 2) NOT NULL,
  comment VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shoe_id) REFERENCES shoes(id) ON DELETE SET NULL,
  FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS daily_bonus_limits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  shoe_id INT NOT NULL,
  date DATE NOT NULL,
  earned_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_daily_limit (user_id, shoe_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shoe_id) REFERENCES shoes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_active_shoes (
  user_id INT NOT NULL PRIMARY KEY,
  shoe_id INT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shoe_id) REFERENCES shoes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS accounts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type ENUM('bonus_fund', 'cash', 'bank') NOT NULL,
  initial_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  current_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'TJS',
  status ENUM('active', 'blocked', 'closed') NOT NULL DEFAULT 'active',
  comment TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS account_transactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  account_id BIGINT NOT NULL,
  user_id INT NULL,
  workout_id INT NULL,
  type ENUM('topup', 'bonus_to_client', 'adjustment', 'refund') NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  balance_before DECIMAL(12, 2) NOT NULL,
  balance_after DECIMAL(12, 2) NOT NULL,
  comment TEXT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
  INDEX idx_account_tx_account (account_id),
  INDEX idx_account_tx_user (user_id)
);

CREATE TABLE IF NOT EXISTS user_bonus_wallets (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_earned DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_spent DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_bonus_transactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  shoe_id INT NULL,
  workout_id INT NULL,
  account_transaction_id BIGINT NULL,
  type ENUM('earn', 'spend', 'cancel', 'manual') NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  balance_before DECIMAL(12, 2) NOT NULL,
  balance_after DECIMAL(12, 2) NOT NULL,
  comment TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shoe_id) REFERENCES shoes(id) ON DELETE SET NULL,
  FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE SET NULL,
  FOREIGN KEY (account_transaction_id) REFERENCES account_transactions(id) ON DELETE SET NULL,
  INDEX idx_user_bonus_tx_user (user_id)
);

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

CREATE TABLE IF NOT EXISTS customer_levels (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
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
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  shoe_id INT NOT NULL,
  total_km DECIMAL(10,2) DEFAULT 0,
  total_bonus DECIMAL(10,2) DEFAULT 0,
  current_level_id BIGINT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_shoe (user_id, shoe_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shoe_id) REFERENCES shoes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_level_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  shoe_id INT NOT NULL,
  level_id BIGINT NOT NULL,
  reached_km DECIMAL(10,2) NOT NULL,
  reached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shoe_id) REFERENCES shoes(id) ON DELETE CASCADE
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

-- Rewards / milestones loyalty system
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
  color_options JSON NULL,
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
