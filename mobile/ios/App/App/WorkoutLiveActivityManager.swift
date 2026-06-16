import ActivityKit
import Foundation
import UIKit

@available(iOS 16.2, *)
enum WorkoutLiveActivityManager {
    private static let defaults = UserDefaults.standard
    private static let snapshotKey = "runbonus_live_activity_snapshot"
    private static var currentActivity: Activity<WorkoutActivityAttributes>?

    static var isSupported: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    static var hasActiveActivity: Bool {
        attachExistingActivityIfNeeded()
        return currentActivity != nil
    }

    static func attachExistingActivityIfNeeded() {
        if currentActivity != nil { return }
        currentActivity = Activity<WorkoutActivityAttributes>.activities.first
    }

    private static var canRequestNewActivity: Bool {
        UIApplication.shared.applicationState == .active
    }

    static func persistSnapshot(
        title: String,
        elapsedSeconds: Int,
        distanceKm: Double,
        speedKmh: Double,
        steps: Int,
        isPaused: Bool
    ) {
        defaults.set(
            [
                "title": title,
                "elapsedSeconds": elapsedSeconds,
                "distanceKm": distanceKm,
                "speedKmh": speedKmh,
                "steps": steps,
                "isPaused": isPaused,
            ],
            forKey: snapshotKey
        )
    }

    static func clearSnapshot() {
        defaults.removeObject(forKey: snapshotKey)
    }

    @discardableResult
    static func start(
        title: String,
        elapsedSeconds: Int,
        distanceKm: Double,
        speedKmh: Double,
        steps: Int,
        isPaused: Bool
    ) -> Bool {
        guard isSupported else {
            NSLog("RunBonus LiveActivity: disabled in system settings")
            return false
        }

        persistSnapshot(
            title: title,
            elapsedSeconds: elapsedSeconds,
            distanceKm: distanceKm,
            speedKmh: speedKmh,
            steps: steps,
            isPaused: isPaused
        )

        attachExistingActivityIfNeeded()
        if let activity = currentActivity {
            update(
                elapsedSeconds: elapsedSeconds,
                distanceKm: distanceKm,
                speedKmh: speedKmh,
                steps: steps,
                isPaused: isPaused,
                on: activity
            )
            return true
        }

        guard canRequestNewActivity else {
            NSLog("RunBonus LiveActivity: cannot start while app is in background")
            return false
        }

        let attributes = WorkoutActivityAttributes(workoutTitle: title)
        let state = makeContentState(
            elapsedSeconds: elapsedSeconds,
            distanceKm: distanceKm,
            speedKmh: speedKmh,
            steps: steps,
            isPaused: isPaused
        )

        do {
            let staleDate = Date().addingTimeInterval(8)
            currentActivity = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: staleDate),
                pushType: nil
            )
            let ok = currentActivity != nil
            if ok {
                NSLog("RunBonus LiveActivity: started elapsed=\(elapsedSeconds) dist=\(distanceKm)")
            }
            return ok
        } catch {
            currentActivity = nil
            NSLog("RunBonus LiveActivity start failed: \(error.localizedDescription)")
            return false
        }
    }

    @discardableResult
    static func update(
        elapsedSeconds: Int,
        distanceKm: Double,
        speedKmh: Double,
        steps: Int,
        isPaused: Bool
    ) -> Bool {
        persistSnapshot(
            title: defaults.dictionary(forKey: snapshotKey)?["title"] as? String ?? "RunBonus — тренировка",
            elapsedSeconds: elapsedSeconds,
            distanceKm: distanceKm,
            speedKmh: speedKmh,
            steps: steps,
            isPaused: isPaused
        )

        attachExistingActivityIfNeeded()
        guard let activity = currentActivity else { return false }
        update(
            elapsedSeconds: elapsedSeconds,
            distanceKm: distanceKm,
            speedKmh: speedKmh,
            steps: steps,
            isPaused: isPaused,
            on: activity
        )
        return true
    }

    @discardableResult
    static func resumeFromSnapshotIfNeeded() -> Bool {
        guard isSupported else { return false }
        attachExistingActivityIfNeeded()

        guard let raw = defaults.dictionary(forKey: snapshotKey) else { return false }
        let elapsed = raw["elapsedSeconds"] as? Int ?? 0
        let distance = raw["distanceKm"] as? Double ?? 0
        let speed = raw["speedKmh"] as? Double ?? 0
        let steps = raw["steps"] as? Int ?? 0
        let paused = raw["isPaused"] as? Bool ?? false

        if currentActivity != nil {
            return update(
                elapsedSeconds: elapsed,
                distanceKm: distance,
                speedKmh: speed,
                steps: steps,
                isPaused: paused
            )
        }

        guard canRequestNewActivity else {
            NSLog("RunBonus LiveActivity: snapshot kept, waiting for foreground to start")
            return false
        }

        return start(
            title: raw["title"] as? String ?? "RunBonus — тренировка",
            elapsedSeconds: elapsed,
            distanceKm: distance,
            speedKmh: speed,
            steps: steps,
            isPaused: paused
        )
    }

    private static func makeContentState(
        elapsedSeconds: Int,
        distanceKm: Double,
        speedKmh: Double,
        steps: Int,
        isPaused: Bool
    ) -> WorkoutActivityAttributes.ContentState {
        WorkoutActivityAttributes.ContentState(
            elapsedSeconds: elapsedSeconds,
            distanceKm: distanceKm,
            speedKmh: speedKmh,
            steps: steps,
            isPaused: isPaused,
            timerReference: Date().addingTimeInterval(-TimeInterval(max(0, elapsedSeconds)))
        )
    }

    private static func update(
        elapsedSeconds: Int,
        distanceKm: Double,
        speedKmh: Double,
        steps: Int,
        isPaused: Bool,
        on activity: Activity<WorkoutActivityAttributes>
    ) {
        let state = makeContentState(
            elapsedSeconds: elapsedSeconds,
            distanceKm: distanceKm,
            speedKmh: speedKmh,
            steps: steps,
            isPaused: isPaused
        )
        let staleDate = Date().addingTimeInterval(8)
        let content = ActivityContent(state: state, staleDate: staleDate)
        Task { @MainActor in
            await activity.update(content)
        }
    }

    static func end() {
        clearSnapshot()
        attachExistingActivityIfNeeded()
        guard let activity = currentActivity else { return }
        currentActivity = nil
        Task { @MainActor in
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
