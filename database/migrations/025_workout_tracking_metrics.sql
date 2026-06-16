USE runbonus;

ALTER TABLE workouts
  ADD COLUMN steps_count INT NULL DEFAULT NULL AFTER max_speed,
  ADD COLUMN moving_seconds INT NULL DEFAULT NULL AFTER steps_count,
  ADD COLUMN pause_seconds INT NULL DEFAULT NULL AFTER moving_seconds;
