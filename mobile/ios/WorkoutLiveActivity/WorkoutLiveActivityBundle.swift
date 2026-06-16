import WidgetKit
import SwiftUI
import ActivityKit

private let accent = Color(red: 0.76, green: 0.96, blue: 0.0)

@available(iOS 16.2, *)
private struct WorkoutElapsedText: View {
    let elapsedSeconds: Int
    let timerReference: Date
    let isPaused: Bool

    var body: some View {
        if isPaused {
            Text(WorkoutLiveActivityFormatting.elapsedText(elapsedSeconds))
                .monospacedDigit()
        } else {
            Text(timerReference, style: .timer)
                .monospacedDigit()
        }
    }
}

@available(iOS 16.2, *)
struct WorkoutLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
            WorkoutLiveActivityView(context: context)
                .activityBackgroundTint(Color(red: 0.08, green: 0.08, blue: 0.08))
                .activitySystemActionForegroundColor(accent)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Время")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        WorkoutElapsedText(
                            elapsedSeconds: context.state.elapsedSeconds,
                            timerReference: context.state.timerReference,
                            isPaused: context.state.isPaused
                        )
                        .font(.title2.bold())
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 4) {
                        Text("Дистанция")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text(WorkoutLiveActivityFormatting.distanceText(context.state.distanceKm))
                            .font(.headline.bold())
                            .monospacedDigit()
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 4) {
                        Text(WorkoutLiveActivityFormatting.speedText(context.state.speedKmh))
                            .font(.subheadline.bold())
                            .monospacedDigit()
                        Text(context.state.isPaused ? "Пауза" : "Активна")
                            .font(.caption.bold())
                            .foregroundStyle(context.state.isPaused ? .orange : accent)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Label("\(context.state.steps) шагов", systemImage: "figure.walk")
                        Spacer()
                        Text(context.attributes.workoutTitle)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .font(.caption)
                }
            } compactLeading: {
                WorkoutElapsedText(
                    elapsedSeconds: context.state.elapsedSeconds,
                    timerReference: context.state.timerReference,
                    isPaused: context.state.isPaused
                )
                .font(.caption2.bold())
                .foregroundStyle(accent)
                .frame(maxWidth: 52)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            } compactTrailing: {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(WorkoutLiveActivityFormatting.distanceText(context.state.distanceKm))
                        .font(.caption2.bold())
                        .monospacedDigit()
                        .foregroundStyle(accent)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(context.state.isPaused ? "Пауза" : "Активна")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(context.state.isPaused ? .orange : accent.opacity(0.9))
                        .lineLimit(1)
                }
            } minimal: {
                Image(systemName: context.state.isPaused ? "pause.circle.fill" : "figure.run")
                    .foregroundStyle(context.state.isPaused ? .orange : accent)
            }
            .keylineTint(accent)
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
                WorkoutElapsedText(
                    elapsedSeconds: context.state.elapsedSeconds,
                    timerReference: context.state.timerReference,
                    isPaused: context.state.isPaused
                )
                .font(.system(.title2, design: .rounded).bold())
                Text(context.state.isPaused ? "Пауза" : "Активна")
                    .font(.caption2.bold())
                    .foregroundStyle(context.state.isPaused ? .orange : accent)
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
