# Unshelv'd — Database Setup (Amazon Aurora / PostgreSQL)

All the files you need to create and restore the Unshelv'd database on **Amazon Aurora PostgreSQL** (or any PostgreSQL-compatible database) are in this folder.

---

## What's in this folder

| File | Purpose |
|------|---------|
| `schema.sql` | `CREATE TABLE IF NOT EXISTS` — all 8 tables |
| `seed-catalog.sql` | `INSERT … ON CONFLICT DO NOTHING` — 25 works + 53 catalog editions (multi-language) |
| `setup.sh` | Bash script (Linux / macOS) — runs migrations + full seed via Node.js |
| `setup.ps1` | PowerShell script (Windows) — same as above |

> **These SQL files are the authoritative backup of the database structure and initial data.**  
> Any time the Aurora instance is recreated or reset, run `schema.sql` then `seed-catalog.sql` to restore it.

---

## Storage cost: GitHub vs cloud storage

The SQL seed files in this folder are the most important asset to keep backed up.  
Here's a quick cost comparison at today's sizes:

| Storage tier | Current size | Monthly cost |
|---|---|---|
| **GitHub (this repo)** | ~60 KB of SQL | **Free** — GitHub free tier allows repos up to 1 GB, with no charge for the files themselves |
| **AWS S3 (Standard)** | ~60 KB | ~$0.000001/month (essentially free at this size) |
| **Amazon Aurora (running DB)** | Minimum ~10 GB allocated | **~$0.10/GB/month** for Aurora I/O-Optimized storage = ~$1/month minimum |
| **Amazon Aurora Serverless v2** | Scales to 0 ACUs when idle | ~$0.12/ACU-hour + storage; idle cost ≈ $0–$5/month |
| **Google Cloud SQL (Cloud Run)** | Minimum ~10 GB | ~$0.17/GB/month = ~$1.70/month minimum |

**Recommendation:**
- Keep the schema + seed SQL files **in this GitHub repo** — it's free and zero-maintenance.
- The Aurora/Cloud SQL instance is the *live* database. When it gets deleted or reset, re-run the setup script to restore structure and catalog data.
- User-generated content (listings, messages, offers) cannot be stored in static SQL files. For that, set up **automated Aurora snapshots** (daily, 7-day retention) which cost ~$0.021/GB/month on AWS.

---

## Prerequisites

