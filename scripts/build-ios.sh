#!/bin/bash
set -e

# ════════════════════════════════════════════════
# Unshelv'd — iOS Build Script
# 
# Prerequisites:
#   - macOS with Xcode 15+ installed
#   - CocoaPods: sudo gem install cocoapods
#   - Apple Developer account (for device builds)
#
# Usage:
#   ./scripts/build-ios.sh              # Build and open in Xcode
#   ./scripts/build-ios.sh archive      # Build archive for App Store
#   API_URL=https://your.server.com ./scripts/build-ios.sh  # With prod API
# ════════════════════════════════════════════════

MODE=${1:-open}
API_URL=${API_URL:-}
ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)

echo "╔══════════════════════════════════════╗"
echo "║  Unshelv'd — iOS Build               ║"
echo "║  Mode: $MODE                          "
echo "╚══════════════════════════════════════╝"
echo ""

# Check for macOS
if [[ "$(uname)" != "Darwin" ]]; then
  echo "❌ iOS builds require macOS with Xcode."
  echo "   Run this script on a Mac."
  exit 1
fi

# Check for Xcode
if ! command -v xcodebuild &> /dev/null; then
  echo "❌ Xcode not found. Install from the App Store."
  exit 1
fi

# 1. Install dependencies
echo "→ Installing dependencies..."
cd "$ROOT_DIR"
npm install --silent

# 2. Build web app
echo "→ Building web app..."
if [ -n "$API_URL" ]; then
  echo "  (API URL: $API_URL)"
  VITE_API_URL="$API_URL" npm run build
else
  npm run build
fi

# 3. Sync to iOS
echo "→ Syncing to iOS project..."
npx cap sync ios

# 4. Install CocoaPods
echo "→ Installing CocoaPods dependencies..."
cd "$ROOT_DIR/ios/App"
pod install 2>/dev/null || {
  echo "  Installing CocoaPods first..."
  sudo gem install cocoapods
  pod install
}

if [ "$MODE" = "archive" ]; then
  # Build archive for App Store
  echo "→ Building archive..."
  xcodebuild -workspace App.xcworkspace \
    -scheme App \
    -configuration Release \
    -archivePath "$ROOT_DIR/build/Unshelvd.xcarchive" \
    archive
  
  echo ""
  echo "════════════════════════════════════════"
  echo "✓ Archive built!"
  echo "  → $ROOT_DIR/build/Unshelvd.xcarchive"
  echo ""
  echo "To export for App Store:"
  echo "  Open Xcode → Window → Organizer → Distribute"
  echo ""
  echo "Or from command line:"
  echo "  xcodebuild -exportArchive \\"
  echo "    -archivePath build/Unshelvd.xcarchive \\"
  echo "    -exportPath build/export \\"
  echo "    -exportOptionsPlist scripts/ExportOptions.plist"
  echo "════════════════════════════════════════"
else
  # Open in Xcode
  echo ""
  echo "→ Opening in Xcode..."
  open App.xcworkspace
  
  echo ""
  echo "════════════════════════════════════════"
  echo "✓ Xcode opened with Unshelv'd project!"
  echo ""
  echo "Next steps:"
  echo "  1. Select your team in Signing & Capabilities"
  echo "  2. Select a device or simulator"
  echo "  3. Click Run (⌘R) to build and install"
  echo ""
  echo "For TestFlight distribution:"
  echo "  Product → Archive → Distribute App"
  echo "════════════════════════════════════════"
fi
