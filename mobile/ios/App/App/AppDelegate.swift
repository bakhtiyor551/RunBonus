import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let bg = UIColor(red: 19.0 / 255.0, green: 19.0 / 255.0, blue: 19.0 / 255.0, alpha: 1.0)
        window?.backgroundColor = bg
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        if #available(iOS 16.2, *) {
            let resumed = WorkoutLiveActivityManager.resumeFromSnapshotIfNeeded()
            NSLog("RunBonus LiveActivity willResignActive resumed=\(resumed) active=\(WorkoutLiveActivityManager.hasActiveActivity)")
        }
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        if #available(iOS 16.2, *) {
            let resumed = WorkoutLiveActivityManager.resumeFromSnapshotIfNeeded()
            NSLog("RunBonus LiveActivity didEnterBackground resumed=\(resumed) active=\(WorkoutLiveActivityManager.hasActiveActivity)")
        }
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
