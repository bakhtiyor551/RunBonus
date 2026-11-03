-- RunBonus+ Nutrition: штрихкоды продуктов

CREATE TABLE IF NOT EXISTS nutrition_food_barcodes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  food_id INT NOT NULL,
  barcode VARCHAR(20) NOT NULL,
  source ENUM('seed', 'off', 'admin', 'user') NOT NULL DEFAULT 'off',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_food_barcode (barcode),
  INDEX idx_barcode_food (food_id),
  CONSTRAINT fk_nfood_barcode_food FOREIGN KEY (food_id) REFERENCES nutrition_foods(id) ON DELETE CASCADE
);

ALTER TABLE nutrition_logs
  MODIFY COLUMN source ENUM('manual', 'search', 'photo_ai', 'favorite', 'copy', 'barcode') NOT NULL DEFAULT 'manual';
