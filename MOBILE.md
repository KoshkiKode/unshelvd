# Unshelv'd — Mobile App Build Guide

## App identity (don't change after first store submission)

| Field | Value |
|---|---|
| Bundle / application ID | `com.koshkikode.unshelvd` |
| Display name | `Unshelv'd` |
| Production API | `https://unshelvd.koshkikode.com` |

> ⚠️ The bundle ID is **immutable** once the app is published to either store.
> Both stores treat the bundle ID as the primary key for the listing — changing
> it after launch means starting a brand-new listing and losing reviews,
> ratings, and existing installs.

## Versioning policy

`package.json#version` is the single source of truth. The `prebuild` step runs
`scripts/sync-version.ts`, which writes:

- Android `versionName` ← exact `package.json` version (allows prerelease tags
  like `0.1.0-beta` for Play Console internal-track builds)
- Android `versionCode` ← `major*10000 + minor*100 + patch` (integer, monotonic)
- iOS `MARKETING_VERSION` ← `major.minor.patch` only — **prerelease tags are
  stripped** because Apple rejects non-numeric `CFBundleShortVersionString` at
  upload time. Use `CURRENT_PROJECT_VERSION` (build number) to differentiate
  beta builds within the same marketing version.

To cut a new version: bump `package.json#version`, commit, then build.

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
1. Builds a **signed Android APK** (for direct install / Diawi)
2. Builds a **signed Android AAB** (for Play Store upload)
3. Builds a **signed iOS IPA** (for TestFlight / Diawi)
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

**Android** — Diawi / direct (recommended):
1. Download the `.apk` from the GitHub Release
2. Upload to [diawi.com](https://www.diawi.com) (generates a QR code install link)
3. Or send the APK directly; testers enable **Install from unknown sources**

**iOS** — TestFlight (recommended for pre-App Store):
1. Use `build-ios.yml` (manual dispatch) which exports via `ExportOptions.plist` (App Store method)
2. That job uploads directly to App Store Connect → distribute to internal testers via TestFlight

**iOS** — Diawi / Ad-Hoc direct:
1. Download the `.ipa` from the GitHub Release (built with the Ad-Hoc `ExportOptions-adhoc.plist`)
2. Upload to [diawi.com](https://www.diawi.com) → share the install link with testers whose UDIDs are registered in your provisioning profile

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

> 📅 **Deferred until the Apple Developer account is active.** Once you have
> the account, the iOS-specific work is:
>
> 1. Create an App ID in the Apple Developer portal with bundle ID
>    `com.koshkikode.unshelvd` (must match `ios/App/App.xcodeproj/project.pbxproj`).
> 2. Generate a Distribution certificate and an App Store provisioning profile
>    (and an Ad-Hoc profile if you want Diawi-style direct installs).
> 3. Populate the `IOS_CERTIFICATE_BASE64`, `IOS_CERTIFICATE_PASSWORD`, and
>    `IOS_PROVISIONING_PROFILE_BASE64` GitHub secrets listed above.
> 4. Create the App Store Connect listing (same bundle ID), fill in metadata,
>    upload screenshots, and submit a TestFlight build via `release.yml` or
>    the manual `build-ios.yml` dispatch.
> 5. Re-run `release.yml` for the next tag — the iOS IPA will now be produced
>    and attached to the GitHub Release alongside the Android artifacts.

---

## Google Play — first-submission checklist

Generic checklist for the first time the app is uploaded to a Play Console
account. Most of these are one-time setup tasks.

- [ ] Create the app in Play Console with package name `com.koshkikode.unshelvd`
      (this becomes immutable on first upload).
- [ ] Opt **in** to Play App Signing — upload your generated keystore as the
      *upload key*; Google manages the actual signing key. (The `release.yml`
      workflow already produces an upload-key-signed AAB.)
- [ ] Set the default language and store listing copy.
- [ ] Upload the icon (512×512 PNG), feature graphic (1024×500 PNG), and at
      least 2 phone screenshots per language you list.
- [ ] Fill in the **Privacy policy URL**: `https://unshelvd.koshkikode.com/#/privacy`.
- [ ] Complete the **Data safety** form. Unshelv'd collects: account info
      (email, name), user-generated content (listings, messages), payment info
      (handled by Stripe/PayPal — not stored on our servers), and approximate
      location only if the user opts in. Mark Stripe and PayPal as third-party
      data processors.
- [ ] Complete the **Content rating** questionnaire (peer-to-peer marketplace,
      user messaging — usually rates as "Teen" or higher depending on country).
- [ ] Declare **target audience** (13+ recommended; under-13 triggers extra
      compliance requirements).
- [ ] Confirm `targetSdkVersion` meets Play's current minimum — see
      `android/variables.gradle`.
- [ ] Upload the AAB produced by `release.yml` to the **Internal testing**
      track first; promote to Closed → Open → Production once stable.
- [ ] Add internal testers by email (your own Google account first, so you can
      install the upload-key-signed build via the Play Store on your device).

> 💳 **Payments are in test mode for the initial submission.** The `Stripe
> Connect` and PayPal flows still work end-to-end against the sandbox, which
> is what the Play reviewer will exercise. Switch to live keys (see
> [DEPLOY.md](./DEPLOY.md) — Secrets Manager) only after the app is approved
> and you're ready to take real money.

