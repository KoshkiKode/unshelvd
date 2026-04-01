import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.unshelvd.app",
  appName: "Unshelv'd",
  webDir: "dist/public",

  // Server config — how the native WebView loads the app
  server: {
    // In production builds, the app loads from bundled files in webDir.
    // The frontend's queryClient.ts handles API routing to your Cloud Run server
    // via the VITE_API_URL env var (set at build time).
    //
    // For local dev with live reload, uncomment one of these:
    // Android Emulator (10.0.2.2 maps to host machine's localhost):
    //   url: "http://10.0.2.2:5000",
    // Physical device on same network:
    //   url: "http://192.168.1.YOUR_IP:5000",
    // iOS Simulator:
    //   url: "http://localhost:5000",
    androidScheme: "https",
    iosScheme: "https",
    // Allow mixed content for dev (HTTP API calls from HTTPS webview)
    allowNavigation: ["*"],
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: "#FAF8F3",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#FAF8F3",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },

  // Android-specific
  android: {
    allowMixedContent: true,  // Allow HTTP in dev
    captureInput: true,
    webContentsDebuggingEnabled: true,  // Disable this for production APK
  },

  // iOS-specific
  ios: {
    contentInset: "automatic",
    allowsLinkPreview: true,
    scrollEnabled: true,
  },
};

export default config;
