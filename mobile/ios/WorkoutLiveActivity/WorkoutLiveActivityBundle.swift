import WidgetKit
import SwiftUI
import ActivityKit

@available(iOS 16.2, *)
struct WorkoutLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
            WorkoutLiveActivityView(context: context)
                .activityBackgroundTint(Color(red: 0.08, green: 0.08, blue: 0.08))
                .activitySystemActionForegroundColor(Color(red: 0.76, green: 0.96, blue: 0.0))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(context.attributes.workoutTitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(WorkoutLiveActivityFormatting.elapsedText(context.state.elapsedSeconds))
                            .font(.title3.bold())
                            .monospacedDigit()
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 4) {
                        Text(WorkoutLiveActivityFormatting.distanceText(context.state.distanceKm))
                            .font(.headline)
                            .monospacedDigit()
                        Text(WorkoutLiveActivityFormatting.speedText(context.state.speedKmh))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Label("\(context.state.steps)", systemImage: "figure.walk")
                        Spacer()
                        Text(context.state.isPaused ? "Пауза" : "Активна")
                            .font(.caption.bold())
                            .foregroundStyle(context.state.isPaused ? .orange : Color(red: 0.76, green: 0.96, blue: 0.0))
                    }
                    .font(.caption)
                }
            } compactLeading: {
                Image(systemName: context.state.isPaused ? "pause.circle.fill" : "figure.run")
                    .foregroundStyle(Color(red: 0.76, green: 0.96, blue: 0.0))
            } compactTrailing: {
                Text(WorkoutLiveActivityFormatting.elapsedText(context.state.elapsedSeconds))
                    .font(.caption2.bold())
                    .monospacedDigit()
            } minimal: {
                Image(systemName: "figure.run")
                    .foregroundStyle(Color(red: 0.76, green: 0.96, blue: 0.0))
            }
        }
    }
}

@available(iOS 16.2, *)
private struct WorkoutLiveActivityView: View {
    let context: ActivityViewContext<WorkoutActivityAttributes>

    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(context.attributes.workoutTitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(WorkoutLiveActivityFormatting.elapsedText(context.state.elapsedSeconds))
                    .font(.system(.title2, design: .rounded).bold())
                    .monospacedDigit()
                Text(context.state.isPaused ? "Пауза" : "Тренировка активна")
                    .font(.caption2.bold())
                    .foregroundStyle(context.state.isPaused ? .orange : Color(red: 0.76, green: 0.96, blue: 0.0))
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 6) {
                Text(WorkoutLiveActivityFormatting.distanceText(context.state.distanceKm))
                    .font(.headline.monospacedDigit())
                Text(WorkoutLiveActivityFormatting.speedText(context.state.speedKmh))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("\(context.state.steps) шагов")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

@available(iOS 16.2, *)
@main
struct WorkoutLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        WorkoutLiveActivityWidget()
    }
}
