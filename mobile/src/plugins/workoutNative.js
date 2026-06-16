import { registerPlugin } from '@capacitor/core';

const WorkoutTracking = registerPlugin('WorkoutTracking', {
  web: () => import('./workoutNative.web.js').then((m) => new m.WorkoutTrackingWeb()),
});

export default WorkoutTracking;
