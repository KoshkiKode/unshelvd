# Contributing to Unshelv'd

See the [organisation-level contributing guide](https://github.com/KoshkiKode/.github/blob/main/.github/CONTRIBUTING.md) for branch naming, commit message conventions, PR guidelines, and code of conduct.

This file covers Unshelv'd-specific setup and conventions.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [npm](https://www.npmjs.com/) v10+
- [PostgreSQL](https://www.postgresql.org/) 16+ (or Docker)
- [Docker](https://www.docker.com/) + [Docker Compose](https://docs.docker.com/compose/) (recommended for local DB)

## Local Development

```bash
# Install dependencies
npm install

# Copy environment template and fill in values
cp .env.example .env

# Start the database (Docker)
docker compose up -d db

# Run database migrations
npm run db:migrate

# Start the dev server (frontend + backend together)
npm run dev
```

The app will be available at `http://localhost:5173` (frontend) and `http://localhost:3000` (API).

## Running Tests

```bash
# Unit + integration tests
npm run test

# Watch mode
npm run test:watch
```

## Code Style

- **Formatter:** Prettier (config in repo root)
- **Linter:** ESLint
- Run both before committing: `npm run lint && npm run format`
- CI will reject PRs that fail lint or format checks

## Project Structure

```
client/       React frontend (Vite + TypeScript)
server/       Express.js backend
shared/       Types and utilities shared between client and server
database/     Drizzle ORM schema and migrations
migrations/   Generated migration files
scripts/      Dev and maintenance scripts
tests/        Test suites
```

## Database Migrations

```bash
# Generate a new migration after schema changes
npm run db:generate

# Apply migrations
npm run db:migrate

# Open Drizzle Studio (GUI)
npm run db:studio
```

Never edit migration files by hand. Always generate them via `npm run db:generate`.

## Mobile (Capacitor)

See `MOBILE.md` for building the Android and iOS apps.

## Desktop (Tauri)

See `DESKTOP.md` for building the desktop app.

## Key Conventions

- All API routes go in `server/routes/`
- All database schema changes go through Drizzle migrations — never raw SQL on production
- Keep client-side and server-side types in `shared/` so they stay in sync
- Payment-related code (Stripe, PayPal) is in `server/payments/` — treat it with extra care and always add tests
- Secrets and API keys go in `.env` only — never committed
