ALTER TABLE users
  ADD COLUMN device_id VARCHAR(64) NULL AFTER avatar_url,
  ADD COLUMN device_bound_at TIMESTAMP NULL AFTER device_id;
