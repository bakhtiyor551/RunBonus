-- Firebase Push Notifications (FCM)

CREATE TABLE IF NOT EXISTS user_push_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(512) NOT NULL,
  platform ENUM('android', 'ios', 'web') NOT NULL DEFAULT 'android',
  device_id VARCHAR(128) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_token (user_id, token),
  KEY idx_push_user (user_id),
  KEY idx_push_token (token(191)),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS push_notification_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  campaign_id BIGINT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NULL,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_push_log_campaign (campaign_id),
  FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
