-- SMS-коды для входа и регистрации

CREATE TABLE IF NOT EXISTS sms_verification_codes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  code_hash VARCHAR(64) NOT NULL,
  purpose ENUM('register', 'login') NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sms_phone_purpose (phone, purpose),
  KEY idx_sms_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
