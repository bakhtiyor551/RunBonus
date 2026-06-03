-- Отключить встроенные категории Бег/Город/Трейл — в приложении только категории из админки

UPDATE shop_categories SET status = 'inactive'
WHERE name IN ('Бег', 'Город', 'Трейл')
   OR slug IN ('running', 'urban', 'trail')
   OR CAST(id AS CHAR) IN ('1', '2', '3');
