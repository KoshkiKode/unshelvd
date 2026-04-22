#!/usr/bin/env bash
# ============================================================
# Unshelv'd — Linux / macOS Setup Script
# Cloud SQL / PostgreSQL-compatible database bootstrap
#
# Runs database migrations (creates tables) then seeds catalog data.
# Requires Node.js to be installed.
#
# USAGE:
#   cd /path/to/unshelvd
#   chmod +x database/setup.sh
#   ./database/setup.sh \
#     --host     "your-postgres-host" \
#     --username "unshelvd" \
#     --password "YourPassword" \
#     --database "unshelvd"
#
# Or set DATABASE_URL yourself before running:
#   export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/unshelvd"
#   ./database/setup.sh
# ============================================================

set -euo pipefail

DB_HOST=""
DB_USER=""
DB_PASS=""
DB_NAME="unshelvd"
DB_PORT=5432

# ── Parse arguments ──────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --host)     DB_HOST="$2"; shift 2 ;;
    --username) DB_USER="$2"; shift 2 ;;
    --password) DB_PASS="$2"; shift 2 ;;
    --database) DB_NAME="$2"; shift 2 ;;
    --port)     DB_PORT="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

# ── Build DATABASE_URL if not already set ────────────────────
if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -z "$DB_HOST" || -z "$DB_USER" || -z "$DB_PASS" ]]; then
    echo ""
    echo "ERROR: Provide connection details either as arguments or via DATABASE_URL." >&2
    echo ""
    echo "Example:"
    echo '  ./database/setup.sh --host "your-postgres-host" --username "unshelvd" --password "YourPass"'
    echo ""
    echo "Or set it manually:"
    echo '  export DATABASE_URL="postgresql://USER:PASS@HOST:5432/unshelvd"'
    echo '  ./database/setup.sh'
    exit 1
  fi
  export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo ""
echo "============================================"
echo " Unshelv'd — Database Setup"
echo "============================================"
echo ""

# ── Check Node.js is available ──────────────────────────────
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found. Install from https://nodejs.org" >&2
  exit 1
fi

# ── Check npm dependencies are installed ────────────────────
if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
  echo "Installing npm dependencies..."
  (cd "${ROOT_DIR}" && npm install)
fi

# ── Step 1: Run migrations + seed searchable catalog data ───
echo "Step 1/1 — Running migrations and seeding searchable catalog data..."
(cd "${ROOT_DIR}" && npm run db:setup)

echo ""
echo "============================================"
echo " Database setup complete!"
echo "============================================"
echo ""
echo "Your PostgreSQL database is ready for Unshelv'd and Firebase SQL Connect search. Set this in your .env:"
echo "  DATABASE_URL=${DATABASE_URL}"
echo ""
