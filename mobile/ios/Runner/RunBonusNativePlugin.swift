import CoreMotion
import Flutter
import UIKit

/// Канал `runbonus/workout`: шаги (CMPedometer) и Live Activity; плюс нативная карта `runbonus/apple_map`.
final class RunBonusNativePlugin: NSObject, FlutterPlugin {
    private let pedometer = CMPedometer()
    private var sessionSteps = 0

    static func register(with registrar: FlutterPluginRegistrar) {
        let instance = RunBonusNativePlugin()
        let channel = FlutterMethodChannel(name: "runbonus/workout", binaryMessenger: registrar.messenger())
        registrar.addMethodCallDelegate(instance, channel: channel)
        registrar.register(AppleMapViewFactory(messenger: registrar.messenger()), withId: "runbonus/apple_map")
    }

    func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        let args = call.arguments as? [String: Any] ?? [:]
        switch call.method {
        case "startSession":
            startSession()
            result(["ok": true])
        case "stopSession":
            pedometer.stopUpdates()
            sessionSteps = 0
            result(["ok": true])
        case "getSteps":
            result(["steps": sessionSteps])
        case "getDailySteps":
            guard CMPedometer.isStepCountingAvailable() else { return result(["steps": 0]) }
            let startOfDay = Calendar.current.startOfDay(for: Date())
            pedometer.queryPedometerData(from: startOfDay, to: Date()) { data, _ in
                DispatchQueue.main.async { result(["steps": data?.numberOfSteps.intValue ?? 0]) }
            }
        case "updateLiveActivity":
            result(updateLiveActivity(args))
        case "endLiveActivity":
            if #available(iOS 16.2, *) { WorkoutLiveActivityManager.end() }
            result(["ok": true, "active": false])
        case "getLiveActivityStatus":
            if #available(iOS 16.2, *) {
                result(["enabled": WorkoutLiveActivityManager.isSupported, "active": WorkoutLiveActivityManager.hasActiveActivity])
            } else {
                result(["enabled": false, "active": false])
            }
        case "minimizeApp":
            result(nil)
        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private func startSession() {
        guard CMPedometer.isStepCountingAvailable() else { return }
        sessionSteps = 0
        pedometer.startUpdates(from: Date()) { [weak self] data, _ in
            guard let data else { return }
            DispatchQueue.main.async { self?.sessionSteps = data.numberOfSteps.intValue }
        }
    }

    private func updateLiveActivity(_ args: [String: Any]) -> [String: Any] {
        guard #available(iOS 16.2, *) else { return ["ok": false, "active": false] }
        let title = args["title"] as? String ?? "RunBonus — тренировка"
        let elapsed = (args["elapsedSeconds"] as? NSNumber)?.intValue ?? 0
        let distance = (args["distanceKm"] as? NSNumber)?.doubleValue ?? 0
        let speed = (args["speedKmh"] as? NSNumber)?.doubleValue ?? 0
        let steps = (args["steps"] as? NSNumber)?.intValue ?? 0
        let paused = args["isPaused"] as? Bool ?? false

        var ok = WorkoutLiveActivityManager.update(
            elapsedSeconds: elapsed, distanceKm: distance, speedKmh: speed, steps: steps, isPaused: paused
        )
        if !ok {
            ok = WorkoutLiveActivityManager.start(
                title: title, elapsedSeconds: elapsed, distanceKm: distance, speedKmh: speed, steps: steps, isPaused: paused
            )
        }
        return ["ok": ok, "active": WorkoutLiveActivityManager.hasActiveActivity]
    }
}
