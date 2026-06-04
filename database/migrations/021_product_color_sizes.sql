-- Размеры и остаток по варианту цвета

CREATE TABLE IF NOT EXISTS product_color_sizes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_color_id BIGINT NOT NULL,
  size VARCHAR(20) NOT NULL,
  stock_qty INT NOT NULL DEFAULT 0,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  UNIQUE KEY uk_product_color_size (product_color_id, size),
  KEY idx_product_color_sizes_color (product_color_id),
  FOREIGN KEY (product_color_id) REFERENCES product_colors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Перенос общих размеров на первый цвет товара (если есть цвета)
INSERT INTO product_color_sizes (product_color_id, size, stock_qty, status)
SELECT pc.id, ps.size, ps.stock_qty, ps.status
FROM product_sizes ps
JOIN product_colors pc ON pc.product_id = ps.product_id
  AND pc.id = (
    SELECT MIN(pc2.id) FROM product_colors pc2 WHERE pc2.product_id = ps.product_id
  )
WHERE NOT EXISTS (
  SELECT 1 FROM product_color_sizes pcs WHERE pcs.product_color_id = pc.id AND pcs.size = ps.size
);
