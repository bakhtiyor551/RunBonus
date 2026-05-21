ALTER TABLE users
  ADD COLUMN first_name VARCHAR(60) NULL AFTER name,
  ADD COLUMN last_name VARCHAR(60) NULL AFTER first_name,
  ADD COLUMN avatar_url VARCHAR(500) NULL AFTER last_name;
