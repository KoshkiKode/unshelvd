# Unshelv'd — Connectivity Guide

This file documents how the website, the native apps, and the backend talk to
each other. For deployment steps and AWS infra, use [DEPLOY.md](./DEPLOY.md).
For app build steps, use [MOBILE.md](./MOBILE.md).

## How it fits together

```
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│  Web SPA             │    │  Android / iOS app   │    │  www.koshkikode.com  │
│  (Amplify Hosting)   │    │  (Capacitor WebView) │    │  (sister site)       │
└──────────┬───────────┘    └──────────┬───────────┘    └──────────┬───────────┘
           │ same-origin                │ VITE_API_URL              │ cross-origin
           │ /api/** rewrite            │ → HTTPS                   │ fetch w/ creds
           ▼                            ▼                            ▼
                ┌─────────────────────────────────────────────┐
                │  unshelvd.koshkikode.com → App Runner       │
                │  (Express + WebSocket, port 8080)           │
                └─────────────────────────────────────────────┘
```

## Production API URL

The canonical backend host for every client (web, Android, iOS) is:

```
https://unshelvd.koshkikode.com
```

Native builds bake this in at build time:

```bash
VITE_API_URL=https://unshelvd.koshkikode.com npm run build && npx cap sync
# or, equivalently:
API_URL=https://unshelvd.koshkikode.com npm run cap:build:android
```

Web builds leave `VITE_API_URL` unset so the SPA uses same-origin requests
(Amplify rewrites `/api/**` to App Runner — see [DEPLOY.md §11](./DEPLOY.md)).

## Environment variable reference

| Variable | Where it's read | Effect |
|---|---|---|
| `VITE_API_URL` | Vite client at build time (`client/src/lib/api-base.ts`) | Sets the API base URL for native builds and any web build that needs cross-origin requests. **Must be `https://` in production native builds** — the client logs a hard error otherwise. |
| `CORS_ALLOWED_ORIGINS` | Express server at boot (`server/index.ts`) | Comma-separated extra origins to allow on top of the built-in defaults. The defaults already include `unshelvd.koshkikode.com`, `koshkikode.com`, `www.koshkikode.com`, and the Capacitor WebView origins. |
| `APP_URL` / `PUBLIC_APP_URL` / `WEB_BASE_URL` | Server-side absolute URL builders (emails, OAuth callbacks, payment return URLs) | Should all be `https://unshelvd.koshkikode.com` in production. |
| `NODE_ENV` | Session cookie config (`server/routes.ts`) | When `production`, cookies are issued as `Secure; SameSite=None` so they survive the cross-origin Amplify → App Runner hop and the Capacitor WebView origin. |

## Allowed CORS origins (already wired)

The backend allows the following without any extra env config (see
`server/index.ts`):

- `https://unshelvd.koshkikode.com` — production web app
- `https://koshkikode.com`, `https://www.koshkikode.com` — sister marketing
  site can call the API with credentials
- `capacitor://localhost`, `https://localhost`, `http://localhost` — Capacitor
  iOS / Android WebView origins
- `http://localhost:5000`, `http://10.0.2.2:5000` — local web + Android
  emulator dev
- Any `https://*.run.app` host (legacy Cloud Run safety net)

Add additional origins with `CORS_ALLOWED_ORIGINS=https://other.example.com`.

## Cookie semantics

| Environment | `SameSite` | `Secure` | Notes |
|---|---|---|---|
| Local dev | `Lax` | `false` | Plain HTTP localhost is fine. |
| Production web | `None` | `true` | Required so the cookie set by App Runner survives Amplify's cross-origin rewrite. |
| Production native (Capacitor) | `None` | `true` | The WebView origin (`capacitor://localhost` / `https://localhost`) is cross-origin to the API host, so `SameSite=None; Secure` is mandatory. |

## WebSocket URL

The client derives the WebSocket URL from the resolved API base — the same
`VITE_API_URL` (or same-origin host) is used, with `http(s)://` swapped to
`ws(s)://`. No separate env var is needed.

## Debugging connectivity

Common causes of "offline mode" / "can't reach server":

1. Wrong `VITE_API_URL` baked into the native build (rebuild and re-sync).
2. Backend unreachable — `curl -fsS https://unshelvd.koshkikode.com/api/health`
   should return JSON. If it returns the SPA HTML, your Amplify rewrites are
   in the wrong order ([DEPLOY.md → Common failure modes](./DEPLOY.md)).
3. CORS origin not in the allow-list — check the App Runner application logs
   for `CORS BLOCKED: Rejected origin <origin>`.
4. Session cookie dropped — confirm `NODE_ENV=production` so `SameSite=None;
   Secure` is set; a `Lax` cookie will be silently dropped by the WebView.

Manual sanity check:

```bash
npm run verify:env                                       # local
curl -fsS https://unshelvd.koshkikode.com/api/health     # production
```

For native debug, attach Chrome DevTools to the Android WebView
(`chrome://inspect`) or Safari Web Inspector to the iOS WKWebView and watch
the Network tab for the failing request — the response headers will tell you
whether it's CORS, cookies, or transport.

