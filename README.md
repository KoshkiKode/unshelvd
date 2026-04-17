# Unshelv'd

**Where every book finds its next reader.**

A peer-to-peer book marketplace for every language, every country, every era. Buy, sell, trade, and discover books from fellow readers worldwide.

## What Makes It Different

- **150+ languages**, 30+ writing systems, 17 calendar systems
- **Historical nations**: Yugoslavia, USSR, Ottoman Empire, Austria-Hungary — recognized as countries of origin
- **Work-edition graph**: every book automatically linked to all its editions, translations, and printings
- **Book requests**: post what you're looking for, get matched with sellers
- **In-app payments** with escrow protection (Stripe Connect + PayPal)
- **35 UI languages**: top global languages with native labels and RTL support where needed

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Express.js, Passport.js (auth), Stripe Connect + PayPal (payments) |
| Database | PostgreSQL + Drizzle ORM |
| Desktop | Tauri v2 (optional — see [DESKTOP.md](./DESKTOP.md)) |
| Mobile | Capacitor (Android + iOS) |
| Hosting | Google Cloud Run + Cloud SQL |
| Catalog | Open Library API + proprietary database |

## Complete Local Setup (Web + API + Database + Admin + Mobile)

### 1) Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL)
- Python 3 (optional, for large catalog seeding)
- Android Studio (Android builds), and Xcode on macOS (iOS builds)

### 2) Start PostgreSQL

```bash
docker-compose up -d db
```

### 3) Configure environment

```bash
cp .env.example .env
```

In `.env` (project root), make sure these are set:

- `DATABASE_URL=postgresql://unshelvd:unshelvd_dev@localhost:5432/unshelvd`
- `SESSION_SECRET=<your-random-secret>`

Optional but recommended for predictable admin login:

- `ADMIN_USERNAME=admin`
- `ADMIN_EMAIL=admin@example.com`
- `ADMIN_PASSWORD=<generate-secure-password>`

Tip: generate a strong admin password with `openssl rand -base64 24`.

If admin vars are not set, `npm run db:seed` auto-generates admin credentials and prints them in the terminal.
Running the seed script again regenerates admin credentials and invalidates the previous admin password.
To preserve stable admin access across reseeds, set `ADMIN_USERNAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` before running `npm run db:seed`.

### 4) Install dependencies

```bash
npm install
```

### 5) Create all database tables

```bash
npm run db:push
```

This creates the full PostgreSQL schema used by the app (users, books, catalog, requests, messages, offers, transactions, platform settings, and works).

### 6) Seed full app data (admin + users + books + requests + catalog/work data)

```bash
npm run db:seed
```

This seeds:

- Admin account (created or rotated)
- Demo users
- Book listings
- Book requests
- Works and catalog entries

Optional larger catalog import:

```bash
npm run catalog:mass-seed:py
```

This pulls a much larger Open Library dataset (typically 12,000-15,000 catalog books, depending on Open Library response volume, deduplication, and temporary API throttling).
Expect ~5-10 minutes on a typical connection; completion is indicated when the command exits successfully and returns to your shell prompt.

### 7) Start the app

```bash
npm run dev
```

Open: `http://localhost:5000` (hash routes are used, for example `/#/login`).

---

## Log in to Admin (Website)

1. Open `http://localhost:5000/#/login`
2. Sign in with the admin email/password from `.env` (or from `npm run db:seed` output)
3. Open `http://localhost:5000/#/admin` (or use the **Admin** link in the navbar)

---

## Log in to Admin (Android / iOS App)

### Local emulator/simulator

```bash
npm run build
npx cap sync
npx cap open android   # or: npx cap open ios
```

- Run the app from Android Studio/Xcode
- Go to **Login** inside the app and sign in with the same admin credentials
- Open the **Admin** screen from the in-app navigation

By default for native local dev, the app API target is:

- Android emulator: `http://10.0.2.2:5000` (`10.0.2.2` is the emulator alias to your host machine's `localhost`)
- iOS simulator: `http://localhost:5000`

### Production mobile build

Set a reachable backend before building/syncing:

```bash
VITE_API_URL=https://your-api-domain npm run build
npx cap sync
```

Then sign in with your production admin account and open the admin screen from the app navigation.

## Deploy to Production

See [README-SETUP.md](./README-SETUP.md) for step-by-step instructions (Google Cloud Run, AWS ECS Fargate, or full GCP).

## Project Structure

```
unshelvd/
├── client/src/            # React frontend
│   ├── components/        # UI components (checkout, book cards, ads, navbar)
│   ├── hooks/             # Auth hook
│   ├── i18n/              # 10-language translations
│   ├── lib/               # Query client, constants (languages, countries, scripts)
│   └── pages/             # 20 pages (home, browse, catalog, book detail, work,
│                          #   dashboard, add book, messages, offers, requests,
│                          #   user profile, settings, about, admin, auth,
│                          #   terms, privacy, paypal return/cancel, not found)
├── server/                # Express backend
│   ├── index.ts           # Entry point, HTTP server, session, WebSocket
│   ├── routes.ts          # All API endpoints
│   ├── storage.ts         # Database queries (Drizzle)
│   ├── payments.ts        # Stripe Connect (charges, transfers, onboarding)
│   ├── paypal.ts          # PayPal orders + webhooks
│   ├── email.ts           # Transactional email (Nodemailer / SES)
│   ├── jobs.ts            # Background jobs (auto-complete, expire offers)
│   ├── work-resolver.ts   # Auto-links books to works via Open Library
│   ├── admin.ts           # Admin dashboard API
│   ├── security.ts        # Helmet, rate limiting, input sanitization
│   ├── platform-settings.ts # Runtime platform config (payments toggle, fees)
│   ├── seed.ts            # Initial data + admin account
│   ├── auto-seed.ts       # Startup seeder for works + catalog
│   └── catalog-import.ts  # Open Library bulk import
├── shared/                # Shared between frontend + backend
│   ├── schema.ts          # Drizzle schema (9 tables)
│   └── password-policy.ts # Unicode-aware password validation
├── database/              # SQL backups and setup scripts
├── migrations/            # Drizzle migration files
├── android/               # Capacitor Android project
├── ios/                   # Capacitor iOS project
├── scripts/               # Build scripts (Android, iOS, catalog seeder)
├── .github/workflows/     # CI: auto-build APK + verify iOS on every push
├── Dockerfile             # Production container
├── docker-compose.yml     # Local dev (PostgreSQL)
└── cloudbuild.yaml        # Google Cloud Build config
```

## Security

- All inputs validated with Zod schemas
- Parameterized queries (Drizzle ORM — no SQL injection)
- LIKE wildcards sanitized in search inputs
- Rate limiting: 10 auth attempts/15min, 5 payments/min, 100 API/min
- HTTP security headers (Helmet)
- bcrypt password hashing (12 rounds)
- Unicode-aware password policy (12+ chars, upper/lower/number/symbol, no name)
- Stripe webhook signature verification
- CORS restricted to known origins in production
- Admin endpoints require role check

## License

MIT
