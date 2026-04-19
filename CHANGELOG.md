# Changelog

All notable changes to Unshelv'd are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [1.0.0] — 2026-04-13

### Added
- **Peer-to-peer book marketplace** — list, browse, buy, sell, and trade books worldwide
- **150+ language support** with 30+ writing systems and 17 calendar systems
- **Historical nations** — Yugoslavia, USSR, Ottoman Empire, Austria-Hungary, and more as countries of origin
- **Work–edition graph** — every listing automatically linked to all its editions, translations, and printings via Open Library
- **Book requests** — post what you are looking for; sellers are notified when a matching listing appears
- **Stripe Connect escrow payments** — buyer pays upfront; funds released to seller only after delivery is confirmed; automatic platform fee
- **PayPal payments** — optional PayPal checkout flow (authorization + capture model) as an alternative to Stripe
- **Transactional email** — password resets, offer notifications, shipping updates, delivery confirmations via Nodemailer / SMTP
- **35 UI languages** — top global languages with native labels and RTL support where needed
- **Admin dashboard** — user management, dispute resolution, platform settings (fees, maintenance mode, payment toggles), catalog seeding
- **Rating system** — buyers and sellers can rate each other after each completed transaction
- **Dispute resolution** — buyers can open disputes; admins can issue refunds or release funds to sellers
- **Background jobs** — auto-complete shipped transactions after 14 days, expire stale offers after 7 days, cancel abandoned checkouts after 72 hours; PostgreSQL advisory locks prevent duplicate runs across Cloud Run instances
- **Android app** — Capacitor 8; CI builds a debug APK on every push
- **iOS app** — Capacitor 8; CI verifies the build on every push (archiving requires macOS)
- **Desktop app guide** — Tauri v2 setup instructions (see [DESKTOP.md](./DESKTOP.md))
- **Unicode-aware password policy** — 12+ characters, upper/lower/number/symbol, rejects passwords that contain the user's name or username
- **PostgreSQL-backed rate limiting** — enforced across all Cloud Run instances; auth (10/15 min), payments (5/min), API (100/min), search (20/min); dedicated limiters skip the general API counter to avoid double-counting
- **HTTP security headers** — Helmet with production CSP, CORS restricted to known origins
- **Work-resolver** — automatically links new book listings to Open Library works and updates edition/language/listing counts

### Changed
- n/a (initial release)

### Fixed
- Rate-limit overlap: the general `/api/*` limiter now skips routes that have dedicated limiters (`/api/auth/*`, `/api/search/*`, `/api/payments/checkout`) so limit headers and counters are accurate

### Security
- All inputs validated with Zod schemas
- Parameterized queries via Drizzle ORM (no raw SQL injection vectors)
- LIKE wildcards sanitized before embedding in database queries
- bcrypt password hashing (12 rounds)
- Stripe webhook signature verification (`constructEvent`)
- PayPal webhook signature verification (HTTPS cert + HMAC)
- HTML stripped from free-text inputs before storage

[1.0.0]: https://github.com/KoshkiKode/unshelvd/releases/tag/v1.0.0
