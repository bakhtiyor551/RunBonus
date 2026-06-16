import UIKit
import Capacitor

/// Регистрирует локальные Capacitor-плагины (не из npm — cap sync их не добавляет в packageClassList).
class AppBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(WorkoutTrackingPlugin())
        NSLog("RunBonus: WorkoutTrackingPlugin registered")
    }
}
