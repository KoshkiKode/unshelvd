#!/bin/bash
set -e

# ════════════════════════════════════════════════
# Unshelv'd — Android Build Script
# 
# Usage:
#   ./scripts/build-android.sh                  # Debug APK (for testing)
#   ./scripts/build-android.sh release          # Release AAB (for Play Store)
#   API_URL=https://your.server.com ./scripts/build-android.sh  # With prod API
# ════════════════════════════════════════════════

MODE=${1:-debug}
API_URL=${API_URL:-}
ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)

echo "╔══════════════════════════════════════╗"
echo "║  Unshelv'd — Android Build           ║"
echo "║  Mode: $MODE                          "
echo "╚══════════════════════════════════════╝"
echo ""

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
  echo "  (No API_URL set — using emulator defaults)"
  npm run build
fi

# 3. Sync to Android
echo "→ Syncing to Android project..."
npx cap sync android

# 4. Build APK/AAB
echo "→ Building Android app ($MODE)..."
cd "$ROOT_DIR/android"

if [ "$MODE" = "release" ]; then
  if [ ! -f "app/unshelvd-release.keystore" ]; then
    echo ""
    echo "⚠️  No signing keystore found. Creating one..."
    echo "    (You'll need to remember this password for Play Store uploads)"
    echo ""
    keytool -genkey -v \
      -keystore app/unshelvd-release.keystore \
      -alias unshelvd \
      -keyalg RSA -keysize 2048 -validity 10000 \
      -dname "CN=Unshelv'd, O=Unshelv'd, L=Battle Creek, ST=Michigan, C=US"
    echo ""
  fi
  ./gradlew bundleRelease
  
  echo ""
  echo "════════════════════════════════════════"
  echo "✓ Release AAB built!"
  echo "  → $(find app/build/outputs/bundle -name '*.aab' | head -1)"
  echo ""
  echo "To also build an APK for direct install:"
  echo "  ./gradlew assembleRelease"
  echo "════════════════════════════════════════"
else
  ./gradlew assembleDebug
  
  APK_PATH=$(find app/build/outputs/apk/debug -name '*.apk' | head -1)
  echo ""
  echo "════════════════════════════════════════"
  echo "✓ Debug APK built!"
  echo "  → $APK_PATH"
  echo ""
  echo "Install on connected device:"
  echo "  adb install $APK_PATH"
  echo ""
  echo "Or send the APK file to testers directly."
  echo "════════════════════════════════════════"
fi
