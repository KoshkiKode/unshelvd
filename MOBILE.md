# Unshelv'd — Mobile App Setup (Android & iOS)

Uses [Capacitor](https://capacitorjs.com) to wrap the React web app as a native mobile app.

## Prerequisites

- **Android:** Android Studio + Android SDK
- **iOS:** Xcode (macOS only) + CocoaPods

## Setup

```bash
# Install Capacitor
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android @capacitor/ios
npm install @capacitor/splash-screen @capacitor/status-bar

# Build the web app first
npm run build

# Initialize native platforms
npx cap add android
npx cap add ios

# Sync web assets to native projects
npx cap sync
```

## Development

```bash
# After code changes:
npm run build
npx cap sync

# Open in Android Studio
npx cap open android

# Open in Xcode (macOS only)
npx cap open ios
```

## Live Reload (Development)

Edit `capacitor.config.ts` and uncomment the `server.url` line,
pointing to your local dev server IP:

```typescript
server: {
  url: "http://192.168.1.YOUR_IP:5000",
  cleartext: true,  // needed for HTTP in dev
}
```

Then run `npx cap sync` and launch from Android Studio / Xcode.

## Production

For production builds, comment out the `server.url` so the app
uses the bundled web assets from `dist/public/`.

Alternatively, set `server.url` to your Cloud Run URL so the app
always fetches from the server (enables hot updates without
app store releases):

```typescript
server: {
  url: "https://your-cloud-run-url.a.run.app",
}
```

## Building Release APK / IPA

**Android:**
1. Open in Android Studio: `npx cap open android`
2. Build > Generate Signed Bundle / APK
3. Follow the signing wizard

**iOS:**
1. Open in Xcode: `npx cap open ios`
2. Product > Archive
3. Distribute via App Store Connect
