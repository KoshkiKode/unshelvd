# Contributing to Unshelv'd

Thank you for your interest in Unshelv'd. This guide covers how to set up a local development environment, the coding standards we follow, and how to submit changes.

## Table of Contents

- [Getting Started](#getting-started)
- [Full Stack Setup](#full-stack-setup)
- [Running Tests](#running-tests)
- [Code Style](#code-style)
- [Mobile & Desktop Builds](#mobile--desktop-builds)
- [Branch & Commit Conventions](#branch--commit-conventions)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Issues](#reporting-issues)

---

## Getting Started

**Prerequisites:**
- Node.js 20+
- Docker & Docker Compose
- `npm` (or `pnpm` — both work)

```bash
git clone https://github.com/KoshkiKode/unshelvd.git
cd unshelvd
npm install
cp .env.example .env   # fill in your local values
```

The `.env.example` file documents every required variable with descriptions.

---

## Full Stack Setup

### 1. Start the database

```bash
docker-compose up -d
```

This starts PostgreSQL. The default credentials match `.env.example`.

### 2. Run migrations

```bash
npm run db:migrate
```

Optionally seed with sample data:

```bash
npm run db:seed
```

### 3. Start the dev server

```bash
npm run dev
```

This starts both the Express API and the Vite frontend concurrently. The web app runs at `http://localhost:5173` by default.

---

## Running Tests

```bash
npm test          # run all tests with vitest
npm run test:ui   # vitest UI mode
```

Tests live in `tests/`. Please add or update tests for any behaviour you change.

---

## Code Style

- **TypeScript** — strict mode is on. Do not disable type checks with `@ts-ignore` without a comment explaining why.
- **Formatting** — Prettier is configured. Run `npm run format` before committing.
- **Linting** — ESLint is configured. Run `npm run lint` and fix all errors before pushing.
- **Imports** — use path aliases (`@/`) defined in `tsconfig.json` rather than relative `../../` chains.
- **Drizzle ORM** — schema lives in `database/`. Add new migrations with `npm run db:generate` after changing the schema.

---

## Mobile & Desktop Builds

See [MOBILE.md](./MOBILE.md) for Android/iOS build instructions via Capacitor.

See [DESKTOP.md](./DESKTOP.md) for the optional Tauri desktop build.

---

## Branch & Commit Conventions

**Branch naming:**

```
feat/short-description
fix/short-description
chore/short-description
docs/short-description
```

**Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add RTL support for Arabic listings
fix: correct escrow release timing on mobile
chore: update drizzle-orm to 0.31
docs: clarify DEPLOY.md Caddy config
```

---

## Submitting a Pull Request

1. Fork the repo and create your branch from `main`.
2. Make your changes with tests where applicable.
3. Run `npm run lint && npm run format && npm test` — all must pass.
4. Open a PR against `main` and fill in the PR template.
5. Link the relevant issue in the PR description.

PRs that change core business logic (escrow, payments, i18n, auth) require extra care — please describe your change thoroughly and include manual testing notes.

---

## Reporting Issues

Use the issue templates:
- **Bug report** — for unexpected behaviour
- **Feature request** — for new ideas

For security vulnerabilities, see [SECURITY.md](./SECURITY.md) — **do not** open a public issue.
