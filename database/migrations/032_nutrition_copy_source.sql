-- RunBonus+ Nutrition: источник copy для копирования дневника

ALTER TABLE nutrition_logs
  MODIFY COLUMN source ENUM('manual', 'search', 'photo_ai', 'favorite', 'copy') NOT NULL DEFAULT 'manual';
