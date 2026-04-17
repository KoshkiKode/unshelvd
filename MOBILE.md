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

---

## CI/CD Release Pipeline

### Overview

Three GitHub Actions workflows handle the full release lifecycle:

| Workflow | Trigger | What it builds |
|----------|---------|----------------|
| `ci.yml` | Every push / PR | TypeScript check, build, tests |
| `build-android.yml` | Push to `main` or manual | Debug APK (auto) + Release APK/AAB (manual) |
| `build-ios.yml` | Push to `main` or manual | Simulator build (auto) + IPA (manual) |
| **`release.yml`** | **Push a `v*.*.*` tag** | **Signed APK + AAB + IPA → GitHub Release** |

### Cutting a Release

```bash
# Bump version in package.json, then:
git tag v1.2.3
git push origin v1.2.3
```

That tag push triggers `release.yml`, which:
1. Builds a **signed Android APK** (for Firebase App Distribution / direct install)
2. Builds a **signed Android AAB** (for Play Store upload)
3. Builds a **signed iOS IPA** (for Firebase App Distribution / TestFlight)
4. Creates a **GitHub Release** at `Releases → v1.2.3` with all three files attached

### Setting Up Required Secrets

Go to **GitHub → Settings → Secrets and variables → Actions**.

#### Android secrets

| Secret | Value |
|--------|-------|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 unshelvd-release.keystore` |
| `KEYSTORE_PASSWORD` | The store password you used with `keytool` |
| `KEY_PASSWORD` | The key password (often the same) |
| `KEY_ALIAS` | The alias you used (`unshelvd`) |

Generate the keystore once:
```bash
keytool -genkey -v \
  -keystore unshelvd-release.keystore \
  -alias unshelvd \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Unshelvd, O=KoshkiKode, L=Battle Creek, ST=Michigan, C=US"

# Encode for GitHub secret
base64 -w0 unshelvd-release.keystore | pbcopy   # macOS
base64 -w0 unshelvd-release.keystore | xclip     # Linux
```

⚠️ Keep the `.keystore` file somewhere safe (iCloud, 1Password, etc.).  
You need the **same** keystore for every future release — losing it means you can't update the app.

#### iOS secrets

| Secret | Value |
|--------|-------|
| `IOS_CERTIFICATE_BASE64` | base64-encoded Distribution certificate (.p12) |
| `IOS_CERTIFICATE_PASSWORD` | Password protecting the .p12 file |
| `IOS_PROVISIONING_PROFILE_BASE64` | base64-encoded Ad-Hoc provisioning profile |

To create an Ad-Hoc provisioning profile:
1. Go to **Apple Developer Portal → Certificates, IDs & Profiles → Devices** and register tester device UDIDs
2. Go to **Provisioning Profiles → +** → **Ad Hoc** → select your Distribution certificate + registered devices → download
3. `base64 -i YourProfile.mobileprovision | pbcopy`

To export your Distribution certificate:
1. **Keychain Access → My Certificates** → right-click the certificate → **Export**
2. Save as `.p12` with a strong password
3. `base64 -i distribution.p12 | pbcopy`

#### Required variable

| Variable | Example |
|----------|---------|
| `API_URL` | `https://unshelvd.koshkikode.com` |

### Distributing to Testers (Before the App Store)

**Android** — Firebase App Distribution (recommended):
1. Go to [Firebase Console](https://console.firebase.google.com) → App Distribution
2. Upload the `unshelvd-v1.2.3.apk` from the GitHub Release
3. Add tester emails → Firebase sends install links

**Android** — Diawi / direct:
1. Download the `.apk` from the GitHub Release
2. Upload to [diawi.com](https://www.diawi.com) (generates a QR code install link)
3. Or send the APK directly; testers enable **Install from unknown sources**

**iOS** — Firebase App Distribution (recommended for pre-App Store):
1. Go to Firebase Console → App Distribution
2. Upload the `unshelvd-v1.2.3.ipa`
3. Add tester emails → they get guided install instructions

**iOS** — TestFlight:
1. Use `build-ios.yml` (manual dispatch) which exports via `ExportOptions.plist` (App Store method)
2. That job uploads directly to App Store Connect → distribute to internal testers via TestFlight

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
