import ActivityKit
import Foundation

struct WorkoutActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var elapsedSeconds: Int
        var distanceKm: Double
        var speedKmh: Double
        var steps: Int
        var isPaused: Bool
    }

    var workoutTitle: String
}

@available(iOS 16.2, *)
enum WorkoutLiveActivityManager {
    private static var currentActivity: Activity<WorkoutActivityAttributes>?

    static var isSupported: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    static func start(
        title: String,
        elapsedSeconds: Int,
        distanceKm: Double,
        speedKmh: Double,
        steps: Int,
        isPaused: Bool
    ) {
        guard isSupported else { return }

        endSync()

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
        } catch {
            currentActivity = nil
        }
    }

    static func update(
        elapsedSeconds: Int,
        distanceKm: Double,
        speedKmh: Double,
        steps: Int,
        isPaused: Bool
    ) {
        guard let activity = currentActivity else { return }
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
        guard let activity = currentActivity else { return }
        let activityToEnd = activity
        currentActivity = nil
        Task {
            await activityToEnd.end(nil, dismissalPolicy: .immediate)
        }
    }

    private static func endSync() {
        guard let activity = currentActivity else { return }
        currentActivity = nil
        Task {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}

private func formatWorkoutClock(_ totalSeconds: Int) -> String {
    let seconds = max(0, totalSeconds)
    let h = seconds / 3600
    let m = (seconds % 3600) / 60
    let s = seconds % 60
    if h > 0 {
        return String(format: "%02d:%02d:%02d", h, m, s)
    }
    return String(format: "%02d:%02d", m, s)
}

@available(iOS 16.2, *)
enum WorkoutLiveActivityFormatting {
    static func distanceText(_ km: Double) -> String {
        String(format: "%.2f км", max(0, km))
    }

    static func speedText(_ kmh: Double) -> String {
        String(format: "%.1f км/ч", max(0, kmh))
    }

    static func elapsedText(_ seconds: Int) -> String {
        formatWorkoutClock(seconds)
    }
}
