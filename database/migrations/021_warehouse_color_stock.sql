-- Остатки и движения по цвету (размер + цвет)

ALTER TABLE product_sizes ADD COLUMN color_label VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE stock_movements ADD COLUMN color_label VARCHAR(128) NOT NULL DEFAULT '';

ALTER TABLE product_sizes ADD UNIQUE KEY uk_product_size_color (product_id, size, color_label);
ALTER TABLE product_sizes DROP INDEX uk_product_size;
