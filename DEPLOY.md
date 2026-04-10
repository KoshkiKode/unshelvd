# Unshelv'd — Google Cloud Run Deployment Guide

This guide takes you from a blank GCP project to a live deployment of Unshelv'd
on Cloud Run with Cloud SQL (PostgreSQL 16).

**No manual database steps are needed after the first-time setup below.**
Every subsequent deploy (`gcloud builds submit`) will automatically:
1. Build and push the Docker image
2. Apply any new schema migrations (via a Cloud Run Job)
3. Seed the catalog if the database is empty (idempotent — never overwrites data)
4. Deploy the new container to Cloud Run

---

## Prerequisites

```bash
# Install the gcloud CLI: https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
export PROJECT_ID=$(gcloud config get-value project)
export REGION=us-central1

# Enable required APIs (one-time)
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com
```

---

## First-Time Infrastructure Setup

### 1. Cloud SQL instance

```bash
# Create a PostgreSQL 16 instance (~$7/month on db-f1-micro)
gcloud sql instances create unshelvd-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=$REGION \
  --root-password=CHOOSE_A_ROOT_PASSWORD

# Create the database
gcloud sql databases create unshelvd --instance=unshelvd-db

# Create an application user
gcloud sql users create unshelvd \
  --instance=unshelvd-db \
  --password=CHOOSE_A_USER_PASSWORD
```

### 2. Artifact Registry repository

```bash
gcloud artifacts repositories create unshelvd \
  --repository-format=docker \
  --location=$REGION
```

### 3. Secrets in Secret Manager

```bash
# Build the Cloud SQL socket-path connection string
DB_URL="postgresql://unshelvd:USER_PASSWORD@/unshelvd?host=/cloudsql/${PROJECT_ID}:${REGION}:unshelvd-db"

# Store DATABASE_URL (first time)
echo -n "$DB_URL" | gcloud secrets create DATABASE_URL \
  --replication-policy=automatic --data-file=-

# Store SESSION_SECRET (first time)
echo -n "$(openssl rand -hex 32)" | gcloud secrets create SESSION_SECRET \
  --replication-policy=automatic --data-file=-

# Grant the Cloud Build and Cloud Run service account access to both secrets.
# Find your project number first:
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

for SA in \
  "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  "${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"; do
  for SECRET in DATABASE_URL SESSION_SECRET; do
    gcloud secrets add-iam-policy-binding $SECRET \
      --member="serviceAccount:${SA}" \
      --role="roles/secretmanager.secretAccessor"
  done
done

# Also grant Cloud Run the Cloud SQL Client role so it can connect via the proxy
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/cloudsql.client"
```

### 4. Bootstrap the database (first time only)

This step initialises the PostgreSQL schemas so Drizzle migrations can run.
**Skip this on any re-deploy — the bootstrap script is now idempotent but it is
only needed once.**

```bash
# Run bootstrap via a one-off Cloud Run Job
gcloud run jobs deploy unshelvd-bootstrap \
  --image=gcr.io/google-appengine/debian9 \
  --command=bash \
  --args="-c,apt-get update -qq && apt-get install -y nodejs npm && npm ci && node script/bootstrap.js" \
  --region=$REGION \
  --set-cloudsql-instances=${PROJECT_ID}:${REGION}:unshelvd-db \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest \
  --execute-now --wait
```

> **Alternative (simpler):** connect to the database with `psql` and run:
> ```sql
> GRANT ALL ON SCHEMA public TO public;
> ```
> That is typically all that is needed for a fresh Cloud SQL instance.

---

## Deploy

Every deploy (including the first one) is a single command:

```bash
gcloud builds submit --config=cloudbuild.yaml
```

This will:
- Build the Docker image (with migrations pre-generated inside)
- Push it to Artifact Registry
- Run the `unshelvd-migrate` Cloud Run Job → applies schema migrations
- Run the `unshelvd-seed` Cloud Run Job → populates 126 works + catalog if empty
- Deploy the Cloud Run service

### Override defaults

```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_REGION=us-east1,_SQL_INSTANCE=my-db,_MEMORY=1Gi,_MAX_INSTANCES=5
```

All substitution variables and their defaults are documented at the top of
`cloudbuild.yaml`.

---

## Update Secrets

```bash
# Rotate SESSION_SECRET
echo -n "$(openssl rand -hex 32)" | gcloud secrets versions add SESSION_SECRET --data-file=-

# Update DATABASE_URL (e.g. after changing DB password)
echo -n "NEW_URL" | gcloud secrets versions add DATABASE_URL --data-file=-
```

---

## Optional: Stripe Integration

Add your Stripe keys as additional secrets and pass them to Cloud Run:

```bash
echo -n "sk_live_..." | gcloud secrets create STRIPE_SECRET_KEY \
  --replication-policy=automatic --data-file=-

echo -n "whsec_..." | gcloud secrets create STRIPE_WEBHOOK_SECRET \
  --replication-policy=automatic --data-file=-
```

Then add to the `--set-secrets` flag in step 5 of `cloudbuild.yaml`:
```
--set-secrets=DATABASE_URL=DATABASE_URL:latest,SESSION_SECRET=SESSION_SECRET:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest
```

---

## Local Development

```bash
# Start PostgreSQL via Docker
docker-compose up -d db

# Install and configure
cp .env.example .env   # fill in DATABASE_URL
npm install

# Push schema and seed
npm run db:push
npm run db:seed

# Start dev server
npm run dev
```

---

## Troubleshooting

### Cold start timeout on first deploy
Cloud Run terminates containers that don't bind to `PORT` within ~240 seconds.
Migrations run synchronously before `listen()`, so a very slow Cloud SQL connection
can cause this. Check that:
- The `--set-cloudsql-instances` flag uses the correct `PROJECT:REGION:INSTANCE` format.
- The service account has the `roles/cloudsql.client` IAM role.

### "schema already exists" migration error
The migration is non-fatal — the server will still start. If you see it on a fresh
database, run `node script/bootstrap.js` first (see First-Time Setup step 4).

### Seed job skipped / catalog is empty
The seed job only runs if `works` and `book_catalog` are empty. If the tables have
data from a previous (bad) seed, connect with `psql` and run:
```sql
TRUNCATE works CASCADE;
TRUNCATE book_catalog;
```
Then trigger the seed job manually:
```bash
gcloud run jobs execute unshelvd-seed --region=$REGION --wait
```

### View logs
```bash
# Service logs
gcloud run services logs read unshelvd --region=$REGION --limit=100

# Migration job logs
gcloud run jobs executions list --job=unshelvd-migrate --region=$REGION
```
