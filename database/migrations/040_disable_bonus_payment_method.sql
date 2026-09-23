-- Disable shop "pay with bonus" payment method (rewards ≠ shop purchases).
UPDATE payment_methods
SET status = 'inactive'
WHERE id = 'bonus';
