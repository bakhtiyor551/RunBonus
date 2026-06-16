import ActivityKit
import Foundation

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

        let attributes = WorkoutActivityAttributes(workoutTitle: title)
        let state = WorkoutActivityAttributes.ContentState(
            elapsedSeconds: elapsedSeconds,
            distanceKm: distanceKm,
            speedKmh: speedKmh,
            steps: steps,
            isPaused: isPaused
        )

        do {
            currentActivity = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: nil),
                pushType: nil
            )
            let ok = currentActivity != nil
            if ok {
                NSLog("RunBonus LiveActivity: started")
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
        if currentActivity != nil { return true }

        guard let raw = defaults.dictionary(forKey: snapshotKey) else { return false }
        return start(
            title: raw["title"] as? String ?? "RunBonus — тренировка",
            elapsedSeconds: raw["elapsedSeconds"] as? Int ?? 0,
            distanceKm: raw["distanceKm"] as? Double ?? 0,
            speedKmh: raw["speedKmh"] as? Double ?? 0,
            steps: raw["steps"] as? Int ?? 0,
            isPaused: raw["isPaused"] as? Bool ?? false
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
        let state = WorkoutActivityAttributes.ContentState(
            elapsedSeconds: elapsedSeconds,
            distanceKm: distanceKm,
            speedKmh: speedKmh,
            steps: steps,
            isPaused: isPaused
        )
        Task {
            await activity.update(ActivityContent(state: state, staleDate: nil))
        }
    }

    static func end() {
        clearSnapshot()
        attachExistingActivityIfNeeded()
        guard let activity = currentActivity else { return }
        currentActivity = nil
        Task {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
