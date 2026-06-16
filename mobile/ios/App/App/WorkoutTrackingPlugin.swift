import Foundation
import Capacitor
import CoreMotion

@objc(WorkoutTrackingPlugin)
public class WorkoutTrackingPlugin: CAPPlugin {
    private let pedometer = CMPedometer()
    private var sessionSteps = 0
    private var liveActivityActive = false

    @objc func startSession(_ call: CAPPluginCall) {
        guard CMPedometer.isStepCountingAvailable() else {
            call.resolve(["ok": true])
            return
        }

        sessionSteps = 0
        let from = Date()
        pedometer.startUpdates(from: from) { [weak self] data, _ in
            guard let self = self, let data = data else { return }
            let steps = data.numberOfSteps.intValue
            DispatchQueue.main.async {
                self.sessionSteps = steps
            }
        }

        call.resolve(["ok": true])
    }

    @objc func stopSession(_ call: CAPPluginCall) {
        pedometer.stopUpdates()
        sessionSteps = 0
        if #available(iOS 16.2, *) {
            if liveActivityActive {
                WorkoutLiveActivityManager.end()
                liveActivityActive = false
            }
        }
        call.resolve(["ok": true])
    }

    @objc func getSteps(_ call: CAPPluginCall) {
        call.resolve(["steps": sessionSteps])
    }

    @objc func getDailySteps(_ call: CAPPluginCall) {
        guard CMPedometer.isStepCountingAvailable() else {
            call.resolve(["steps": 0])
            return
        }

        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: Date())
        pedometer.queryPedometerData(from: startOfDay, to: Date()) { data, _ in
            let steps = data?.numberOfSteps.intValue ?? 0
            call.resolve(["steps": steps])
        }
    }

    @objc func startLiveActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            let title = call.getString("title") ?? "RunBonus — тренировка"
            let elapsed = call.getInt("elapsedSeconds") ?? 0
            let distance = call.getDouble("distanceKm") ?? 0
            let speed = call.getDouble("speedKmh") ?? 0
            let steps = call.getInt("steps") ?? 0
            let paused = call.getBool("isPaused") ?? false

            WorkoutLiveActivityManager.start(
                title: title,
                elapsedSeconds: elapsed,
                distanceKm: distance,
                speedKmh: speed,
                steps: steps,
                isPaused: paused
            )
            liveActivityActive = WorkoutLiveActivityManager.isSupported
            call.resolve(["ok": true, "enabled": liveActivityActive])
            return
        }
        call.resolve(["ok": false, "enabled": false])
    }

    @objc func updateLiveActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            guard liveActivityActive else {
                call.resolve(["ok": false])
                return
            }
            WorkoutLiveActivityManager.update(
                elapsedSeconds: call.getInt("elapsedSeconds") ?? 0,
                distanceKm: call.getDouble("distanceKm") ?? 0,
                speedKmh: call.getDouble("speedKmh") ?? 0,
                steps: call.getInt("steps") ?? 0,
                isPaused: call.getBool("isPaused") ?? false
            )
            call.resolve(["ok": true])
            return
        }
        call.resolve(["ok": false])
    }

    @objc func endLiveActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            WorkoutLiveActivityManager.end()
            liveActivityActive = false
        }
        call.resolve(["ok": true])
    }
}
