import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.unshelvd.app",
  appName: "Unshelv'd",
  webDir: "dist/public",
  server: {
    // Point to your Cloud Run URL in production
    // url: "https://unshelvd-XXXXX-uc.a.run.app",
    // For local dev, use your machine's IP:
    // url: "http://192.168.1.X:5000",
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#FAF8F3",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#FAF8F3",
    },
  },
};

export default config;
