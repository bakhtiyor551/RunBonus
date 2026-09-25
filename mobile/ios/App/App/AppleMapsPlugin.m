#import <Capacitor/Capacitor.h>

CAP_PLUGIN(AppleMapsPlugin, "AppleMaps",
  CAP_PLUGIN_METHOD(create, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(setFrame, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(setRoute, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(setFollowUser, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(setVisible, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(destroy, CAPPluginReturnPromise);
)
