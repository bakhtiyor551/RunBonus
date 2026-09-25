-- RunBonus TZ: GPS tracking statuses, approved km, validation metadata, pause
-- Idempotent where possible (safe to re-run).

ALTER TABLE workouts
  MODIFY COLUMN status ENUM(
    'in_progress',
    'paused',
    'processing',
    'approved',
    'suspicious',
    'rejected',
    'auto_closed',
    'rejected_no_fund'
  ) NOT NULL DEFAULT 'in_progress';

-- workouts columns
SET @db := DATABASE();

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='workouts' AND COLUMN_NAME='approved_distance_km'),
    'SELECT 1',
    'ALTER TABLE workouts ADD COLUMN approved_distance_km DECIMAL(10, 3) NULL AFTER distance_km'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='workouts' AND COLUMN_NAME='active_duration_seconds'),
    'SELECT 1',
    'ALTER TABLE workouts ADD COLUMN active_duration_seconds INT NULL AFTER duration_seconds'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='workouts' AND COLUMN_NAME='avg_pace'),
    'SELECT 1',
    'ALTER TABLE workouts ADD COLUMN avg_pace DECIMAL(8, 2) NULL AFTER max_speed'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='workouts' AND COLUMN_NAME='gps_points_count'),
    'SELECT 1',
    'ALTER TABLE workouts ADD COLUMN gps_points_count INT NULL AFTER avg_pace'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='workouts' AND COLUMN_NAME='validation_status'),
    'SELECT 1',
    'ALTER TABLE workouts ADD COLUMN validation_status VARCHAR(32) NULL AFTER reject_reason'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='workouts' AND COLUMN_NAME='validation_score'),
    'SELECT 1',
    'ALTER TABLE workouts ADD COLUMN validation_score DECIMAL(6, 2) NULL AFTER validation_status'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='workouts' AND COLUMN_NAME='validation_reasons'),
    'SELECT 1',
    'ALTER TABLE workouts ADD COLUMN validation_reasons JSON NULL AFTER validation_score'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='workouts' AND COLUMN_NAME='paused_at'),
    'SELECT 1',
    'ALTER TABLE workouts ADD COLUMN paused_at TIMESTAMP NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='workouts' AND COLUMN_NAME='device_id'),
    'SELECT 1',
    'ALTER TABLE workouts ADD COLUMN device_id VARCHAR(128) NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- workout_points altitude / course
SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='workout_points' AND COLUMN_NAME='altitude'),
    'SELECT 1',
    'ALTER TABLE workout_points ADD COLUMN altitude DECIMAL(10, 2) NULL AFTER accuracy'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='workout_points' AND COLUMN_NAME='course'),
    'SELECT 1',
    'ALTER TABLE workout_points ADD COLUMN course DECIMAL(8, 2) NULL AFTER altitude'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Indexes
SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='workouts' AND INDEX_NAME='idx_workouts_in_progress_started'),
    'SELECT 1',
    'CREATE INDEX idx_workouts_in_progress_started ON workouts (status, started_at)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='workout_points' AND INDEX_NAME='idx_workout_points_workout_ts'),
    'SELECT 1',
    'CREATE INDEX idx_workout_points_workout_ts ON workout_points (workout_id, recorded_at)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
