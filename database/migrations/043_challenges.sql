-- Sequential timed challenges (RunBonus TZ)

CREATE TABLE IF NOT EXISTS challenge_levels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  level_num INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  target_km DECIMAL(10,2) NOT NULL,
  deadline_days INT NOT NULL DEFAULT 7,
  description TEXT NULL,
  example_reward VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_challenge_level_num (level_num),
  KEY idx_challenge_levels_sort (sort_order, level_num)
);

CREATE TABLE IF NOT EXISTS challenge_level_rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  level_id INT NOT NULL,
  reward_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_challenge_level_reward (level_id, reward_id),
  CONSTRAINT fk_clr_level FOREIGN KEY (level_id) REFERENCES challenge_levels(id) ON DELETE CASCADE,
  CONSTRAINT fk_clr_reward FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_challenges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  level_id INT NOT NULL,
  status ENUM('LOCKED','ACTIVE','COMPLETED','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  target_km DECIMAL(10,2) NOT NULL,
  current_km DECIMAL(12,3) NOT NULL DEFAULT 0,
  start_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  expired_at DATETIME NULL,
  reward_id INT NULL,
  reward_claimed_at DATETIME NULL,
  attempt INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_uc_user_status (user_id, status),
  KEY idx_uc_user_level (user_id, level_id),
  KEY idx_uc_expires (status, expires_at),
  CONSTRAINT fk_uc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_uc_level FOREIGN KEY (level_id) REFERENCES challenge_levels(id),
  CONSTRAINT fk_uc_reward FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_challenge_rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_challenge_id INT NOT NULL,
  user_id INT NOT NULL,
  level_id INT NOT NULL,
  reward_id INT NOT NULL,
  status ENUM('CLAIMED','PROCESSING','READY','DELIVERED','CANCELLED') NOT NULL DEFAULT 'CLAIMED',
  size VARCHAR(32) NULL,
  color VARCHAR(64) NULL,
  phone VARCHAR(32) NULL,
  address VARCHAR(500) NULL,
  city VARCHAR(120) NULL,
  promo_code VARCHAR(64) NULL,
  admin_comment TEXT NULL,
  claimed_at DATETIME NOT NULL,
  processed_at DATETIME NULL,
  delivered_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ucr_challenge (user_challenge_id),
  KEY idx_ucr_status (status),
  KEY idx_ucr_user (user_id),
  CONSTRAINT fk_ucr_challenge FOREIGN KEY (user_challenge_id) REFERENCES user_challenges(id) ON DELETE CASCADE,
  CONSTRAINT fk_ucr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ucr_level FOREIGN KEY (level_id) REFERENCES challenge_levels(id),
  CONSTRAINT fk_ucr_reward FOREIGN KEY (reward_id) REFERENCES rewards(id)
);

INSERT INTO challenge_levels (level_num, name, target_km, deadline_days, description, example_reward, sort_order, status)
VALUES
  (1, 'Задание 50 км', 50, 7, 'Пробегите 50 км за 7 дней', 'T-Shirt / скидка 30%', 10, 'active'),
  (2, 'Задание 100 км', 100, 14, 'Пробегите 100 км за 14 дней', 'Sports Bag / скидка на обувь', 20, 'active'),
  (3, 'Задание 200 км', 200, 21, 'Пробегите 200 км за 21 день', 'Special Gift', 30, 'active'),
  (4, 'Задание 300 км', 300, 28, 'Пробегите 300 км за 28 дней', 'Premium Gift', 40, 'active'),
  (5, 'Задание 500 км', 500, 35, 'Пробегите 500 км за 35 дней', 'VIP RunBonus Reward', 50, 'active')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  target_km = VALUES(target_km),
  deadline_days = VALUES(deadline_days),
  description = VALUES(description),
  example_reward = VALUES(example_reward),
  sort_order = VALUES(sort_order),
  status = VALUES(status);

