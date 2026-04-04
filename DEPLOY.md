# Unshelv'd — Deployment Guide

## Local Development

### Quick Start (with Docker)

```bash
# Start PostgreSQL
docker-compose up -d db

# Copy env and install
cp .env.example .env
npm install

# Push schema to database
npm run db:push

# Seed with sample data
npm run db:seed

# Start dev server
npm run dev
```

### Without Docker

Install PostgreSQL locally, create a database called `unshelvd`, and set
`DATABASE_URL` in `.env`.

---

## Google Cloud Deployment

### 1. Set Up Google Cloud Project

```bash
# Install gcloud CLI: https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com
```

### 2. Create Cloud SQL PostgreSQL Instance

```bash
# Create a PostgreSQL 16 instance (smallest tier, good for MVP)
gcloud sql instances create unshelvd-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --root-password=YOUR_SECURE_PASSWORD

# Create the database
gcloud sql databases create unshelvd --instance=unshelvd-db

# Create a user
gcloud sql users create unshelvd \
  --instance=unshelvd-db \
  --password=YOUR_USER_PASSWORD
```

**Cost estimate:** db-f1-micro is ~$7-10/month. Within your $300 free credits.

### 3. Create Artifact Registry

```bash
gcloud artifacts repositories create unshelvd \
  --repository-format=docker \
  --location=us-central1
```

### 4. Store secrets in Secret Manager

Cloud Run reads `DATABASE_URL` and `SESSION_SECRET` from Secret Manager at runtime
(via `--set-secrets` in the deploy command).  Store them once before your first deploy:

```bash
# Build the Cloud SQL socket-path DATABASE_URL
# Format: postgresql://USER:PASSWORD@/DB_NAME?host=/cloudsql/PROJECT:REGION:INSTANCE
DB_URL="postgresql://unshelvd:YOUR_USER_PASSWORD@/unshelvd?host=/cloudsql/YOUR_PROJECT_ID:us-central1:unshelvd-db"

# Create secrets (first time only)
echo -n "$DB_URL" | gcloud secrets create DATABASE_URL \
  --replication-policy=automatic --data-file=-

echo -n "$(openssl rand -hex 32)" | gcloud secrets create SESSION_SECRET \
  --replication-policy=automatic --data-file=-

# Grant Cloud Run's service account access to read the secrets
# (replace PROJECT_NUMBER with yours: gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding DATABASE_URL \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding SESSION_SECRET \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

To update a secret later:
```bash
echo -n "NEW_VALUE" | gcloud secrets versions add DATABASE_URL --data-file=-
```

### 5. Deploy

```bash
# Build and deploy (uses cloudbuild.yaml — secrets are injected at runtime)
gcloud builds submit --config=cloudbuild.yaml

# Push the schema (run once after first deploy, or after migrations)
DATABASE_URL="$DB_URL" npm run db:push

# Seed initial data (optional)
DATABASE_URL="$DB_URL" npm run db:seed
```

### 6. Custom Domain (Optional)

```bash
gcloud run domain-mappings create \
  --service=unshelvd \
  --region=us-central1 \
  --domain=your-domain.com
```

---

## Cost Breakdown (Google Cloud Free Credits)

| Service | Estimated Monthly Cost |
|---------|----------------------|
| Cloud Run (scales to zero) | $0-5 (pay per request) |
| Cloud SQL (db-f1-micro) | $7-10 |
| Artifact Registry | < $1 |
| Cloud Build | Free tier (120 min/day) |
| **Total** | **~$10-15/month** |

With $300 in credits expiring end of June 2026, you have ~3 months of runway
at this cost, with plenty left over for scaling up.

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser   │────▶│  Cloud Run   │────▶│  Cloud SQL   │
│  (React)    │◀────│  (Express)   │◀────│ (PostgreSQL) │
└─────────────┘     └──────────────┘     └──────────────┘
                           │
                    ┌──────┴──────┐
                    │  Scales 0-3 │
                    │  instances  │
                    └─────────────┘
```
