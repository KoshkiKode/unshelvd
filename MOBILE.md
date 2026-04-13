# Unshelv'd — Mobile App Build Guide

## Prerequisites

- **Android Studio** (latest) with Android SDK 34+
- **Java 17+** (bundled with Android Studio)
- **Node.js 20+**
- For iOS: Xcode 15+ on macOS, CocoaPods (`sudo gem install cocoapods`)

## Quick Start — Debug APK

```bash
# Clone and install
git clone https://github.com/KoshkiKode/unshelvd.git
cd unshelvd
npm install

# Build the web app
npm run build

# Sync to native projects
npx cap sync

# Open in Android Studio
npx cap open android
```

In Android Studio:
1. Wait for Gradle sync to finish
2. Select your device/emulator
3. Click the green **Run** button (▶)
4. The app installs and launches

## Building a Debug APK (no Android Studio)

```bash
cd android
./gradlew assembleDebug
```

The APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

Send this to testers — they can install it directly.

## Building a Release APK/AAB

```bash
# Set your production API URL and build
VITE_API_URL=https://unshelvd.koshkikode.com npm run build
npx cap sync android

cd android

# Debug APK (for testing, no signing needed)
./gradlew assembleDebug

# Release AAB (for Play Store, needs signing)
./gradlew bundleRelease
```

## Signing for Release

Create a keystore (one time):
```bash
keytool -genkey -v -keystore unshelvd-release.keystore \
  -alias unshelvd -keyalg RSA -keysize 2048 -validity 10000
```

Add to `android/app/build.gradle`:
```groovy
android {
    signingConfigs {
        release {
            storeFile file('unshelvd-release.keystore')
            storePassword 'YOUR_STORE_PASSWORD'
            keyAlias 'unshelvd'
            keyPassword 'YOUR_KEY_PASSWORD'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

## How API Calls Work

The app automatically routes API calls to the right server:

| Environment | API Target |
|-------------|-----------|
| Local dev (browser) | `localhost:5000` (same origin) |
| Android Emulator | `10.0.2.2:5000` (host machine) |
| iOS Simulator | `localhost:5000` |
| Production (native) | `VITE_API_URL` env var (`https://unshelvd.koshkikode.com`) |
| Deployed web | Proxy path (set at deploy time) |

Set `VITE_API_URL` when building for production:
```bash
VITE_API_URL=https://unshelvd.koshkikode.com npm run build
npx cap sync
```

## Live Reload (Development)

For faster iteration, edit `capacitor.config.ts` and uncomment:
```typescript
server: {
  url: "http://10.0.2.2:5000",  // Android emulator
  // url: "http://YOUR_IP:5000", // Physical device
}
```

Then `npx cap sync` and run from Android Studio. Changes hot-reload.

## Project Structure

```
android/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml      # Permissions, network config
│   │   ├── assets/public/           # Built web app (auto-synced)
│   │   ├── java/.../MainActivity.java
│   │   └── res/
│   │       ├── xml/network_security_config.xml  # HTTP allowed for dev
│   │       ├── values/strings.xml
│   │       └── drawable*/splash.png
│   └── build.gradle                 # App-level build config
├── build.gradle                     # Project-level build config
└── capacitor-cordova-android-plugins/  # Auto-managed by Capacitor
```

## Installed Plugins

| Plugin | Purpose |
|--------|---------|
| `@capacitor/splash-screen` | App launch screen |
| `@capacitor/status-bar` | Status bar styling |
| `@capacitor/keyboard` | Keyboard handling on mobile |
| `@capacitor/haptics` | Haptic feedback |
| `@capacitor/app` | App lifecycle events |
| `@capacitor/browser` | In-app browser for external links |

## iOS

Same workflow, replace `android` with `ios`:
```bash
npx cap sync ios
npx cap open ios
```

Build from Xcode. Requires macOS.
