-- Вывод средств RunBonus

ALTER TABLE user_bonus_wallets
  ADD COLUMN blocked_balance DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER balance,
  ADD COLUMN total_withdrawn DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER total_spent;

ALTER TABLE user_bonus_transactions
  MODIFY COLUMN type ENUM(
    'earn', 'spend', 'cancel', 'manual',
    'withdraw_hold', 'withdraw_success', 'withdraw_reject'
  ) NOT NULL;

CREATE TABLE IF NOT EXISTS withdrawal_methods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  code VARCHAR(32) NOT NULL UNIQUE,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS withdrawal_settings (
  id TINYINT PRIMARY KEY DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  min_amount DECIMAL(12, 2) NOT NULL DEFAULT 20,
  max_daily_amount DECIMAL(12, 2) NOT NULL DEFAULT 100,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO withdrawal_settings (id, enabled, min_amount, max_daily_amount)
VALUES (1, 1, 20, 100)
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO withdrawal_methods (name, code, sort_order) VALUES
  ('Душанбе Сити', 'dcity', 1),
  ('Алиф', 'alif', 2),
  ('Эсхата', 'eshata', 3),
  ('Спитамен', 'spitamen', 4),
  ('DC Next', 'dcnext', 5),
  ('Корти милли', 'korti', 6),
  ('Другое', 'other', 99)
ON DUPLICATE KEY UPDATE name = VALUES(name);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  method_id INT NOT NULL,
  wallet_name VARCHAR(64) NOT NULL,
  wallet_number VARCHAR(64) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  status ENUM('pending', 'processing', 'success', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  admin_id INT NULL,
  client_comment TEXT NULL,
  admin_comment TEXT NULL,
  telegram_message_id VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  rejected_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (method_id) REFERENCES withdrawal_methods(id),
  FOREIGN KEY (admin_id) REFERENCES admin_users(id),
  INDEX idx_wr_user (user_id),
  INDEX idx_wr_status (status),
  INDEX idx_wr_created (created_at)
);

CREATE TABLE IF NOT EXISTS withdrawal_status_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT NOT NULL,
  admin_id INT NULL,
  old_status VARCHAR(32) NULL,
  new_status VARCHAR(32) NOT NULL,
  comment TEXT NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES withdrawal_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES admin_users(id)
);
