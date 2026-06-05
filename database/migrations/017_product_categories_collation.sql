-- Выравнивание collation для JOIN products.category_id = product_categories.id

ALTER TABLE product_categories CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE products
  MODIFY category_id VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;
