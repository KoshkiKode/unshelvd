import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.unshelvd.app",
  appName: "Unshelv'd",
  webDir: "dist/public",

  server: {
    androidScheme: "https",
    iosScheme: "https",
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
      style: "DEFAULT",         // let the app control status bar style
      backgroundColor: "#00000000", // fully transparent
      overlaysWebView: true,    // status bar overlays the WebView (edge-to-edge)
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    EdgeToEdge: {
      enabled: true,            // Capacitor 6+ edge-to-edge plugin if present
    },
  },

  // Android-specific
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    // Edge-to-edge: WebView draws behind system bars
    // Handled via styles.xml transparent status/nav bar colors
  },

  // iOS-specific
  ios: {
    // "none" = don't inset — the app fills the whole screen including safe area
    // The web app handles safe-area-inset via CSS env() variables
    contentInset: "never",
    allowsLinkPreview: true,
    scrollEnabled: true,
    // Allow the WKWebView to extend under the status bar / home indicator
    preferredContentMode: "mobile",
  },
};

export default config;
