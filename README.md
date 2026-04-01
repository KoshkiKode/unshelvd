# Unshelv'd

**Where every book finds its next reader.**

A Depop-style peer-to-peer book marketplace. Buy, sell, trade, and discover books from fellow readers.

## Features

- **Buy & Sell Books** — List books with photos, conditions, and prices
- **5 Book Statuses** — For Sale, Not For Sale, Open to Offers, Wishlist, Reading
- **Book Requests** — Post what you're looking for (specific editions, ISBNs, etc.)
- **Make Offers** — Negotiate prices on "Open to Offers" listings
- **User Shelves** — Browse anyone's personal library by category
- **In-App Messaging** — Chat with buyers and sellers
- **Dark Mode** — Warm espresso dark theme

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Express.js, Passport.js (auth) |
| Database | PostgreSQL + Drizzle ORM |
| Desktop | Tauri v2 (Windows, macOS, Linux) |
| Mobile | Capacitor (Android, iOS) |
| Hosting | Google Cloud Run + Cloud SQL |

## Quick Start

```bash
# Start PostgreSQL (via Docker)
docker-compose up -d db

# Install dependencies
cp .env.example .env
npm install

# Set up database
npm run db:push
npm run db:seed

# Start dev server
npm run dev
```

Open http://localhost:5000

## Deployment

See [DEPLOY.md](./DEPLOY.md) for Google Cloud Run deployment instructions.

## Cross-Platform

- **Mobile:** See [MOBILE.md](./MOBILE.md) for Capacitor setup (Android/iOS)
- **Desktop:** See [DESKTOP.md](./DESKTOP.md) for Tauri setup (Windows/macOS/Linux)

## Project Structure

```
unshelvd/
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── hooks/       # Custom hooks (auth, etc.)
│   │   ├── pages/       # Route pages
│   │   └── lib/         # Utilities
│   └── index.html
├── server/              # Express backend
│   ├── routes.ts        # API endpoints
│   ├── storage.ts       # Database operations
│   └── seed.ts          # Sample data
├── shared/
│   └── schema.ts        # Drizzle schema + Zod validation
├── Dockerfile
├── docker-compose.yml
├── cloudbuild.yaml      # Google Cloud Build
└── capacitor.config.ts  # Mobile app config
```

## License

MIT
