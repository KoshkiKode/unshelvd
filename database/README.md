# Unshelv'd — Database Setup (PostgreSQL / Cloud SQL)

This folder contains the repo's database backup assets and setup scripts.

Current searchable SQL Connect target:
- Cloud SQL connection name: `unshelvd:us-central1:unshelvd-instance`
- PostgreSQL database: `unshelvd`

Local development still uses Docker (see `docker-compose.yml`).

---

## What's in this folder

| File | Purpose |
|------|---------|
| `schema.sql` | Archival SQL schema snapshot for baseline/manual restores |
| `seed-catalog.sql` | Archival idempotent SQL seed for `works` and `book_catalog` |
| `catalog.csv` | Catalog source data copy; `script/seed.js` falls back to this if `dataconnect/catalog.csv` is absent |
| `setup.sh` | Bash script (Linux / macOS) — runs the tracked migrations + full seed via `npm run db:setup` |
| `setup.ps1` | PowerShell script (Windows) — same as above |

Preferred source of truth for the current schema:
- `migrations/` plus `script/migrate.js`
- `shared/schema.ts` for the live application model

Preferred source of truth for searchable catalog seeding:
- `script/seed.js`, which prefers `dataconnect/catalog.csv`

Use `schema.sql` and `seed-catalog.sql` as archival SQL backups, not as the primary day-to-day bootstrap path.

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
./database/setup.sh --host "YOUR-DB-HOST" --username "unshelvd" --password "<YOUR_DB_PASSWORD>" --database "unshelvd"
```

---

## Option B — PowerShell script (Windows)

```powershell
.\database\setup.ps1 -Host "YOUR-DB-HOST" -Username "unshelvd" -Password "YourSecurePassword" -Database "unshelvd"
```

Both scripts will:
1. Install npm dependencies if needed
2. Run `npm run db:setup`
3. Apply tracked migrations and seed works, searchable catalog data, admin credentials, and demo users/books

The seed path prefers `dataconnect/catalog.csv`, then falls back to `database/catalog.csv`.

---

## Option C — Run Node.js scripts manually

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@YOUR-DB-HOST:5432/unshelvd"
npm run db:setup
```

On Windows (PowerShell):

```powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@YOUR-DB-HOST:5432/unshelvd"
npm run db:setup
```

If you only want migrations without reseeding:

```bash
npm run db:migrate:run
```

---

## Option D — Plain SQL files (pgAdmin / DBeaver / psql)

```bash
psql "postgresql://USER:PASSWORD@YOUR-DB-HOST:5432/unshelvd" -f database/schema.sql
psql "postgresql://USER:PASSWORD@YOUR-DB-HOST:5432/unshelvd" -f database/seed-catalog.sql
```

Both files are safe to re-run (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`).

This path restores only the baseline SQL assets. It does not reproduce the full Node-based bootstrap behavior such as admin credential rotation or the CSV-preferred catalog seed flow.

---

## Remote PostgreSQL / Amazon RDS

For the production AWS deployment, point `DATABASE_URL` at your Amazon RDS for PostgreSQL instance, or let the setup scripts build the connection string for you.

Example direct connection string:

```postgresql://unshelvd:<YOUR_DB_PASSWORD>@YOUR-RDS-ENDPOINT.rds.amazonaws.com:5432/unshelvd```

---

## Keeping the database backed up

Catalog backup assets live in `database/seed-catalog.sql` and `database/catalog.csv` **in this repo**.

To export a manual backup:

```bash
pg_dump "$DATABASE_URL" --no-owner --no-acl -f database/backup-$(date +%Y%m%d).sql
```

---

## Compatibility

The SQL in this folder is compatible with:

- **Amazon RDS for PostgreSQL** (production target)
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
| `Operation timed out` / connection timeout | Your machine cannot reach the Cloud SQL public IP. Verify the instance really has public IP `136.114.75.19`, and add your current public IP to Cloud SQL Authorized Networks before retrying. |
| `password authentication failed` | Double-check username/password |
| `database "unshelvd" does not exist` | Create it: `CREATE DATABASE unshelvd;` |
| `ENOTFOUND` / hostname not found | Paste the full endpoint URL, not just the hostname |
| `SSL SYSCALL error` | The scripts use `rejectUnauthorized: false` — Cloud SQL SSL should work automatically |
| Non-ASCII characters garbled | Ensure your PostgreSQL cluster uses UTF-8 encoding (default) |
