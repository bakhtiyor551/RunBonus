-- AR-каталог Urban Sprint (3D / AR примерка)

CREATE TABLE IF NOT EXISTS shoe_models (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT NULL,
  price DECIMAL(10, 2) NULL,
  main_image TEXT NULL,
  glb_file VARCHAR(500) NULL,
  usdz_file VARCHAR(500) NULL,
  specs JSON NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_shoe_models_slug (slug),
  KEY idx_shoe_models_status (status),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS shoe_variants (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  shoe_model_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  color_name VARCHAR(80) NULL,
  color_code VARCHAR(20) NULL,
  glb_file VARCHAR(500) NULL,
  usdz_file VARCHAR(500) NULL,
  image TEXT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_shoe_variant_slug (shoe_model_id, slug),
  FOREIGN KEY (shoe_model_id) REFERENCES shoe_models(id) ON DELETE CASCADE
);

INSERT INTO shoe_models (product_id, name, slug, description, price, main_image, glb_file, usdz_file, specs, status)
SELECT p.id,
  'Urban Sprint',
  'urban-sprint',
  'Городская модель RunBonus с AR-примеркой. Лёгкие, дышащие, с программой бонусов за бег.',
  p.price,
  NULL,
  '/models/urban-sprint-night-pulse.glb',
  '/models/urban-sprint-night-pulse.usdz',
  JSON_OBJECT(
    'weight', '250–280 г',
    'cushioning', 'EVA амортизация',
    'upper', 'Дышащий Mesh',
    'traction', 'Надёжное сцепление',
    'fit', 'Анатомическая форма'
  ),
  'active'
FROM products p
WHERE p.slug = 'urban-sprint'
  AND NOT EXISTS (SELECT 1 FROM shoe_models sm WHERE sm.slug = 'urban-sprint');

INSERT INTO shoe_variants (shoe_model_id, name, slug, color_name, color_code, glb_file, usdz_file, is_default, status)
SELECT m.id, v.name, v.slug, v.color_name, v.color_code, v.glb, v.usdz, v.is_def, 'active'
FROM shoe_models m
CROSS JOIN (
  SELECT 'Night Pulse' AS name, 'night-pulse' AS slug, 'Night Pulse' AS color_name, '#0a0a0a' AS color_code,
    '/models/urban-sprint-night-pulse.glb' AS glb, '/models/urban-sprint-night-pulse.usdz' AS usdz, 1 AS is_def
  UNION SELECT 'Midnight Gold', 'midnight-gold', 'Midnight Gold', '#3d3d3d',
    '/models/urban-sprint-midnight-gold.glb', '/models/urban-sprint-midnight-gold.usdz', 0
  UNION SELECT 'Arctic Drive', 'arctic-drive', 'Arctic Drive', '#f5f5f5',
    '/models/urban-sprint-arctic-drive.glb', '/models/urban-sprint-arctic-drive.usdz', 0
  UNION SELECT 'Stealth Mode', 'stealth-mode', 'Stealth Mode', '#1a1a1a',
    '/models/urban-sprint-stealth-mode.glb', '/models/urban-sprint-stealth-mode.usdz', 0
) v
WHERE m.slug = 'urban-sprint'
  AND NOT EXISTS (SELECT 1 FROM shoe_variants sv WHERE sv.shoe_model_id = m.id LIMIT 1);
