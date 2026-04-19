# Unshelv'd — Database Setup (PostgreSQL / AlloyDB)

All the files you need to create and restore the Unshelv'd database are in this folder.

The production database runs on **AlloyDB for PostgreSQL** (Google Cloud).
Local development uses **Docker** (see `docker-compose.yml`).

---

## What's in this folder

| File | Purpose |
|------|---------|
| `schema.sql` | `CREATE TABLE IF NOT EXISTS` — all 9 tables |
| `seed-catalog.sql` | `INSERT … ON CONFLICT DO NOTHING` — 25 works + 53 catalog editions (multi-language) |
| `setup.sh` | Bash script (Linux / macOS) — runs migrations + full seed via Node.js |
| `setup.ps1` | PowerShell script (Windows) — same as above |

> **These SQL files are the authoritative backup of the database structure and initial data.**  
> Any time the database instance is recreated or reset, run `schema.sql` then `seed-catalog.sql` to restore it.

---

## Local development (Docker)

Start a local PostgreSQL instance via Docker Compose:

```bash
docker-compose up -d db
```

Set your `.env`:

```
DATABASE_URL=postgresql://unshelvd:unshelvd_dev@localhost:5432/unshelvd
```

---

## Option A — Bash script (Linux / macOS)

```bash
chmod +x database/setup.sh
./database/setup.sh --host "YOUR-DB-HOST" --username "unshelvd" --password "CHANGE_ME_PASSWORD" --database "unshelvd"
```

---

## Option B — PowerShell script (Windows)

```powershell
.\database\setup.ps1 -Host "YOUR-DB-HOST" -Username "unshelvd" -Password "YourSecurePassword" -Database "unshelvd"
```

Both scripts will:
1. Install npm dependencies if needed
2. Run migrations (creates all 9 tables via `script/migrate.js`)
3. Run the full seed (adds works, catalog entries, and demo users/books via `script/seed.js`)

---

## Option C — Run Node.js scripts manually

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@YOUR-DB-HOST:5432/unshelvd"
node script/migrate.js
node script/seed.js
```

On Windows (PowerShell):

```powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@YOUR-DB-HOST:5432/unshelvd"
node script\migrate.js
node script\seed.js
```

---

## Option D — Plain SQL files (pgAdmin / DBeaver / psql)

```bash
psql "postgresql://USER:PASSWORD@YOUR-DB-HOST:5432/unshelvd" -f database/schema.sql
psql "postgresql://USER:PASSWORD@YOUR-DB-HOST:5432/unshelvd" -f database/seed-catalog.sql
```

Both files are safe to re-run (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`).

---

## Production (AlloyDB)

For production deployment, follow the full walkthrough in [DEPLOY.md](../DEPLOY.md).

The production `DATABASE_URL` connects via the AlloyDB private IP (accessed through a Serverless VPC Access connector):

```
postgresql://unshelvd:CHANGE_ME_PASSWORD@ALLOYDB_PRIVATE_IP:5432/unshelvd
```

This connection string is stored in Google Secret Manager as `DATABASE_URL`.

---

## Keeping the database backed up

The catalog data lives in `database/seed-catalog.sql` **in this repo** — always backed up as long as code is pushed to GitHub.

For **user-generated data** (listings, messages, offers, transactions), use AlloyDB automated backups:

```bash
gcloud alloydb backups create unshelvd-backup-$(date +%Y%m%d) --cluster=unshelvd-db --region=us-central1
```

To export a manual backup:

```bash
pg_dump "$DATABASE_URL" --no-owner --no-acl -f database/backup-$(date +%Y%m%d).sql
```

---

## Compatibility

The SQL in this folder is compatible with:

- **AlloyDB for PostgreSQL** (production target)
- **Standard PostgreSQL 13+** (local dev)

Key choices:
- Uses `serial` for auto-increment (portable)
- Uses `real` for numeric columns (portable)
- Uses `timestamp` (matches Drizzle ORM schema)
- `ON CONFLICT DO NOTHING` (standard ANSI SQL)
- No proprietary syntax
- Non-ASCII characters (Cyrillic, Japanese, Hebrew, etc.) stored as UTF-8

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `connection refused` | Check firewall/security settings allow port 5432 from your IP |
| `password authentication failed` | Double-check username/password |
| `database "unshelvd" does not exist` | Create it: `CREATE DATABASE unshelvd;` |
| `ENOTFOUND` / hostname not found | Paste the full endpoint URL, not just the hostname |
| `SSL SYSCALL error` | The scripts use `rejectUnauthorized: false` — Cloud SQL SSL should work automatically |
| Non-ASCII characters garbled | Ensure your PostgreSQL cluster uses UTF-8 encoding (default) |
