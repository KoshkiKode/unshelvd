# Unshelv'd — Production Deployment Guide

> **Self-hosted deployment only.** This guide covers deploying Unshelv'd on your own hardware
> (a home server or any Linux VPS) using Docker Compose, Caddy, and GoDaddy DNS.
>
> If this is your first time setting up the server itself (Debian install, Docker, Caddy,
> dynamic DNS cron job), start with **[HOME_SERVER_SETUP.md](./HOME_SERVER_SETUP.md)** first,
> then return here.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Pre-deploy Checklist](#2-pre-deploy-checklist)
3. [Clone and Configure](#3-clone-and-configure)
4. [Environment Variables Reference](#4-environment-variables-reference)
5. [Build and Start](#5-build-and-start)
6. [Database Setup](#6-database-setup)
7. [Caddy Configuration](#7-caddy-configuration)
8. [Stripe Webhook](#8-stripe-webhook)
9. [Mobile Builds](#9-mobile-builds)
10. [Updates and Redeployment](#10-updates-and-redeployment)
11. [Backups](#11-backups)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Architecture Overview

```
 Internet
    │
    ▼
 GoDaddy DNS  ──▶  A record → your home/server IP  (updated by cron every 5 min)
    │
    ▼
 Router  ──▶  Port 80/443 forwarded to server LAN IP
    │
    ▼
 Caddy (port 80/443)  ──▶  auto-HTTPS via Let's Encrypt
    │
    ├──▶  unshelvd.koshkikode.com  →  localhost:8080  (app container)
    └──▶  other subdomains         →  other services
    │
    ▼
 Docker Compose
    ├── app   (Node.js/Express — port 8080, internal)
    └── db    (PostgreSQL 16  — port 5432, internal)
```

The `app` container is never exposed directly to the internet — all traffic flows through Caddy.
The `db` container is never exposed beyond localhost.

---

## 2. Pre-deploy Checklist

Complete all of these before deploying:

- [ ] Server is running Debian 12 with Docker + Caddy installed
      → See [HOME_SERVER_SETUP.md](./HOME_SERVER_SETUP.md) if not done yet
- [ ] Ports 80 and 443 are forwarded in your router to the server's LAN IP
- [ ] `unshelvd.koshkikode.com` A record exists in GoDaddy and resolves to your public IP
      (dynamic DNS cron job keeps this current automatically)
- [ ] You have Stripe API keys (secret + publishable)
- [ ] You have a Stripe webhook secret for `https://unshelvd.koshkikode.com/api/webhooks/stripe`
- [ ] You have SMTP credentials for transactional email (or will configure via admin panel)
- [ ] PayPal credentials ready if enabling PayPal payments (optional)

---

## 3. Clone and Configure

```bash
cd /var/www
git clone https://github.com/KoshkiKode/unshelvd.git
cd unshelvd
cp .env.example .env
nano .env
```

The `.env.example` in this repo has detailed inline comments for every variable.
Read them — especially the Stripe and SMTP sections.

---

## 4. Environment Variables Reference

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Use `@db:` (Docker service name), not `@localhost:`. Example: `postgresql://unshelvd:PASSWORD@db:5432/unshelvd` |
| `POSTGRES_PASSWORD` | The password used in `DATABASE_URL`. Docker Compose reads this to create the DB user. |
| `SESSION_SECRET` | Random 32-byte hex string. Generate: `openssl rand -hex 32` |
| `PORT` | App listen port. Set to `8080` to match docker-compose.yml. |
| `PUBLIC_APP_URL` | Your public domain. Used in email links. Example: `https://unshelvd.koshkikode.com` |

### Stripe (Payments)

| Variable | Where to get it |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys → Secret key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → Signing secret (`whsec_...`) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API Keys → Publishable key (`pk_live_...`) |

Leave all three unset to run without payments (dev/demo mode).

### Email (SMTP)

| Variable | Example |
|---|---|
| `SMTP_HOST` | Your SMTP provider's host, e.g. `smtp.mailprovider.com` |
| `SMTP_PORT` | `587` (STARTTLS) or `465` (SSL) |
| `SMTP_USER` | Your SMTP username |
| `SMTP_PASS` | Your SMTP password |
| `EMAIL_FROM` | `Unshelv'd <noreply@koshkikode.com>` |

If unset, emails are printed to the console (dev mode). You can also configure SMTP
via the admin panel at runtime (Settings → Email) without restarting the app.

Any standard SMTP provider works: Postfix on the same server, Mailgun, Brevo, Fastmail, Proton Mail Bridge, etc.

### PayPal (Optional)

| Variable | Description |
|---|---|
| `PAYPAL_CLIENT_ID` | From PayPal Developer Dashboard |
| `PAYPAL_CLIENT_SECRET` | Keep secret — never commit |
| `PAYPAL_WEBHOOK_ID` | Webhook ID for `https://unshelvd.koshkikode.com/api/webhooks/paypal` |

PayPal is disabled by default. Enable in admin panel (Settings → Payments) after setting credentials.

### Profile Images

By default, profile images are stored as files on the local Docker volume. No external
storage service is required.

| Variable | Description |
|---|---|
| `UPLOAD_DIR` | Path **inside** the container where uploaded images are stored. Default: `/app/uploads`. Bind-mount this path in `docker-compose.yml` to persist across container recreations. |

The `docker-compose.yml` already includes the correct bind mount:

```yaml
volumes:
  - ./uploads:/app/uploads
```

This keeps all uploaded images in `./uploads/` on the host alongside the repo — safe
across `docker compose up --build` rebuilds. Back it up with your normal server backup.

### Mobile

| Variable | Description |
|---|---|
| `VITE_API_URL` | Production API URL for native builds. Set on CLI only (not in `.env`): `VITE_API_URL=https://unshelvd.koshkikode.com npm run build` |

---

## 5. Build and Start

```bash
cd /var/www/unshelvd

# Build the app image and start both containers
docker compose up --build -d

# Watch logs until you see the app announce it's listening
docker compose logs -f
# Press Ctrl+C when you see "Server listening on port 8080"
```

Both containers have `restart: unless-stopped` — they come back automatically after a reboot.

---

## 6. Database Setup

Run once after first deploy (and after any schema-changing update):

```bash
# Apply all migrations
docker compose exec app npm run db:migrate:run

# Seed initial data (admin account, demo users, catalog)
docker compose exec app npm run db:setup
```

Admin credentials come from your `.env`.
If `ADMIN_EMAIL` / `ADMIN_PASSWORD` are not set, they are auto-generated and printed to the log.

```bash
# View the generated credentials
docker compose logs app | grep -i admin
```

---

## 7. Caddy Configuration

Edit `/etc/caddy/Caddyfile` and add:

```
unshelvd.koshkikode.com {
    reverse_proxy localhost:8080
}
```

Reload Caddy:

```bash
caddy fmt --overwrite /etc/caddy/Caddyfile
systemctl reload caddy
```

Visit `https://unshelvd.koshkikode.com` — Caddy provisions the SSL cert automatically
on the first request (takes ~5 seconds). Check Caddy logs if it doesn't:

```bash
journalctl -u caddy -f
```

---

## 8. Stripe Webhook

1. Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Set URL: `https://unshelvd.koshkikode.com/api/webhooks/stripe`
4. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `account.updated`
   - `transfer.failed`
   - `charge.refunded`
5. Copy the **Signing secret** (`whsec_...`)
6. Add it to `.env` as `STRIPE_WEBHOOK_SECRET`
7. Restart the app:
   ```bash
   docker compose restart app
   ```

---

## 9. Mobile Builds

Mobile builds happen on your **dev machine**, not the server.
See [MOBILE.md](./MOBILE.md) and [CONNECTIVITY.md](./CONNECTIVITY.md) for full details.

### Quick reference

```bash
# Build the web bundle pointing at your production server
VITE_TARGET=android VITE_API_URL=https://unshelvd.koshkikode.com npm run build

# Sync to native project
npx cap sync android   # or: npx cap sync ios

# Open in IDE
npx cap open android   # Android Studio
npx cap open ios       # Xcode (macOS only)
```

In `capacitor.config.ts`, comment out or remove `server.url` for production builds.
It is only used during local dev to point the native shell at your dev machine.

---

## 10. Updates and Redeployment

```bash
cd /var/www/unshelvd

# Pull latest code
git pull

# Rebuild and restart (downtime is typically < 10 seconds)
docker compose up --build -d

# If the schema changed, run migrations immediately after
docker compose exec app npm run db:migrate:run
```

> **Zero-downtime tip:** Build the new image first with `docker compose build`, then
> swap with `docker compose up -d`. The old container keeps serving during the build.

---

## 11. Backups

A nightly backup cron job is set up as part of the server setup in
[HOME_SERVER_SETUP.md § 13](./HOME_SERVER_SETUP.md#13-backups). It runs at 2 AM and
keeps 14 days of compressed PostgreSQL dumps in `/var/backups/db/`.

### Manual backup

```bash
docker exec unshelvd-db-1 pg_dump -U unshelvd unshelvd | \
  gzip > /var/backups/db/unshelvd-manual-$(date +%Y-%m-%d).sql.gz
```

### Backup uploaded images

```bash
tar -czf /var/backups/uploads-$(date +%Y-%m-%d).tar.gz /var/www/unshelvd/uploads/
```

Add this to the same nightly cron job as the database backup.

### Restore from backup

```bash
# Stop the app so nothing writes during restore
docker compose stop app

# Restore (drops and recreates the database)
docker exec -i unshelvd-db-1 psql -U unshelvd -c "DROP DATABASE IF EXISTS unshelvd;"
docker exec -i unshelvd-db-1 psql -U unshelvd -c "CREATE DATABASE unshelvd;"

gunzip -c /var/backups/db/unshelvd-2026-01-01.sql.gz | \
  docker exec -i unshelvd-db-1 psql -U unshelvd unshelvd

# Restore uploads if needed
tar -xzf /var/backups/uploads-2026-01-01.tar.gz -C /

# Restart
docker compose start app
```

---

## 12. Troubleshooting

```bash
# App won't start — check logs
docker compose logs app

# Database won't start — check PostgreSQL health
docker compose logs db
docker compose ps

# SSL cert not provisioning
journalctl -u caddy -f
# Common causes: port 80 not forwarded, DNS not pointing to you yet

# Check what's on each port
ss -tlnp | grep -E '80|443|8080|5432'

# Migrations failing
docker compose exec app npm run db:migrate:run
# If you need to reset dev DB entirely:
docker compose down -v   # WARNING: destroys all data
docker compose up -d
npm run db:setup

# Dynamic DNS — check if IP is updating
tail -f /var/log/ddns.log
curl https://api.ipify.org   # your current public IP

# Disk space
df -h
docker system prune      # remove stopped containers + dangling images
```

### Common errors

| Error | Fix |
|---|---|
| `ECONNREFUSED` connecting to DB | `DATABASE_URL` uses `@localhost:` instead of `@db:` — fix the URL in `.env` |
| `password authentication failed` | `POSTGRES_PASSWORD` in `.env` doesn't match what the DB was created with — `docker compose down -v` and redeploy |
| SSL cert fails with `no such host` | DNS hasn't propagated yet — wait up to 5 minutes for dynamic DNS cron to run, or check GoDaddy |
| Stripe webhook signature mismatch | `STRIPE_WEBHOOK_SECRET` is wrong or was copied from test mode — verify in Stripe Dashboard |
| `MODULE_NOT_FOUND` on startup | Image was not rebuilt after a dependency change — `docker compose up --build -d` |
| Uploaded images not persisting after rebuild | Check that `./uploads:/app/uploads` bind mount is in `docker-compose.yml` |

---

*KoshkiKode LLC — Dylan Moore*
*Self-hosted on Debian + Docker + Caddy*
