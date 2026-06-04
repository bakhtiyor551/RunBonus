-- Рекламный кабинет RunBonus

CREATE TABLE IF NOT EXISTS advertisers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(128) NULL,
  phone VARCHAR(32) NULL,
  email VARCHAR(128) NULL,
  address TEXT NULL,
  balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_advertisers_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ad_tariffs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(64) NOT NULL,
  days INT NOT NULL,
  price DECIMAL(12, 2) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO ad_tariffs (code, name, days, price, sort_order) VALUES
  ('start', 'Старт', 7, 100, 10),
  ('standard', 'Стандарт', 30, 300, 20),
  ('premium', 'Premium', 30, 500, 30)
ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price);

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  advertiser_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  ad_type ENUM('banner_home', 'banner_workout', 'push', 'promo') NOT NULL DEFAULT 'banner_home',
  banner_url TEXT NULL,
  target_url TEXT NULL,
  audience_cities JSON NULL,
  audience_levels JSON NULL,
  audience_activity JSON NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  budget DECIMAL(12, 2) NOT NULL DEFAULT 0,
  spent DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status ENUM('draft', 'pending_payment', 'active', 'paused', 'completed', 'cancelled') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ad_campaigns_advertiser (advertiser_id),
  KEY idx_ad_campaigns_status (status),
  KEY idx_ad_campaigns_dates (start_date, end_date),
  FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ad_statistics (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  campaign_id BIGINT NOT NULL,
  user_id INT NULL,
  event_type ENUM('impression', 'click', 'open') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ad_stats_campaign (campaign_id),
  KEY idx_ad_stats_event (event_type),
  KEY idx_ad_stats_created (created_at),
  FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ad_payments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  advertiser_id BIGINT NOT NULL,
  campaign_id BIGINT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  status ENUM('new', 'pending', 'paid', 'completed', 'cancelled') NOT NULL DEFAULT 'new',
  note TEXT NULL,
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ad_payments_advertiser (advertiser_id),
  KEY idx_ad_payments_status (status),
  FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
