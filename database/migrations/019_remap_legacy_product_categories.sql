-- Старые категории Бег/Город/Трейл (1/2/3) → «Кроссовки» из админки

UPDATE products SET category_id = 'shoes'
WHERE CAST(category_id AS CHAR) IN ('1', '2', '3', 'running', 'urban', 'trail')
  AND status = 'active';
