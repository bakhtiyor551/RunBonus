import WorkoutTracking from '../plugins/workoutNative';

export async function startWorkoutForeground(title = 'RunBonus — тренировка') {
  try {
    await WorkoutTracking.startSession({ title });
  } catch {
    /* optional on web */
  }
}

export async function stopWorkoutForeground() {
  try {
    await WorkoutTracking.stopSession();
  } catch {
    /* optional on web */
  }
}
