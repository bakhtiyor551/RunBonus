-- RunBonus+ Nutrition: импорт Open Food Facts

ALTER TABLE nutrition_foods
  ADD COLUMN food_source ENUM('seed', 'off', 'admin', 'user') NOT NULL DEFAULT 'seed',
  ADD COLUMN external_id VARCHAR(64) NULL,
  ADD UNIQUE KEY uk_food_external (external_id);

CREATE TABLE IF NOT EXISTS nutrition_import_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(40) NOT NULL DEFAULT 'openfoodfacts',
  file_name VARCHAR(255) NULL,
  status ENUM('running', 'completed', 'failed') NOT NULL DEFAULT 'running',
  rows_total INT NOT NULL DEFAULT 0,
  rows_inserted INT NOT NULL DEFAULT 0,
  rows_skipped INT NOT NULL DEFAULT 0,
  rows_errors INT NOT NULL DEFAULT 0,
  options_json JSON NULL,
  error_message TEXT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  INDEX idx_import_status (status, started_at)
);
