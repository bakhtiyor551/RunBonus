import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        if window == nil {
            let window = UIWindow(windowScene: windowScene)
            window.rootViewController = AppBridgeViewController()
            window.backgroundColor = UIColor(red: 19.0 / 255.0, green: 19.0 / 255.0, blue: 19.0 / 255.0, alpha: 1.0)
            self.window = window
            window.makeKeyAndVisible()
        } else {
            window?.backgroundColor = UIColor(red: 19.0 / 255.0, green: 19.0 / 255.0, blue: 19.0 / 255.0, alpha: 1.0)
        }

        if let urlContext = connectionOptions.urlContexts.first {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                open: urlContext.url,
                options: [:]
            )
        }

        if let userActivity = connectionOptions.userActivities.first {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                continue: userActivity,
                restorationHandler: { _ in }
            )
        }
    }

    func sceneDidDisconnect(_ scene: UIScene) {}

    func sceneDidBecomeActive(_ scene: UIScene) {
        if #available(iOS 16.2, *) {
            let resumed = WorkoutLiveActivityManager.resumeFromSnapshotIfNeeded()
            NSLog("RunBonus LiveActivity sceneDidBecomeActive resumed=\(resumed) active=\(WorkoutLiveActivityManager.hasActiveActivity)")
        }
    }

    func sceneWillResignActive(_ scene: UIScene) {}

    func sceneWillEnterForeground(_ scene: UIScene) {
        if #available(iOS 16.2, *) {
            _ = WorkoutLiveActivityManager.resumeFromSnapshotIfNeeded()
        }
    }

    func sceneDidEnterBackground(_ scene: UIScene) {}

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }
}
