# KoshkiKode — Complete Home Server Setup Guide

> **Goal:** Run Unshelvd and all KoshkiKode sites from a headless Debian tower
> on Metronet fiber, using Route 53 for DNS and Caddy for HTTPS.
> No cloud hosting fees. No S3 required.
>
> **Hardware target:** Single desktop tower, 8 GB RAM, ~800 GB storage.
> Everything here is designed to run comfortably on that machine.

---

## Table of Contents

1. [Running Everything on One Machine](#running-everything-on-one-machine)
2. [What You Need Before Starting](#1-what-you-need-before-starting)
3. [Install Debian Headless](#2-install-debian-headless)
4. [First Boot: Essential Setup](#3-first-boot-essential-setup)
5. [Install Docker](#4-install-docker)
6. [Install Caddy](#5-install-caddy)
7. [Router: Port Forwarding](#6-router-port-forwarding)
8. [Route 53: Dynamic DNS](#7-route-53-dynamic-dns)
9. [Deploy Unshelvd](#8-deploy-unshelvd)
10. [Paywalled Download Pages](#9-paywalled-download-pages)
11. [Additional Websites](#10-additional-websites)
12. [Caddy Config: Full Example](#11-caddy-config-full-example)
13. [Mobile (Android + iOS)](#12-mobile-android--ios)
14. [Backups](#13-backups)
15. [Maintenance Cheat Sheet](#14-maintenance-cheat-sheet)
16. [Quick Reference Links](#15-quick-reference-links)

---

## Running Everything on One Machine

Your tower is more than capable. Here’s the approximate memory footprint of
the full stack at rest:

| Service | RAM (approx) |
|---|---|
| Debian OS (headless, no desktop) | ~150 MB |
| Caddy (reverse proxy + SSL) | ~20 MB |
| PostgreSQL 16 container | ~50–100 MB |
| Unshelvd app container | ~150–300 MB |
| Headroom for additional sites | plenty |
| **Total** | **~500–600 MB** |

With 8 GB RAM you have 7+ GB of headroom. The 800 GB drive will hold the
database, download files, Docker images, and logs for years. Each additional
Docker app you add costs roughly 100–300 MB RAM.

> **After any reboot:** Docker has `restart: unless-stopped` on both containers,
> and Caddy is enabled via systemctl. Everything comes back automatically —
> you don’t need to do anything.

---

## 1. What You Need Before Starting

### Hardware
- Desktop tower (8 GB RAM, ~800 GB storage)
- Ethernet cable plugged directly into your Metronet router — do not use Wi-Fi
- A separate machine to SSH from (your main laptop/PC)

### Accounts & Services
- **AWS Route 53** — DNS provider. You’ll create an IAM user with limited
  Route 53 permissions. [AWS IAM Console →](https://console.aws.amazon.com/iam/)
- **Your domain** — nameservers pointed at Route 53
- **Stripe** — for payments. [stripe.com →](https://stripe.com)
- **Email / SMTP** — Unshelvd sends transactional emails (password reset,
  offers, transactions). [Amazon SES](https://aws.amazon.com/ses/) is cheapest
  for Route 53 users; any SMTP provider works.

### Software to download on your main machine
- [Debian 12 “Bookworm” netinst ISO](https://www.debian.org/distrib/netinst) —
  ~400 MB small installer (not the full DVD)
- [Rufus (Windows)](https://rufus.ie) or
  [Balena Etcher (Mac/Linux)](https://etcher.balena.io) — to flash ISO to USB
- SSH client — Windows 11 has one built in (`ssh` in PowerShell), or
  [PuTTY](https://www.putty.org)

---

## 2. Install Debian Headless

1. Flash the Debian 12 netinst ISO to a USB drive using Rufus or Etcher
2. Boot your tower from USB (usually F12 or DEL at POST to select boot device)
3. Choose **Install** (not graphical install)
4. Walk through the installer:
   - Language: English / Location: United States
   - Hostname: something like `koshki-server`
   - Set a strong root password; create a regular user (e.g. `dylan`)
   - Partitioning: **Guided — use entire disk**, single partition
   - **Software selection:** Uncheck everything **except**:
     - `SSH server`
     - `standard system utilities`
     - Nothing else. No desktop, no print server.
5. Let it install and reboot. Pull out the USB when it reboots.

You’ll see a plain text login prompt. That’s correct.

To find your tower’s local IP, log in at the screen once and run:
```bash
ip addr show
```
Look for something like `192.168.1.XX` on your ethernet interface
(`eth0` or `enp3s0`).

> From this point on, do everything over SSH from your main machine.
> The monitor can sit dark forever.

---

## 3. First Boot: Essential Setup

SSH in from your main machine:
```bash
ssh dylan@192.168.1.XX
```

Then:
```bash
# Switch to root
su -

# Update everything
apt update && apt upgrade -y

# Install essentials
apt install -y curl git ufw unzip htop nano awscli

# Firewall — allow SSH, HTTP, HTTPS only
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
ufw status
```

### Give your tower a static local IP

Log into your Metronet router admin (usually `192.168.1.1` in a browser).
Find **DHCP Reservations** or **Static Leases**. Add an entry that ties your
tower’s MAC address to a fixed IP like `192.168.1.50` so port forwarding
never breaks.

Find your MAC address:
```bash
ip link show
# Look for link/ether xx:xx:xx:xx:xx:xx on your ethernet interface
```

---

## 4. Install Docker

[Docker install docs for Debian →](https://docs.docker.com/engine/install/debian/)
[Docker Compose docs →](https://docs.docker.com/compose/)

```bash
# Remove any old versions
apt remove -y docker docker-engine docker.io containerd runc

# Add Docker’s official apt repository
apt install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# Let your regular user run docker without sudo
usermod -aG docker dylan

# Enable and start Docker
systemctl enable --now docker

# Verify
docker run hello-world
```

Log out and back in for the group change to take effect:
```bash
exit
# ssh back in as dylan
```

---

## 5. Install Caddy

Caddy is your reverse proxy. It automatically obtains and renews HTTPS certs
from Let’s Encrypt for every domain you configure — no Certbot, no cron jobs.

[Caddy documentation →](https://caddyserver.com/docs/)
[Caddy install guide →](https://caddyserver.com/docs/install#debian-ubuntu-raspbian)
[Caddyfile reference →](https://caddyserver.com/docs/caddyfile)

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
  gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
  tee /etc/apt/sources.list.d/caddy-stable.list

apt update
apt install -y caddy

systemctl enable --now caddy
caddy version
```

The config file lives at `/etc/caddy/Caddyfile`. After any edit:
```bash
caddy fmt --overwrite /etc/caddy/Caddyfile   # validates + formats
systemctl reload caddy
```

---

## 6. Router: Port Forwarding

In your Metronet router admin panel, find **Port Forwarding** and add:

| Name | External Port | Internal IP | Internal Port | Protocol |
|---|---|---|---|---|
| Web HTTP | 80 | 192.168.1.50 | 80 | TCP |
| Web HTTPS | 443 | 192.168.1.50 | 443 | TCP |

Replace `192.168.1.50` with your tower’s reserved local IP.

### Verify it works

From your phone on **cellular** (not Wi-Fi — you need to be outside your
network), visit `http://YOUR_PUBLIC_IP`. Get your public IP with:
```bash
curl https://checkip.amazonaws.com
```
If Caddy responds at all (even a 404), port forwarding is working.

---

## 7. Route 53: Dynamic DNS

Metronet residential IPs are dynamic and can change. This script checks your
public IP every 5 minutes and updates all your Route 53 A records automatically.

### Create a limited IAM user

1. [AWS IAM Console →](https://console.aws.amazon.com/iam/) → Users →
   Create user, name it `route53-ddns`
2. Find your **Hosted Zone ID** in
   [Route 53 Console →](https://console.aws.amazon.com/route53/)
   (looks like `Z1234ABCDEF`)
3. Attach this inline policy to the new user:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "route53:ChangeResourceRecordSets",
        "route53:ListResourceRecordSets"
      ],
      "Resource": "arn:aws:route53:::hostedzone/YOUR_HOSTED_ZONE_ID"
    },
    {
      "Effect": "Allow",
      "Action": "route53:ListHostedZones",
      "Resource": "*"
    }
  ]
}
```

4. Create access keys for this user and save them securely.

### Configure AWS CLI on the server

```bash
aws configure --profile route53-ddns
# Access Key ID:     (paste your key)
# Secret Access Key: (paste your secret)
# Default region:    us-east-1
# Output format:     json
```

### Create the dynamic DNS script

```bash
nano /usr/local/bin/update-dns.sh
```

```bash
#!/bin/bash

HOSTED_ZONE_ID="YOUR_HOSTED_ZONE_ID"
# All A records to keep updated, space-separated
RECORDS="koshkikode.com www.koshkikode.com unshelvd.koshkikode.com downloads.koshkikode.com"
IP_FILE="/tmp/last_known_ip.txt"
PROFILE="route53-ddns"

CURRENT_IP=$(curl -sf https://checkip.amazonaws.com)

if [ -z "$CURRENT_IP" ]; then
  echo "$(date): Failed to get public IP" >> /var/log/ddns.log
  exit 1
fi

LAST_IP=$(cat "$IP_FILE" 2>/dev/null)
[ "$CURRENT_IP" = "$LAST_IP" ] && exit 0

echo "$(date): IP changed $LAST_IP -> $CURRENT_IP - updating Route 53" >> /var/log/ddns.log

for RECORD in $RECORDS; do
  aws route53 change-resource-record-sets \
    --profile "$PROFILE" \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --change-batch "{
      \"Changes\": [{
        \"Action\": \"UPSERT\",
        \"ResourceRecordSet\": {
          \"Name\": \"$RECORD\",
          \"Type\": \"A\",
          \"TTL\": 300,
          \"ResourceRecords\": [{\"Value\": \"$CURRENT_IP\"}]
        }
      }]
    }" >> /var/log/ddns.log 2>&1
done

echo "$CURRENT_IP" > "$IP_FILE"
```

```bash
chmod +x /usr/local/bin/update-dns.sh

# Test manually first
/usr/local/bin/update-dns.sh
cat /var/log/ddns.log
```

### Add the cron job

```bash
crontab -e
# Add this line:
*/5 * * * * /usr/local/bin/update-dns.sh
```

---

## 8. Deploy Unshelvd

Your `docker-compose.yml` runs two containers: the app on port **8080** and
PostgreSQL 16 on port **5432**. Both restart automatically on reboot.
The Compose file reads passwords from your `.env` file via
`${POSTGRES_PASSWORD:-unshelvd_dev}` — so you only need to set them in one place.

### Clone the repo

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/KoshkiKode/unshelvd.git
cd unshelvd
```

### Configure environment

```bash
cp .env.example .env
nano .env
```

Fill in the following. The `.env.example` in this repo has detailed comments
for every variable — read them before filling in.

```env
# --- Required ---

# Must match the password you set below for POSTGRES_PASSWORD
DATABASE_URL=postgresql://unshelvd:YOUR_STRONG_PASSWORD@db:5432/unshelvd
# Note: use @db: (the Docker service name), NOT @localhost:

POSTGRES_PASSWORD=YOUR_STRONG_PASSWORD

# Generate with: openssl rand -hex 32
SESSION_SECRET=paste-generated-secret-here

PORT=8080

# Your public domain — used in email links
PUBLIC_APP_URL=https://unshelvd.koshkikode.com

# --- Stripe (leave as sk_test_... to run without payments in dev) ---
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...

# --- SMTP (for transactional email) ---
# Amazon SES is recommended (see .env.example for full instructions)
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-ses-smtp-user
SMTP_PASS=your-ses-smtp-password
EMAIL_FROM=Unshelv'd <noreply@koshkikode.com>

# --- Mobile build target (set on CLI only, not in .env) ---
# VITE_API_URL=https://unshelvd.koshkikode.com
```

Generate your session secret:
```bash
openssl rand -hex 32
```

### Start everything

```bash
docker compose up -d

# Watch logs to confirm clean startup (Ctrl+C to stop watching)
docker compose logs -f
```

You should see the DB become healthy, then the app start on port 8080.

### Run database migrations

```bash
docker compose exec app npm run db:push

# Optional: seed with sample data
docker compose exec app npm run db:seed
```

### Add Unshelvd to Caddy

Edit `/etc/caddy/Caddyfile`:
```
unshelvd.koshkikode.com {
    reverse_proxy localhost:8080
}
```

```bash
caddy fmt --overwrite /etc/caddy/Caddyfile
systemctl reload caddy
```

Visit `https://unshelvd.koshkikode.com` — Caddy provisions the SSL cert on
the first request (~5 seconds).

### Configure Stripe webhook

In the [Stripe Dashboard →](https://dashboard.stripe.com) under
Developers → Webhooks, add an endpoint:
- **URL:** `https://unshelvd.koshkikode.com/api/webhooks/stripe`
- **Events:** `payment_intent.succeeded`, `payment_intent.payment_failed`,
  `account.updated`, `transfer.failed`, `charge.refunded`

Copy the signing secret (`whsec_...`) into your `.env` as `STRIPE_WEBHOOK_SECRET`,
then restart:
```bash
docker compose restart app
```

---

## 9. Paywalled Download Pages

Files live on local disk. Your app generates short-lived, single-use signed
tokens. Files are **never in a public web path** — only your backend can serve
them after token validation.

### Create the files directory

```bash
mkdir -p /var/www/downloads/files
chown -R dylan:dylan /var/www/downloads
```

Place your downloadable files in `/var/www/downloads/files/`.

### How the flow works

1. User pays via Stripe on your downloads page
2. Stripe fires a webhook to your server
3. Your server creates a download token in the DB with an expiry (e.g. 1 hour)
4. User is redirected to `/download/:token`
5. Server validates token, marks it used, streams the file

### Express endpoint example

```ts
import path from 'path';
import fs from 'fs';

app.get('/download/:token', async (req, res) => {
  const { token } = req.params;

  const record = await db.query.downloadTokens.findFirst({
    where: (t, { eq, and, gt }) => and(
      eq(t.token, token),
      eq(t.used, false),
      gt(t.expiresAt, new Date())
    )
  });

  if (!record) {
    return res.status(403).send('This link is invalid or has expired.');
  }

  // Mark used immediately to prevent replay
  await db.update(downloadTokens)
    .set({ used: true })
    .where(eq(downloadTokens.token, token));

  const filePath = path.join('/var/www/downloads/files', record.fileName);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found.');

  res.download(filePath);
});
```

### Caddy entry

If running as a separate app on port `3001`:
```
downloads.koshkikode.com {
    reverse_proxy localhost:3001
}
```

Or just add the `/download/:token` routes to the existing Unshelvd Express app
and serve everything from port 8080 — no extra Caddy entry needed.

---

## 10. Additional Websites

### Static site

```bash
mkdir -p /var/www/mysite
# drop HTML/CSS/JS files in there
```

Add to Caddyfile:
```
mysite.koshkikode.com {
    root * /var/www/mysite
    file_server
}
```

### Another Docker app

Add a new service in `docker-compose.yml` on a different internal port (e.g.
`3002`), then add to Caddyfile:
```
anotherapp.koshkikode.com {
    reverse_proxy localhost:3002
}
```

---

## 11. Caddy Config: Full Example

`/etc/caddy/Caddyfile`:

```
# Main landing / portfolio
koshkikode.com {
    root * /var/www/main
    file_server
}

www.koshkikode.com {
    redir https://koshkikode.com{uri} permanent
}

# Unshelvd marketplace (port 8080 per docker-compose.yml)
unshelvd.koshkikode.com {
    reverse_proxy localhost:8080
}

# Paywalled downloads
downloads.koshkikode.com {
    reverse_proxy localhost:3001
}
```

Caddy handles HTTPS for all of these automatically. After any edit:
```bash
caddy fmt --overwrite /etc/caddy/Caddyfile
systemctl reload caddy
```

---

## 12. Mobile (Android + iOS)

Unshelvd uses [Capacitor](https://capacitorjs.com/docs) to wrap the web app
in a native shell. See `MOBILE.md` and `CONNECTIVITY.md` in this repo for
app-specific details.

### Before building for production

Set `VITE_API_URL` in your environment before running the build:
```bash
VITE_TARGET=android VITE_API_URL=https://unshelvd.koshkikode.com npm run build
```

In `capacitor.config.ts`, the `server.url` block is for local dev only.
Remove or comment it out for production builds so the app uses the bundled
`dist/` folder.

### Android build

Prerequisites: [Android Studio](https://developer.android.com/studio), Java 17+

```bash
# Run on your dev machine, NOT the server
npm run build
npx cap sync android
npx cap open android
```

In Android Studio: **Build → Generate Signed Bundle/APK**.

### iOS build

Prerequisites: macOS, [Xcode](https://developer.apple.com/xcode/),
Apple Developer account ($99/yr for App Store)

```bash
VITE_TARGET=ios VITE_API_URL=https://unshelvd.koshkikode.com npm run build
npx cap sync ios
npx cap open ios
```

In Xcode: **Product → Archive → Distribute App**.

---

## 13. Backups

### Nightly database backup

```bash
nano /usr/local/bin/backup-db.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y-%m-%d)
mkdir -p /var/backups/db

# Dump from the running Postgres container
# Container name may vary — check with: docker ps
docker exec unshelvd-db-1 pg_dump -U unshelvd unshelvd | \
  gzip > /var/backups/db/unshelvd-$DATE.sql.gz

# Keep only last 14 days
find /var/backups/db -name "*.sql.gz" -mtime +14 -delete

echo "$(date): DB backup complete" >> /var/log/backup.log
```

```bash
chmod +x /usr/local/bin/backup-db.sh
crontab -e
# Add:
0 2 * * * /usr/local/bin/backup-db.sh
```

### File backups

For offsite backup of `/var/www/downloads/files/` use
[restic](https://restic.readthedocs.io) with
[Backblaze B2](https://www.backblaze.com/cloud-storage) (~$0.006/GB/month).
For a simple local backup to an external drive:
```bash
rsync -av /var/www/downloads/files/ /mnt/external/downloads-backup/
```

---

## 14. Maintenance Cheat Sheet

```bash
# SSH in
ssh dylan@192.168.1.50

# All running containers
docker ps

# Live app + DB logs
cd /var/www/unshelvd && docker compose logs -f

# Redeploy after code change
cd /var/www/unshelvd
git pull
docker compose up --build -d

# Run DB migrations after schema change
docker compose exec app npm run db:push

# Reload Caddy after config edit
caddy fmt --overwrite /etc/caddy/Caddyfile && systemctl reload caddy

# Caddy logs (SSL issues show here)
journalctl -u caddy -f

# Dynamic DNS log
tail -f /var/log/ddns.log

# DB backup log
tail -f /var/log/backup.log

# Disk usage
df -h

# RAM usage
free -h

# What’s listening on which ports
ss -tlnp
```

---

## 15. Quick Reference Links

| Resource | URL |
|---|---|
| Debian 12 Download | https://www.debian.org/distrib/netinst |
| Rufus (Windows USB flasher) | https://rufus.ie |
| Balena Etcher (Mac/Linux) | https://etcher.balena.io |
| PuTTY (SSH client, Windows) | https://www.putty.org |
| Docker Install (Debian) | https://docs.docker.com/engine/install/debian/ |
| Docker Compose Docs | https://docs.docker.com/compose/ |
| Caddy Install | https://caddyserver.com/docs/install |
| Caddy Caddyfile Reference | https://caddyserver.com/docs/caddyfile |
| Capacitor Docs | https://capacitorjs.com/docs |
| Android Studio | https://developer.android.com/studio |
| Xcode | https://developer.apple.com/xcode/ |
| AWS IAM Console | https://console.aws.amazon.com/iam/ |
| Route 53 Console | https://console.aws.amazon.com/route53/ |
| Amazon SES (email) | https://aws.amazon.com/ses/ |
| Stripe Dashboard | https://dashboard.stripe.com |
| restic Backup Tool | https://restic.readthedocs.io |
| Backblaze B2 | https://www.backblaze.com/cloud-storage |

---

*KoshkiKode LLC — Dylan Moore*
