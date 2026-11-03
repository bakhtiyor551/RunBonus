import Flutter
import UIKit

class SceneDelegate: FlutterSceneDelegate {
  override func sceneDidBecomeActive(_ scene: UIScene) {
    super.sceneDidBecomeActive(scene)
    if #available(iOS 16.2, *) {
      // Live Activity нельзя запросить из фона — досоздаём по сохранённому снимку при возврате.
      WorkoutLiveActivityManager.resumeFromSnapshotIfNeeded()
    }
  }
}
