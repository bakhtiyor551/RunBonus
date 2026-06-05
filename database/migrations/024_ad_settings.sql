-- Глобальные настройки рекламы (партнёрские баннеры + AdMob)

CREATE TABLE IF NOT EXISTS ad_settings (
  id TINYINT PRIMARY KEY DEFAULT 1,
  partner_ads_enabled TINYINT(1) NOT NULL DEFAULT 1,
  impression_cost DECIMAL(8, 4) NOT NULL DEFAULT 0.01,
  admob_enabled TINYINT(1) NOT NULL DEFAULT 1,
  admob_test_mode TINYINT(1) NOT NULL DEFAULT 0,
  admob_app_id VARCHAR(128) NULL,
  admob_google_home VARCHAR(128) NULL,
  admob_google_workout VARCHAR(128) NULL,
  admob_google_shop VARCHAR(128) NULL,
  admob_play_home VARCHAR(128) NULL,
  admob_play_workout VARCHAR(128) NULL,
  admob_play_shop VARCHAR(128) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO ad_settings (id, partner_ads_enabled, impression_cost, admob_enabled, admob_test_mode)
VALUES (1, 1, 0.01, 1, 0)
ON DUPLICATE KEY UPDATE id = id;
