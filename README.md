# Unshelv'd

**Where every book finds its next reader.**

A peer-to-peer book marketplace for every language, every country, every era. Buy, sell, trade, and discover books from fellow readers worldwide.

## What Makes It Different

- **150+ languages**, 30+ writing systems, 17 calendar systems
- **Historical nations**: Yugoslavia, USSR, Ottoman Empire, Austria-Hungary — recognized as countries of origin
- **Work-edition graph**: every book automatically linked to all its editions, translations, and printings
- **Book requests**: post what you're looking for, get matched with sellers
- **In-app payments** with escrow protection (Stripe Connect)
- **10 UI languages**: English, Spanish, French, German, Portuguese, Russian, Chinese, Japanese, Korean, Arabic (RTL)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Express.js, Passport.js (auth), Stripe Connect (payments) |
| Database | PostgreSQL + Drizzle ORM |
| Desktop | Tauri v2 |
| Mobile | Capacitor (Android + iOS) |
| Hosting | Google Cloud Run + Cloud SQL |
| Catalog | Open Library API + proprietary database |

## Quick Start

```bash
# Start PostgreSQL
docker-compose up -d db

# Install + configure
cp .env.example .env
npm install

# Set up database
npm run db:push
npm run db:seed          # Creates admin + demo data (save the admin credentials!)

# Populate book catalog (~12,000 books)
python3 scripts/seed-catalog.py

# Start dev server
npm run dev
```

Open http://localhost:5000

## Build for Mobile

```bash
npm run build:apk        # Android debug APK
npm run build:ios         # Opens Xcode (macOS only)
```

## Deploy to Google Cloud

See [DEPLOY.md](./DEPLOY.md) for step-by-step instructions.

## Project Structure

```
unshelvd/
├── client/src/            # React frontend
│   ├── components/        # UI components (checkout, book cards, ads, navbar)
│   ├── hooks/             # Auth hook
│   ├── i18n/              # 10-language translations
│   ├── lib/               # Query client, constants (languages, countries, scripts)
│   └── pages/             # 13 pages (home, browse, book detail, work, dashboard,
│                          #   add book, messages, offers, requests, profile,
│                          #   about, admin, auth)
├── server/                # Express backend
│   ├── routes.ts          # All API endpoints
│   ├── storage.ts         # Database queries (Drizzle)
│   ├── payments.ts        # Stripe Connect (charges, transfers, onboarding)
│   ├── work-resolver.ts   # Auto-links books to works via Open Library
│   ├── admin.ts           # Admin dashboard API
│   ├── security.ts        # Helmet, rate limiting, input sanitization
│   ├── seed.ts            # Initial data + admin account
│   └── catalog-import.ts  # Open Library bulk import
├── shared/                # Shared between frontend + backend
│   ├── schema.ts          # Drizzle schema (8 tables)
│   └── password-policy.ts # Unicode-aware password validation
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
