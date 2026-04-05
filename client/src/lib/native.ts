/**
 * native.ts — Capacitor bridge utilities
 *
 * Provides thin wrappers around Capacitor plugins so that the web-app code
 * can call native device features (camera, haptics, status bar, keyboard)
 * without importing Capacitor directly throughout the codebase.
 *
 * All functions degrade gracefully when running in a plain browser.
 */

import { Capacitor } from "@capacitor/core";

// ─── Platform helpers ──────────────────────────────────────────────────────

/** Returns true when running inside the native Android or iOS shell. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Returns "android" | "ios" | "web" */
export function getPlatform(): "android" | "ios" | "web" {
  return Capacitor.getPlatform() as "android" | "ios" | "web";
}

// ─── Haptic feedback ──────────────────────────────────────────────────────

/**
 * Trigger a light haptic tap.  No-op on web.
 * Used for button presses, selections, etc.
 */
export async function hapticLight(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Plugin not available — ignore
  }
}

/**
 * Trigger a medium haptic tap.  No-op on web.
 * Used for confirmations, successful actions.
 */
export async function hapticMedium(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    // Plugin not available — ignore
  }
}

/**
 * Trigger a notification-style haptic.  No-op on web.
 * Used for errors or important alerts.
 */
export async function hapticNotification(
  type: "SUCCESS" | "WARNING" | "ERROR" = "SUCCESS"
): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType[type] });
  } catch {
    // Plugin not available — ignore
  }
}

// ─── Status bar ───────────────────────────────────────────────────────────

/** Set the status bar to a light (white icons) or dark (black icons) style. */
export async function setStatusBarStyle(style: "LIGHT" | "DARK"): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style[style] });
  } catch {
    // Plugin not available — ignore
  }
}

// ─── Keyboard ─────────────────────────────────────────────────────────────

/** Programmatically hide the on-screen keyboard. */
export async function hideKeyboard(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    await Keyboard.hide();
  } catch {
    // Plugin not available — ignore
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────────

/**
 * Register a listener that fires when the app returns from background.
 * Returns an unsubscribe function.
 */
export async function onAppResume(callback: () => void): Promise<() => void> {
  if (!isNative()) return () => {};
  try {
    const { App } = await import("@capacitor/app");
    const handle = await App.addListener("appStateChange", (state) => {
      if (state.isActive) callback();
    });
    return () => handle.remove();
  } catch {
    return () => {};
  }
}

// ─── Camera / photo library ───────────────────────────────────────────────

export interface PhotoResult {
  /** Base-64 encoded JPEG data */
  base64: string;
  /** MIME type — always "image/jpeg" */
  format: string;
}

/**
 * Open the native camera or photo picker to let the user select a photo.
 * Returns the image as a base-64 JPEG string, or null if cancelled.
 *
 * Falls back to a plain <input type="file"> on web.
 */
export async function pickPhoto(
  source: "CAMERA" | "PHOTOS" = "PHOTOS"
): Promise<PhotoResult | null> {
  if (!isNative()) {
    // Browser fallback — open a file picker
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          // Strip the "data:image/...;base64," prefix
          const commaIndex = dataUrl.indexOf(",");
          if (commaIndex === -1) return resolve(null);
          const base64 = dataUrl.slice(commaIndex + 1);
          resolve({ base64, format: "image/jpeg" });
        };
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }

  try {
    const { Camera, CameraResultType, CameraSource } = await import(
      /* @vite-ignore */ "@capacitor/camera"
    );
    const image = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: source === "CAMERA" ? CameraSource.Camera : CameraSource.Photos,
    });
    if (!image.base64String) return null;
    return { base64: image.base64String, format: "image/jpeg" };
  } catch (err: any) {
    // User cancelled or permission denied — not an error we need to surface
    if (err?.message?.includes("cancelled") || err?.message?.includes("denied")) {
      return null;
    }
    throw err;
  }
}
