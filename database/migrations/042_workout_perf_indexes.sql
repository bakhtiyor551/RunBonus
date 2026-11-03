-- Workout performance: indexes for point append / live queries

ALTER TABLE workout_points
  ADD INDEX idx_workout_points_workout_recorded (workout_id, recorded_at);

ALTER TABLE workouts
  ADD INDEX idx_workouts_status_started (status, started_at);

ALTER TABLE workouts
  ADD INDEX idx_workouts_user_status (user_id, status);
