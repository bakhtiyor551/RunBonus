import UIKit
import Capacitor

class AppBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(WorkoutTrackingPlugin())
        bridge?.registerPluginInstance(AppleMapsPlugin())
        NSLog("RunBonus: plugins registered")
    }
}
