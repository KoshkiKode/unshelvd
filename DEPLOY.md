# Unshelv'd — Deployment Guide (Single Source of Truth)

This is the only deployment instruction document for this repository.

## Production URL (canonical)

Use this URL everywhere production is required:

- `https://unshelvd.koshkikode.com/`

## What this guide deploys

- App runtime: Google Cloud Run
- Database: Google Cloud SQL (PostgreSQL)
- Container registry: Artifact Registry
- Secrets: Secret Manager
- DNS host: Route 53 (domain mapping only)

---

## 1) Prerequisites

Run each command exactly as shown.

```bash
node --version
```

```bash
npm --version
```

```bash
gcloud --version
```

```bash
docker --version
```

---

## 2) Clone, install, and verify locally

```bash
git clone https://github.com/KoshkiKode/unshelvd.git
```

```bash
cd unshelvd
```

```bash
npm install
```

```bash
npm run check
```

```bash
npm test
```

```bash
npm run build
```

---

## 3) Set shell variables (copy/paste)

Replace only `YOUR_GCP_PROJECT_ID` if needed.

```bash
export PROJECT_ID=YOUR_GCP_PROJECT_ID
```

```bash
export REGION=us-central1
```

```bash
export SERVICE_NAME=unshelvd
```

```bash
export REPO_NAME=unshelvd
```

```bash
export SQL_INSTANCE=unshelvd-db
```

```bash
export DOMAIN=unshelvd.koshkikode.com
```

---

## 4) Authenticate and configure Google Cloud

```bash
gcloud auth login
```

```bash
gcloud config set project "$PROJECT_ID"
```

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com monitoring.googleapis.com
```

---

## 5) Create infrastructure (one time)

```bash
gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location="$REGION" --description="Unshelv'd containers"
```

```bash
gcloud sql instances create "$SQL_INSTANCE" --database-version=POSTGRES_16 --tier=db-g1-small --region="$REGION" --storage-auto-increase --storage-size=20GB --root-password='CHANGE_ME_ROOT_PASSWORD'
```

```bash
gcloud sql databases create unshelvd --instance="$SQL_INSTANCE"
```

```bash
gcloud sql users create unshelvd --instance="$SQL_INSTANCE" --password='CHANGE_ME_DB_USER_PASSWORD'
```

```bash
gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)'
```

---

## 6) Create production secrets (where to paste each value)

### 6.1 Required app secrets

```bash
export CONNECTION_NAME="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')"
```

```bash
echo -n "postgresql://unshelvd:CHANGE_ME_DB_USER_PASSWORD@/unshelvd?host=/cloudsql/${CONNECTION_NAME}" | gcloud secrets create DATABASE_URL --replication-policy=automatic --data-file=-
```

```bash
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create SESSION_SECRET --replication-policy=automatic --data-file=-
```

### 6.2 Stripe keys (exact location in Stripe)

1. Open Stripe Dashboard: `https://dashboard.stripe.com/`
2. Go to **Developers → API keys**:
   - Copy **Secret key** (`sk_live_...`) → paste into `STRIPE_SECRET_KEY`
   - Copy **Publishable key** (`pk_live_...`) → use later in deploy command (`_STRIPE_PK`)
3. Go to **Developers → Webhooks**:
   - Click **Add endpoint**
   - Endpoint URL: `https://unshelvd.koshkikode.com/api/webhooks/stripe`
   - Events: `payment_intent.succeeded,payment_intent.payment_failed,account.updated,transfer.failed,charge.refunded`
   - Save, then copy **Signing secret** (`whsec_...`) → paste into `STRIPE_WEBHOOK_SECRET`

Paste Stripe secrets:

```bash
echo -n 'PASTE_STRIPE_SECRET_KEY_sk_live' | gcloud secrets create STRIPE_SECRET_KEY --replication-policy=automatic --data-file=-
```

```bash
echo -n 'PASTE_STRIPE_WEBHOOK_SECRET_whsec' | gcloud secrets create STRIPE_WEBHOOK_SECRET --replication-policy=automatic --data-file=-
```

### 6.3 Optional pinned admin credentials (recommended)

```bash
echo -n 'admin@koshkikode.com' | gcloud secrets create ADMIN_EMAIL --replication-policy=automatic --data-file=-
```

```bash
echo -n 'admin' | gcloud secrets create ADMIN_USERNAME --replication-policy=automatic --data-file=-
```

```bash
openssl rand -base64 24 | tr -d '\n' | gcloud secrets create ADMIN_PASSWORD --replication-policy=automatic --data-file=-
```