1. **Node.js** installed → [nodejs.org](https://nodejs.org)
2. An **Amazon Aurora PostgreSQL** cluster (or regular RDS/Cloud SQL PostgreSQL) with:
   - A database named `unshelvd` (or your choice)
   - A user with full privileges on that database
   - Security group / firewall inbound rule allowing port **5432** from your IP

> **Aurora endpoint format:**  
> `your-cluster.cluster-abc123.us-east-1.rds.amazonaws.com`  
> Found in the AWS Console → RDS → Clusters → your cluster → **Writer endpoint**.

---

## Option A — Bash script (Linux / macOS — recommended)

```bash
chmod +x database/setup.sh
./database/setup.sh \
  --host     "your-cluster.cluster-abc123.us-east-1.rds.amazonaws.com" \
  --username "unshelvd" \
  --password "YourSecurePassword" \
  --database "unshelvd"
```

---

## Option B — PowerShell script (Windows — recommended)

Open PowerShell in the root of this repo:

```powershell
.\database\setup.ps1 `
  -Host     "your-cluster.cluster-abc123.us-east-1.rds.amazonaws.com" `
  -Username "unshelvd" `
  -Password "YourSecurePassword" `
  -Database "unshelvd"
```

Both scripts will:
1. Install npm dependencies if needed
2. Run migrations (creates all 8 tables via `script/migrate.js`)
3. Run the full seed (adds works, catalog entries, and demo users/books via `script/seed.js`)

---

## Option C — Run the Node.js scripts manually

```bash
# Set your connection string
export DATABASE_URL="postgresql://USER:PASSWORD@YOUR-AURORA-ENDPOINT:5432/unshelvd"

# 1. Create tables
node script/migrate.js

# 2. Seed data
node script/seed.js
```

On Windows (PowerShell):
```powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@YOUR-AURORA-ENDPOINT:5432/unshelvd"
node script\migrate.js
node script\seed.js
```

---

## Option D — Plain SQL files (pgAdmin / DBeaver / psql)

If you prefer a GUI tool or already have `psql` installed, connect to Aurora and run:

```bash
# Create tables
psql "postgresql://USER:PASSWORD@YOUR-ENDPOINT:5432/unshelvd" -f database/schema.sql

# Seed initial catalog data
psql "postgresql://USER:PASSWORD@YOUR-ENDPOINT:5432/unshelvd" -f database/seed-catalog.sql
```

Both files are safe to re-run (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`).

---

## Aurora compatibility notes

The SQL in this folder is 100% compatible with:
- **Amazon Aurora PostgreSQL** (all versions)
- **Amazon RDS PostgreSQL**
- **Google Cloud SQL for PostgreSQL**
- **Standard PostgreSQL 13+**

Key compatibility choices made:
- Uses `serial` (not `IDENTITY`) for auto-increment — supported by Aurora PostgreSQL
- Uses `real` (not `float4`) for numeric columns — portable
- Uses `timestamp` (not `timestamptz`) — matches the Drizzle ORM schema
- `ON CONFLICT DO NOTHING` — standard ANSI SQL, supported everywhere
- No Aurora-specific syntax (no `aurora_*` functions, no MySQL dialect)
- Non-ASCII characters (Cyrillic, Japanese, Hebrew, etc.) are stored as UTF-8; Aurora PostgreSQL uses UTF-8 by default

---

## Setting up Amazon Aurora (quick steps)

1. **AWS Console → RDS → Create database**
   - Engine: Aurora (PostgreSQL-compatible) or PostgreSQL
   - Template: Free tier / Dev/Test
   - DB cluster identifier: `unshelvd-db`
   - Master username: `unshelvd`
   - Master password: (choose a strong one)
   - Initial database name: `unshelvd`

2. **Security Group** — add an inbound rule:
   - Type: PostgreSQL
   - Port: 5432
   - Source: My IP (or your office/VPC CIDR)

3. **Copy the endpoint** from the cluster details page (Writer endpoint).

4. **Run the setup script** with that endpoint.

---

## Your `.env` file

After setup, create `.env` in the project root (copy from `.env.example`):

```
DATABASE_URL=postgresql://unshelvd:YourPassword@your-cluster.cluster-abc123.us-east-1.rds.amazonaws.com:5432/unshelvd
SESSION_SECRET=change-me-to-a-random-string
PORT=8080
```

---

## Keeping the database backed up

Because the catalog data lives in `database/seed-catalog.sql` **in this repo**, it is always backed up as long as code is pushed to GitHub.

For **user-generated data** (listings, messages, offers, transactions), set up:
- **AWS RDS Automated Backups** — enabled by default, keeps snapshots for 7 days
- **Manual snapshot** before destructive operations: AWS Console → RDS → Clusters → Actions → Take snapshot

To export the live database to a SQL file (for archiving):
```bash
pg_dump "$DATABASE_URL" --no-owner --no-acl -f database/backup-$(date +%Y%m%d).sql
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `connection refused` | Check Security Group inbound rule allows port 5432 from your IP |
| `password authentication failed` | Double-check username/password in Aurora |
| `database "unshelvd" does not exist` | Create it: `CREATE DATABASE unshelvd;` in pgAdmin |
| `ENOTFOUND` / hostname not found | Paste the full endpoint URL, not just the cluster name |
| `SSL SYSCALL error` | The scripts use `rejectUnauthorized: false` — Aurora SSL should work automatically |
| Non-ASCII characters garbled | Ensure your Aurora cluster uses UTF-8 encoding (default for new clusters) |
