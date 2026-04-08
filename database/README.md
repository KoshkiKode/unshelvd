# Unshelv'd — Database Setup (Amazon Aurora / Windows)

All the files you need to create the Unshelv'd database on **Amazon Aurora PostgreSQL** from your Windows laptop are in this folder.

---

## What's in this folder

| File | Purpose |
|------|---------|
| `schema.sql` | CREATE TABLE statements — creates all 8 tables |
| `seed-catalog.sql` | INSERT statements — seeds 25 works + 45 book catalog entries |
| `setup.ps1` | PowerShell script — runs migrations + full seed via Node.js |

---

## Prerequisites

1. **Node.js** installed on your laptop → [nodejs.org](https://nodejs.org)
2. An **Amazon Aurora PostgreSQL** cluster (or regular RDS PostgreSQL) with:
   - A database named `unshelvd` (or whatever you prefer)
   - A user/password with full privileges on that database
   - The security group **inbound rule** allows your laptop's IP on port **5432**

> **Aurora endpoint format:**
> `your-cluster.cluster-abc123.us-east-1.rds.amazonaws.com`  
> You find this in the AWS Console → RDS → Clusters → your cluster → **Writer endpoint**.

---

## Option A — PowerShell setup script (recommended)

Open PowerShell in the root of this repo:

```powershell
.\database\setup.ps1 `
  -Host     "your-cluster.cluster-abc123.us-east-1.rds.amazonaws.com" `
  -Username "unshelvd" `
  -Password "YourSecurePassword" `
  -Database "unshelvd"
```

This will:
1. Install npm dependencies if needed
2. Run migrations (creates all tables)
3. Run the full seed (adds sample users, books, and the catalog)

---

## Option B — Run the Node.js scripts manually

```powershell
# Set your connection string
$env:DATABASE_URL = "postgresql://USER:PASSWORD@YOUR-AURORA-ENDPOINT:5432/unshelvd"

# 1. Create tables
node script\migrate.js

# 2. Seed data
node script\seed.js
```

---

## Option C — Plain SQL files (pgAdmin / DBeaver / psql)

If you prefer a GUI tool or already have `psql` installed, connect to Aurora and run:

```
-- In pgAdmin query window, or:
psql "postgresql://USER:PASSWORD@YOUR-ENDPOINT:5432/unshelvd" -f database\schema.sql
psql "postgresql://USER:PASSWORD@YOUR-ENDPOINT:5432/unshelvd" -f database\seed-catalog.sql
```

Both files are safe to re-run (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`).

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
   - Source: My IP (or your office CIDR)

3. **Copy the endpoint** from the cluster details page (Writer endpoint).

4. **Run this setup script** with that endpoint.

---

## Your `.env` file

After setup, create `.env` in the project root (copy from `.env.example`):

```
DATABASE_URL=postgresql://unshelvd:YourPassword@your-cluster.cluster-abc123.us-east-1.rds.amazonaws.com:5432/unshelvd
SESSION_SECRET=change-me-to-a-random-string
PORT=8080
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
