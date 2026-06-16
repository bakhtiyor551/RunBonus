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

        call.keepAlive()
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: Date())
        pedometer.queryPedometerData(from: startOfDay, to: Date()) { data, _ in
            DispatchQueue.main.async {
                let steps = data?.numberOfSteps.intValue ?? 0
                call.resolve(["steps": steps])
            }
        }
    }

    @objc func startLiveActivity(_ call: CAPPluginCall) {
        call.keepAlive()
        NSLog("RunBonus: startLiveActivity called from JS")
        let payload = liveActivityPayload(from: call)
        if #available(iOS 16.2, *) {
            runOnMain(call) {
                let supported = WorkoutLiveActivityManager.isSupported
                NSLog("RunBonus LiveActivity start: supported=\(supported) elapsed=\(payload.elapsed) dist=\(payload.distance)")
                let started = WorkoutLiveActivityManager.start(
                    title: payload.title,
                    elapsedSeconds: payload.elapsed,
                    distanceKm: payload.distance,
                    speedKmh: payload.speed,
                    steps: payload.steps,
                    isPaused: payload.paused
                )
                let active = WorkoutLiveActivityManager.hasActiveActivity
                NSLog("RunBonus LiveActivity start result: started=\(started) active=\(active)")
                call.resolve([
                    "ok": started,
                    "enabled": supported,
                    "active": active,
                ])
            }
            return
        }
        call.resolve(["ok": false, "enabled": false, "active": false])
    }

    @objc func updateLiveActivity(_ call: CAPPluginCall) {
        call.keepAlive()
        NSLog("RunBonus: updateLiveActivity called from JS")
        let payload = liveActivityPayload(from: call)
        if #available(iOS 16.2, *) {
            runOnMain(call) {
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
        call.keepAlive()
        if #available(iOS 16.2, *) {
            runOnMain(call) {
                WorkoutLiveActivityManager.end()
                call.resolve(["ok": true, "active": false])
            }
            return
        }
        call.resolve(["ok": true, "active": false])
    }

    @objc func getLiveActivityStatus(_ call: CAPPluginCall) {
        call.keepAlive()
        if #available(iOS 16.2, *) {
            runOnMain(call) {
                call.resolve([
                    "enabled": WorkoutLiveActivityManager.isSupported,
                    "active": WorkoutLiveActivityManager.hasActiveActivity,
                ])
            }
            return
        }
        call.resolve(["enabled": false, "active": false])
    }

    private func runOnMain(_ call: CAPPluginCall, _ work: @escaping () -> Void) {
        if Thread.isMainThread {
            work()
            return
        }
        DispatchQueue.main.async {
            work()
        }
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
            elapsed: callInt(call, key: "elapsedSeconds"),
            distance: callDouble(call, key: "distanceKm"),
            speed: callDouble(call, key: "speedKmh"),
            steps: callInt(call, key: "steps"),
            paused: call.getBool("isPaused") ?? false
        )
    }

    private func callInt(_ call: CAPPluginCall, key: String) -> Int {
        if let value = call.options[key] as? Int { return value }
        if let value = call.options[key] as? Double { return Int(value) }
        if let value = call.options[key] as? NSNumber { return value.intValue }
        return call.getInt(key) ?? 0
    }

    private func callDouble(_ call: CAPPluginCall, key: String) -> Double {
        if let value = call.options[key] as? Double { return value }
        if let value = call.options[key] as? Int { return Double(value) }
        if let value = call.options[key] as? NSNumber { return value.doubleValue }
        return call.getDouble(key) ?? 0
    }
}
