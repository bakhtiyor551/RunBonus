-- Гарантировать категории магазина из админки (активные)

INSERT INTO shop_categories (id, name, slug, sort_order, status)
VALUES
  ('shoes', 'Кроссовки', 'shoes', 10, 'active'),
  ('tshirt', 'Футболки', 'tshirt', 20, 'active'),
  ('shorts', 'Шорты', 'shorts', 30, 'active')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  slug = VALUES(slug),
  sort_order = VALUES(sort_order),
  status = 'active';

UPDATE products SET category_id = 'shoes'
WHERE CAST(category_id AS CHAR) IN ('1', '2', '3', 'running', 'urban', 'trail')
  AND status = 'active';
