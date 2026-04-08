# ============================================================
# Unshelv'd — Windows PowerShell Setup Script
# Amazon Aurora PostgreSQL
#
# Runs database migrations (creates tables) then seeds catalog data.
# Requires Node.js to be installed.
#
# USAGE — open PowerShell and run:
#   cd path\to\unshelvd
#   .\database\setup.ps1 -Host "your-cluster.cluster-abc123.us-east-1.rds.amazonaws.com" `
#                         -Username "unshelvd" `
#                         -Password "YourPassword" `
#                         -Database "unshelvd"
#
# Or set DATABASE_URL yourself before running:
#   $env:DATABASE_URL = "postgresql://USER:PASSWORD@HOST:5432/unshelvd"
#   .\database\setup.ps1
# ============================================================

param(
    [string]$Host,
    [string]$Username,
    [string]$Password,
    [string]$Database = "unshelvd",
    [int]$Port = 5432
)

# ── Build DATABASE_URL from parameters if not already set ──
if (-not $env:DATABASE_URL) {
    if (-not $Host -or -not $Username -or -not $Password) {
        Write-Host ""
        Write-Host "ERROR: Provide connection details either as parameters or via `$env:DATABASE_URL." -ForegroundColor Red
        Write-Host ""
        Write-Host "Example:" -ForegroundColor Yellow
        Write-Host '  .\database\setup.ps1 -Host "your-cluster.us-east-1.rds.amazonaws.com" -Username "unshelvd" -Password "YourPass"' -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Or set it manually:" -ForegroundColor Yellow
        Write-Host '  $env:DATABASE_URL = "postgresql://USER:PASS@HOST:5432/unshelvd"' -ForegroundColor Yellow
        Write-Host '  .\database\setup.ps1' -ForegroundColor Yellow
        exit 1
    }
    $env:DATABASE_URL = "postgresql://${Username}:${Password}@${Host}:${Port}/${Database}"
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Unshelv'd — Database Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Check Node.js is available ──────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# ── Check npm dependencies are installed ────────────────────
$scriptDir = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path "$scriptDir\node_modules")) {
    Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
    Push-Location $scriptDir
    npm install
    Pop-Location
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: npm install failed." -ForegroundColor Red
        exit 1
    }
}

# ── Step 1: Run migrations (CREATE TABLE) ───────────────────
Write-Host "Step 1/2 — Running migrations (creating tables)..." -ForegroundColor Yellow
node "$scriptDir\script\migrate.js"
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Migration failed. Check your DATABASE_URL and Aurora connectivity." -ForegroundColor Red
    Write-Host "  - Make sure Aurora allows connections from your IP (Security Group inbound rule)" -ForegroundColor Yellow
    Write-Host "  - Verify the endpoint, username, password, and database name" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# ── Step 2: Seed catalog data ────────────────────────────────
Write-Host "Step 2/2 — Seeding catalog and demo data..." -ForegroundColor Yellow
node "$scriptDir\script\seed.js"
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Seeding failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Database setup complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Your Aurora database is ready. Set this in your .env:" -ForegroundColor Cyan
Write-Host "  DATABASE_URL=$env:DATABASE_URL" -ForegroundColor White
Write-Host ""
