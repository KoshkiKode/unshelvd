# Unshelv'd — Connectivity Guide

This file is only for app connectivity behavior.

For all deployment steps, use:

- [DEPLOY.md](./DEPLOY.md)

## Production API URL

Use this canonical production URL in native builds:

```bash
VITE_API_URL=https://unshelvd.koshkikode.com npm run build
```

```bash
API_URL=https://unshelvd.koshkikode.com npm run cap:build:android
```

## Debugging Connectivity

Common causes of offline mode:

1. Wrong `VITE_API_URL` baked into native build
2. CORS origin not allowed in `server/index.ts`
3. Backend unavailable at `https://unshelvd.koshkikode.com/api/health`

Manual check:

```bash
npm run verify:env
```
