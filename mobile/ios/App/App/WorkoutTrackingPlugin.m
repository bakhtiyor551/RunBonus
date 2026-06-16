#import <Capacitor/Capacitor.h>

CAP_PLUGIN(WorkoutTrackingPlugin, "WorkoutTracking",
  CAP_PLUGIN_METHOD(startSession, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(stopSession, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getSteps, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getDailySteps, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(startLiveActivity, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(updateLiveActivity, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(endLiveActivity, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getLiveActivityStatus, CAPPluginReturnPromise);
)
