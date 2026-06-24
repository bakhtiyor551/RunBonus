import { createContext, useContext } from 'react';
import { useWorkoutLiveSocket } from '../hooks/useWorkoutLiveSocket';

const LiveTrackingContext = createContext(null);

export function LiveTrackingProvider({ enabled, children }) {
  const socket = useWorkoutLiveSocket(enabled);
  return (
    <LiveTrackingContext.Provider value={socket}>{children}</LiveTrackingContext.Provider>
  );
}

export function useLiveTracking() {
  const ctx = useContext(LiveTrackingContext);
  if (!ctx) {
    throw new Error('useLiveTracking must be used within LiveTrackingProvider');
  }
  return ctx;
}