---

## 7) Grant IAM access for runtime + build

```bash
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
```

```bash
export COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
```

```bash
export CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
```

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${COMPUTE_SA}" --role="roles/cloudsql.client"
```

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${CLOUDBUILD_SA}" --role="roles/cloudsql.client"
```

```bash
gcloud iam service-accounts add-iam-policy-binding "$COMPUTE_SA" --member="serviceAccount:${CLOUDBUILD_SA}" --role="roles/iam.serviceAccountUser"
```

```bash
for SECRET in DATABASE_URL SESSION_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET ADMIN_EMAIL ADMIN_USERNAME ADMIN_PASSWORD; do gcloud secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:${COMPUTE_SA}" --role="roles/secretmanager.secretAccessor"; gcloud secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:${CLOUDBUILD_SA}" --role="roles/secretmanager.secretAccessor"; done
```

---

## 8) Deploy (copy/paste command)

This command builds, migrates, seeds, and deploys.

```bash
gcloud builds submit --config=cloudbuild.yaml --substitutions=_REGION="$REGION",_SERVICE_NAME="$SERVICE_NAME",_REPO="$REPO_NAME",_SQL_INSTANCE="$SQL_INSTANCE",_STRIPE_PK='PASTE_STRIPE_PUBLISHABLE_KEY_pk_live',_API_URL='https://unshelvd.koshkikode.com',_GCS_BUCKET=''
```

---

## 9) Map custom domain and Route 53 DNS

### 9.1 Create domain mapping in Cloud Run

```bash
gcloud run domain-mappings create --service="$SERVICE_NAME" --domain="$DOMAIN" --region="$REGION"
```

### 9.2 Add DNS records in Route 53

1. Open Route 53 → Hosted Zones → `koshkikode.com`
2. Create the records exactly as shown by:

```bash
gcloud run domain-mappings describe --domain="$DOMAIN" --region="$REGION"
```

3. Wait for SSL to become active (managed cert is automatic)

---

## 10) Set production URL variables in app/runtime

### 10.1 Public app URL for emails and redirects

Set in Cloud Run service env vars:

```bash
gcloud run services update "$SERVICE_NAME" --region="$REGION" --update-env-vars="PUBLIC_APP_URL=https://unshelvd.koshkikode.com"
```

### 10.2 Native app API URL

Always build native apps with:

```bash
VITE_API_URL=https://unshelvd.koshkikode.com npm run build
```

```bash
API_URL=https://unshelvd.koshkikode.com npm run cap:build:android
```

```bash
API_URL=https://unshelvd.koshkikode.com npm run cap:build:ios
```

---

## 11) Where Stripe secrets can be overridden in Unshelv'd admin

Runtime overrides are available in the app admin UI:

- Open `https://unshelvd.koshkikode.com/#/admin`
- Go to **Settings → Payments**
- Stripe fields there override deploy-time env values

Use this only for rotation/maintenance. Keep canonical production values in Secret Manager.

---

## 12) Verification checklist (after deploy)

```bash
curl -si https://unshelvd.koshkikode.com/api/health
```

```bash
curl -si https://unshelvd.koshkikode.com/
```

Confirm all of these:

- `https://unshelvd.koshkikode.com/` loads the web app
- `https://unshelvd.koshkikode.com/api/health` returns 200
- Stripe webhook endpoint is reachable and configured in Stripe
- Admin login works
- Native build uses `VITE_API_URL=https://unshelvd.koshkikode.com`

---

## 13) Re-deploy for updates

```bash
gcloud builds submit --config=cloudbuild.yaml --substitutions=_REGION="$REGION",_SERVICE_NAME="$SERVICE_NAME",_REPO="$REPO_NAME",_SQL_INSTANCE="$SQL_INSTANCE",_STRIPE_PK='PASTE_STRIPE_PUBLISHABLE_KEY_pk_live',_API_URL='https://unshelvd.koshkikode.com',_GCS_BUCKET=''
```

If Stripe keys rotate:

```bash
echo -n 'PASTE_NEW_sk_live' | gcloud secrets versions add STRIPE_SECRET_KEY --data-file=-
```

```bash
echo -n 'PASTE_NEW_whsec' | gcloud secrets versions add STRIPE_WEBHOOK_SECRET --data-file=-
```

---

## 14) Local `.env` note (non-production)

For local development, copy `.env.example` to `.env` and set values there.

Production secrets belong in Google Secret Manager (not in `.env` files, not in git).
