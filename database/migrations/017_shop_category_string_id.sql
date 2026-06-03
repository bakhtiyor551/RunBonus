-- Категории со строковым id (shoes, tshirt…) как в админке

ALTER TABLE products
  MODIFY COLUMN category_id VARCHAR(32) NULL;
