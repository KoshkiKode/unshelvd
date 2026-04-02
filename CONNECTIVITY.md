# Unshelv'd — Connectivity & Deployment Guide

This guide ensures that your web and mobile applications connect correctly to the production backend server.

## 🚀 Building for Production

When building the application for production, the **VITE_API_URL** environment variable is critical. This URL is "baked into" the application bundle at build time.

### 1. Web Deployment (Cloud Run)
For the web version, the API URL is typically relative because the same server hosts both the static files and the API. 

However, if you're using a separate host for the API, set the URL during build:
```bash
VITE_API_URL=https://your-api.run.app npm run build
```

### 2. Android APK / iOS App
Native apps **MUST** have an absolute URL to connect to the backend.

**Build Command:**
```bash
# Set your real Cloud Run URL here
API_URL=https://unshelvd-backend-xxxxxx.run.app npm run cap:build:android
```

If you forget to set this, the build will now **FAIL** early to prevent you from shipping a broken app.

---

## 🔍 Debugging Connectivity

We've added a **Connectivity Guard** to the application. If the app cannot reach the server, it will show a fullscreen "Offline" message with a retry button.

### Common Issues
1. **CORS Blocked**: If you're using a new domain, ensure it's added to the `allowedOrigins` list in `server/index.ts`.
2. **Missing SDK Settings**: For Android, ensure `android/app/src/main/res/xml/network_security_config.xml` allows cleartext for your local development IP if testing over Wi-Fi.
3. **Invalid API URL**: In native apps, use the browser's Remote Inspector (Chrome: `chrome://inspect`, Safari: Develop menu) to check the Console. You should see a "Backend health check failed" message if the URL is wrong.

### Verification Script
Run the environment verification manually at any time:
```bash
npm run verify:env
```
Compare this with your actual server URL.
