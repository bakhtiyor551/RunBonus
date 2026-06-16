import Foundation
import Capacitor
import CoreMotion

@objc(WorkoutTrackingPlugin)
public class WorkoutTrackingPlugin: CAPPlugin {
    private let pedometer = CMPedometer()
    private var sessionSteps = 0

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
            DispatchQueue.main.async {
                WorkoutLiveActivityManager.end()
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
        let payload = liveActivityPayload(from: call)
        if #available(iOS 16.2, *) {
            DispatchQueue.main.async {
                let supported = WorkoutLiveActivityManager.isSupported
                let started = WorkoutLiveActivityManager.start(
                    title: payload.title,
                    elapsedSeconds: payload.elapsed,
                    distanceKm: payload.distance,
                    speedKmh: payload.speed,
                    steps: payload.steps,
                    isPaused: payload.paused
                )
                call.resolve([
                    "ok": started,
                    "enabled": supported,
                    "active": WorkoutLiveActivityManager.hasActiveActivity,
                ])
            }
            return
        }
        call.resolve(["ok": false, "enabled": false, "active": false])
    }

    @objc func updateLiveActivity(_ call: CAPPluginCall) {
        let payload = liveActivityPayload(from: call)
        if #available(iOS 16.2, *) {
            DispatchQueue.main.async {
                var updated = WorkoutLiveActivityManager.update(
                    elapsedSeconds: payload.elapsed,
                    distanceKm: payload.distance,
                    speedKmh: payload.speed,
                    steps: payload.steps,
                    isPaused: payload.paused
                )
                if !updated {
                    updated = WorkoutLiveActivityManager.start(
                        title: payload.title,
                        elapsedSeconds: payload.elapsed,
                        distanceKm: payload.distance,
                        speedKmh: payload.speed,
                        steps: payload.steps,
                        isPaused: payload.paused
                    )
                }
                call.resolve([
                    "ok": updated,
                    "active": WorkoutLiveActivityManager.hasActiveActivity,
                ])
            }
            return
        }
        call.resolve(["ok": false, "active": false])
    }

    @objc func endLiveActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            DispatchQueue.main.async {
                WorkoutLiveActivityManager.end()
                call.resolve(["ok": true])
            }
            return
        }
        call.resolve(["ok": true])
    }

    private func liveActivityPayload(from call: CAPPluginCall) -> (
        title: String,
        elapsed: Int,
        distance: Double,
        speed: Double,
        steps: Int,
        paused: Bool
    ) {
        (
            title: call.getString("title") ?? "RunBonus — тренировка",
            elapsed: call.getInt("elapsedSeconds") ?? 0,
            distance: call.getDouble("distanceKm") ?? 0,
            speed: call.getDouble("speedKmh") ?? 0,
            steps: call.getInt("steps") ?? 0,
            paused: call.getBool("isPaused") ?? false
        )
    }
}
