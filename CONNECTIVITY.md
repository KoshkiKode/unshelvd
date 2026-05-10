# Unshelv'd — Connectivity Guide

This document explains how the web app, native apps, and backend talk to each
other in the self-hosted Caddy stack.
For deployment steps, see [DEPLOY.md](./DEPLOY.md).
For native app build steps, see [MOBILE.md](./MOBILE.md).

---

## Architecture

```
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│  Web SPA             │    │  Android / iOS app   │    │  www.koshkikode.com  │
│  (served by Caddy)   │    │  (Capacitor WebView) │    │  (sister site)       │
└──────────┬─────────┘    └──────────┬─────────┘    └──────────┬─────────┘
           │ same-origin HTTPS      │ VITE_API_URL             │ cross-origin
           │ /api/** + /ws/**       │ → HTTPS                  │ fetch w/ creds
           ▼                        ▼                           ▼
       ┌───────────────────────────────────────────────┐
       │  unshelvd.koshkikode.com                             │
       │  → Caddy (HTTPS, auto Let's Encrypt)                │
       │  → localhost:5000 (Express + WebSocket)             │
       └───────────────────────────────────────────────┘
                              │
                              ▼
                  PostgreSQL (Docker container)
```

Caddy acts as the sole reverse proxy, terminating TLS and forwarding all
traffic to the Express container on `localhost:5000`. No separate routing layer
is involved.

---

## Sessions & cross-device handoff

User accounts and sessions are both stored in PostgreSQL, so a user can be
signed in on the website *and* the native app at the same time and both
sessions stay valid independently:

- **`users` table** — managed by Drizzle migration `0000_marvelous_spacker_dave.sql`.
- **`user_sessions` table** — auto-created on first connect by `connect-pg-simple`
  (`createTableIfMissing: true` in `server/routes.ts`). Sessions survive
  container restarts because they live in PostgreSQL, not in process memory.
- **Cookies** — `SameSite=None; Secure; HttpOnly`, 7-day TTL. Each device has
  its own session cookie referencing the same user row, so signing out on one
  device doesn't sign out the others.

Real-time messaging uses a single WebSocket per device against `/ws`. When a
user sends a message from device A, the server fans the frame out to every
subscribed WebSocket — so device B (web or phone) sees it within ~1 second.
If the WebSocket can't connect, the client falls back to 5-second polling.

To verify cross-device handoff after a deploy:

1. Sign in as the same user on the website and the installed mobile build.
2. Open the same conversation in `/#/messages` on both.
3. Send a message from one — it should appear on the other within a second.
4. Open browser DevTools → Network → WS and confirm the `wss://…/ws` upgrade
   succeeded (status `101 Switching Protocols`).

---

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

Web builds leave `VITE_API_URL` unset. Caddy serves the SPA statically and
proxies `/api/**` and `/ws/**` to the Express process, so same-origin requests
work without any URL override.

---

## Environment variable reference

| Variable | Where it's read | Effect |
|---|---|---|
| `VITE_API_URL` | Vite client at build time (`client/src/lib/api-base.ts`) | Sets the API base URL for native builds. Leave unset for web builds so same-origin requests are used. **Must be `https://` in production native builds.** |
| `VITE_WS_URL` | Vite client at build time | *(Optional)* Overrides the WebSocket base URL. When unset, derived from `VITE_API_URL`, which is correct for all normal deployments. |
| `CORS_ALLOWED_ORIGINS` | Express server at boot (`server/index.ts`) | Comma-separated extra origins to allow on top of the built-in defaults. |
| `APP_URL` / `PUBLIC_APP_URL` / `WEB_BASE_URL` | Server-side absolute URL builders (emails, OAuth callbacks, payment return URLs) | Set to `https://unshelvd.koshkikode.com` in production. |
| `NODE_ENV` | Session cookie config (`server/routes.ts`) | When `production`, cookies are issued as `Secure; SameSite=None` so they work from the Capacitor WebView origin. |

---

## Allowed CORS origins

The backend allows the following without any extra env config
(see `server/index.ts`):

- `https://unshelvd.koshkikode.com` — production web app
- `https://koshkikode.com`, `https://www.koshkikode.com` — sister marketing site
- `capacitor://localhost`, `https://localhost`, `http://localhost` — Capacitor iOS/Android WebView origins
- `http://localhost:5000`, `http://10.0.2.2:5000` — local web + Android emulator dev

Add additional origins with `CORS_ALLOWED_ORIGINS=https://other.example.com`.

---

## Cookie semantics

| Environment | `SameSite` | `Secure` | Notes |
|---|---|---|---|
| Local dev | `Lax` | `false` | Plain HTTP localhost. |
| Production web | `None` | `true` | Caddy terminates TLS; Express runs on `localhost:5000` but the browser sees HTTPS. |
| Production native (Capacitor) | `None` | `true` | The WebView origin (`capacitor://localhost` / `https://localhost`) is cross-origin to the API host. |

---

## WebSocket URL

The client derives the WebSocket URL via `getWebSocketUrl()` in
`client/src/lib/api-base.ts`. Resolution order:

1. `VITE_WS_URL` if set (escape hatch for split API/WS hosts).
2. Otherwise from `VITE_API_URL` — scheme is flipped to `wss://`.
3. Otherwise from `window.location` — used by same-origin web builds.

> **Note:** Do not derive the WebSocket scheme from `window.location.protocol`
> directly. Inside the Capacitor WebView it's `capacitor:` (iOS) or `http:`
> (Android emulator), which would produce a `ws://` URL against an HTTPS-only
> backend. Always go through `getWebSocketUrl()`.

The Caddy config must proxy the `/ws` path upgrade to Express. Add this to
your `unshelvd.koshkikode.com` Caddyfile block if it isn't already present:

```
unshelvd.koshkikode.com {
    reverse_proxy localhost:5000
}
```

Caddy passes all requests including WebSocket upgrades through the
`reverse_proxy` directive — no special WebSocket rewrite rule is needed.

---

## Debugging connectivity

Common causes of "offline mode" / "can't reach server":

1. **Wrong `VITE_API_URL`** baked into the native build — rebuild and re-sync.
2. **Backend unreachable** — `curl -fsS https://unshelvd.koshkikode.com/api/health` should return JSON. If it returns the SPA HTML, Caddy is serving the static build for all paths — check your Caddyfile `reverse_proxy` directive.
3. **CORS origin not in the allow-list** — check Docker logs (`docker logs unshelvd`) for `CORS BLOCKED: Rejected origin <origin>`.
4. **Session cookie dropped** — confirm `NODE_ENV=production` so `SameSite=None; Secure` is set.

Manual sanity checks:

```bash
npm run verify:env                                       # local
curl -fsS https://unshelvd.koshkikode.com/api/health     # production
docker logs unshelvd --tail 50                           # container logs
journalctl -u caddy -f                                   # Caddy / TLS logs
```

For native debug, attach Chrome DevTools to the Android WebView
(`chrome://inspect`) or Safari Web Inspector to the iOS WKWebView and check
the Network tab for the failing request.
