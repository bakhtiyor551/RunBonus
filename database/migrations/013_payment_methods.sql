-- Способы оплаты магазина (управление из админки)

CREATE TABLE IF NOT EXISTS payment_methods (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  label VARCHAR(128) NOT NULL,
  needs_details TINYINT(1) NOT NULL DEFAULT 0,
  details_label VARCHAR(255) NULL,
  uses_transfer_modal TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  is_builtin TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_payment_methods_status (status),
  KEY idx_payment_methods_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO payment_methods (id, label, needs_details, details_label, uses_transfer_modal, sort_order, status, is_builtin)
VALUES
  ('bonus', 'Оплата бонусами', 0, NULL, 0, 0, 'active', 1),
  ('cash', 'Наличные при доставке', 0, NULL, 0, 10, 'active', 1),
  ('card', 'Банковская карта', 1, 'Номер карты или последние 4 цифры', 0, 20, 'active', 1),
  ('mobile', 'Мобильный перевод', 0, NULL, 1, 30, 'active', 1),
  ('bank', 'Перевод на расчётный счёт', 1, 'Банк или ФИО плательщика', 0, 40, 'active', 1)
ON DUPLICATE KEY UPDATE label = VALUES(label);
