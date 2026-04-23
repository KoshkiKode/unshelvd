# Unshelv'd — Desktop App Setup (Windows/macOS/Linux)

Uses [Tauri v2](https://v2.tauri.app) to wrap the React web app as a native desktop app.

## Prerequisites

- **Windows:** Visual Studio Build Tools, WebView2 (pre-installed on Win 10/11)
- **macOS:** Xcode Command Line Tools
- **Linux:** `build-essential`, `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libgtk-3-dev`

See: https://v2.tauri.app/start/prerequisites/

## Setup

```bash
# Install Tauri CLI
npm install -D @tauri-apps/cli@latest

# Initialize Tauri in the project
npx tauri init
```

When prompted:
- **App name:** Unshelv'd
- **Window title:** Unshelv'd
- **Web assets path:** `../dist/public`
- **Dev server URL:** `http://localhost:5000`
- **Dev command:** `npm run dev`
- **Build command:** `npm run build`

## Development

```bash
# Run in dev mode (hot-reload)
npx tauri dev
```

This starts both the Vite dev server and the Tauri window simultaneously.

## Building

```bash
# Build for current platform
npx tauri build
```

Outputs:
- **Windows:** `src-tauri/target/release/bundle/msi/` (.msi installer)
- **macOS:** `src-tauri/target/release/bundle/dmg/` (.dmg)
- **Linux:** `src-tauri/target/release/bundle/deb/` (.deb) and `/appimage/` (.AppImage)

## Configuration

After `tauri init`, the config is at `src-tauri/tauri.conf.json`.

Key settings to customize:
```json
{
  "app": {
    "windows": [{
      "title": "Unshelv'd",
      "width": 1200,
      "height": 800,
      "minWidth": 800,
      "minHeight": 600,
      "resizable": true
    }]
  },
  "bundle": {
    "identifier": "com.unshelvd.desktop",
    "icon": ["icons/icon.png"]
  }
}
```

## Notes

- The desktop app loads the same React frontend
- In dev mode, it connects to `localhost:5000` (your local server)
- In production, you can either bundle the static frontend or point to your App Runner URL
- Tauri apps are ~3-8MB (vs Electron's 150MB+) since they use the system WebView
