-- Bottle colors + color_options column for PRODUCT rewards

ALTER TABLE rewards
  ADD COLUMN color_options JSON NULL AFTER size_options;

UPDATE rewards
SET color_options = JSON_ARRAY('Чёрный', 'Белый', 'Красный')
WHERE name = 'Спортивная бутылка RunBonus'
  AND (color_options IS NULL OR color_options = 'null');

-- Also seed color stock variants for the bottle when missing
INSERT INTO reward_stock (reward_id, size, color, quantity, reserved)
SELECT r.id, '', c.color, c.qty, 0
FROM rewards r
JOIN (
  SELECT 'Чёрный' AS color, 40 AS qty
  UNION ALL SELECT 'Белый', 35
  UNION ALL SELECT 'Красный', 25
) c
WHERE r.name = 'Спортивная бутылка RunBonus'
  AND NOT EXISTS (
    SELECT 1 FROM reward_stock rs
    WHERE rs.reward_id = r.id AND rs.color = c.color
  );
