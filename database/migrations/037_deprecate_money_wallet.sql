-- Soft-deprecate money/wallet tables for rewards loyalty model.
-- Keep historical data read-only; do not drop yet (admin reports may still query).

-- Zero accrual rate so money-per-km cannot accidentally restart.
UPDATE bonus_settings
SET price_per_km = 0
WHERE status = 'active';

-- Tables retained as deprecated / read-only:
--   user_bonus_wallets, user_bonus_transactions, bonuses, withdrawals
-- Drop in a later migration after archive export if needed.
