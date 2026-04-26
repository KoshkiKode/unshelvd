# Unshelv'd — Connectivity Guide

This file documents how the website, the native apps, and the backend talk to
each other. For deployment steps and AWS infra, use [DEPLOY.md](./DEPLOY.md).
For app build steps, use [MOBILE.md](./MOBILE.md).

## Sessions & cross-device handoff

User accounts and sessions are both stored in PostgreSQL on RDS, so a user
can be signed in on the website *and* the native app at the same time and
both sessions stay valid independently:

- **`users` table** — managed by Drizzle migration `0000_marvelous_spacker_dave.sql`.
- **`user_sessions` table** — auto-created on first connect by
  `connect-pg-simple` (`createTableIfMissing: true` in `server/routes.ts`).
  Sessions outlive container restarts and are shared across all ECS Fargate
  tasks if the service ever scales beyond one.
- **Cookies** — `SameSite=None; Secure; HttpOnly`, 7-day TTL. Each device has
  its own session cookie referencing the same user row, so signing out on one
  device doesn't sign out the others.

Real-time messaging uses a single WebSocket per device against `/ws`. When a
user sends a message from device A, the server fans the frame out to every
subscribed WebSocket — so device B (web or phone) sees it within ~1 second.
If the WebSocket can't connect, the client falls back to 5-second polling, so
messages still arrive but no longer feel "instant".

To verify the handoff after a deploy:

1. Sign in as the same user on the website and the installed mobile build.
2. Open the same conversation in `/#/messages` on both.
3. Send a message from one — it should appear on the other within a second.
4. Open browser DevTools → Network → WS to confirm the `wss://…/ws` upgrade
   succeeded (status `101 Switching Protocols`). On native, attach Chrome
   DevTools (`chrome://inspect`) or Safari Web Inspector and check the same.

## How it fits together

```
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│  Web SPA             │    │  Android / iOS app   │    │  www.koshkikode.com  │
│  (Amplify Hosting)   │    │  (Capacitor WebView) │    │  (sister site)       │
└──────────┬───────────┘    └──────────┬───────────┘    └──────────┬───────────┘
           │ same-origin                │ VITE_API_URL              │ cross-origin
           │ /api/** + /ws/**           │ → HTTPS                   │ fetch w/ creds
           │ Amplify rewrites           │                            │
           ▼                            ▼                            ▼
                ┌─────────────────────────────────────────────┐
                │  unshelvd.koshkikode.com → ALB              │
                │  → ECS Fargate (Express + WebSocket, :8080) │
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
(Amplify rewrites `/api/**` and `/ws/**` to the ALB — see [DEPLOY.md Step 12](./DEPLOY.md#step-12----aws-amplify-hosting----frontend--custom-domain-one-time)).

## Environment variable reference

| Variable | Where it's read | Effect |
|---|---|---|
| `VITE_API_URL` | Vite client at build time (`client/src/lib/api-base.ts`) | Sets the API base URL for native builds and any web build that needs cross-origin requests. **Must be `https://` in production native builds** — the client logs a hard error otherwise. |
| `VITE_WS_URL` | Vite client at build time (`client/src/lib/api-base.ts`) | *(Optional — rarely needed)* Overrides the WebSocket base URL. When unset, the WebSocket URL is derived from `VITE_API_URL`, which is what you want unless you're running the realtime server on a different host than the REST API. |
| `CORS_ALLOWED_ORIGINS` | Express server at boot (`server/index.ts`) | Comma-separated extra origins to allow on top of the built-in defaults. The defaults already include `unshelvd.koshkikode.com`, `koshkikode.com`, `www.koshkikode.com`, and the Capacitor WebView origins. |
| `APP_URL` / `PUBLIC_APP_URL` / `WEB_BASE_URL` | Server-side absolute URL builders (emails, OAuth callbacks, payment return URLs) | Should all be `https://unshelvd.koshkikode.com` in production. |
| `NODE_ENV` | Session cookie config (`server/routes.ts`) | When `production`, cookies are issued as `Secure; SameSite=None` so they survive the cross-origin Amplify → ALB → ECS hop and the Capacitor WebView origin. |

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
- Any `https://*.run.app` host (legacy safety net — kept for compatibility)

Add additional origins with `CORS_ALLOWED_ORIGINS=https://other.example.com`.

## Cookie semantics

| Environment | `SameSite` | `Secure` | Notes |
|---|---|---|---|
| Local dev | `Lax` | `false` | Plain HTTP localhost is fine. |
| Production web | `None` | `true` | Required so the cookie set by ECS survives Amplify's cross-origin rewrite (Amplify CloudFront → ALB → ECS). |
| Production native (Capacitor) | `None` | `true` | The WebView origin (`capacitor://localhost` / `https://localhost`) is cross-origin to the API host, so `SameSite=None; Secure` is mandatory. |

## WebSocket URL

The client derives the WebSocket URL via `getWebSocketUrl()` in
`client/src/lib/api-base.ts`. Resolution order:

1. `VITE_WS_URL` if set (rare; escape hatch for split API/WS hosts).
2. Otherwise the resolved API base — the scheme is taken from `VITE_API_URL`
   (so `https://` → `wss://`). This is what native builds use.
3. Otherwise the page origin (`window.location`). This is what same-origin web
   builds use.

> ⚠️ Do **not** derive the WebSocket scheme from `window.location.protocol`
> directly — inside the Capacitor WebView it's `capacitor:` (iOS) or `http:`
> (Android emulator), which would produce a `ws://` URL against an HTTPS-only
> backend. Always go through `getWebSocketUrl()`.

For web builds served from Amplify, an additional `/ws/<*>` rewrite rule is
required so that the upgrade request is proxied to the ALB/ECS backend instead
of being swallowed by the SPA fallback. See [DEPLOY.md Step 12c](./DEPLOY.md#12c-configure-rewrites-and-redirects).

## Debugging connectivity

Common causes of "offline mode" / "can't reach server":

1. Wrong `VITE_API_URL` baked into the native build (rebuild and re-sync).
2. Backend unreachable — `curl -fsS https://unshelvd.koshkikode.com/api/health`
   should return JSON. If it returns the SPA HTML, your Amplify rewrites are
   in the wrong order ([DEPLOY.md → Common failure modes](./DEPLOY.md#common-failure-modes)).
3. CORS origin not in the allow-list — check the ECS task CloudWatch logs
   (`/ecs/unshelvd`) for `CORS BLOCKED: Rejected origin <origin>`.
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

