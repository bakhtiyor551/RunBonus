import ActivityKit
import Foundation

public struct WorkoutActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var elapsedSeconds: Int
        public var distanceKm: Double
        public var speedKmh: Double
        public var steps: Int
        public var isPaused: Bool

        public init(
            elapsedSeconds: Int,
            distanceKm: Double,
            speedKmh: Double,
            steps: Int,
            isPaused: Bool
        ) {
            self.elapsedSeconds = elapsedSeconds
            self.distanceKm = distanceKm
            self.speedKmh = speedKmh
            self.steps = steps
            self.isPaused = isPaused
        }
    }

    public var workoutTitle: String

    public init(workoutTitle: String) {
        self.workoutTitle = workoutTitle
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
