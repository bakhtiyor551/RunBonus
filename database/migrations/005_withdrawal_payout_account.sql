-- Счёт компании, с которого списана выплата по заявке

ALTER TABLE withdrawal_requests
  ADD COLUMN payout_account_id BIGINT NULL AFTER admin_comment;

ALTER TABLE withdrawal_requests
  ADD CONSTRAINT fk_wr_payout_account FOREIGN KEY (payout_account_id) REFERENCES accounts(id);

ALTER TABLE account_transactions
  MODIFY COLUMN type ENUM(
    'topup',
    'bonus_to_client',
    'adjustment',
    'refund',
    'withdrawal_payout'
  ) NOT NULL;
