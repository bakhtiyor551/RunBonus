import ActivityKit
import Foundation

@available(iOS 16.2, *)
enum WorkoutLiveActivityManager {
    private static var currentActivity: Activity<WorkoutActivityAttributes>?

    static var isSupported: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    static var hasActiveActivity: Bool {
        currentActivity != nil || !Activity<WorkoutActivityAttributes>.activities.isEmpty
    }

    static func attachExistingActivityIfNeeded() {
        if currentActivity != nil { return }
        currentActivity = Activity<WorkoutActivityAttributes>.activities.first
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
        guard isSupported else { return false }

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
            return currentActivity != nil
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
        attachExistingActivityIfNeeded()
        guard let activity = currentActivity else { return }
        currentActivity = nil
        Task {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
