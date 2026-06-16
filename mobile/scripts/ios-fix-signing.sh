#!/bin/bash
# Переустановка CocoaPods после смены linkage (static) — исправляет Pods_App.framework signature error
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IOS_APP="$ROOT/ios/App"

echo "==> Capacitor sync"
cd "$ROOT"
npm run build
npx cap sync ios

echo "==> CocoaPods reinstall"
cd "$IOS_APP"
pod deintegrate 2>/dev/null || true
rm -rf Pods Podfile.lock
pod install --repo-update

echo ""
echo "Done. Next in Xcode:"
echo "  1. Open ios/App/App.xcworkspace"
echo "  2. Scheme: App (NOT WorkoutLiveActivityExtension)"
echo "  3. Targets App + WorkoutLiveActivityExtension -> Signing: your Team"
echo "  3. Product -> Clean Build Folder"
echo "  4. Run on iPhone via USB (not wireless first time)"
