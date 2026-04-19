# Unshelv'd — Deployment Guide

This is the single deployment reference for this repository.

## Production URL (canonical)

```
https://unshelvd.koshkikode.com/
```

---

## Stack

| Service | Role |
|---------|------|
| **Cloud Build** | CI/CD — builds image, runs migrations, deploys |
| **Artifact Registry** | Docker image storage |
| **Cloud Run** | Backend API + WebSocket server |
| **AlloyDB** | PostgreSQL-compatible managed database |
| **Serverless VPC Access** | Private connectivity: Cloud Run → AlloyDB |
| **Secret Manager** | Runtime secrets (database URL, session key, Stripe) |
| **Cloud Storage** | Profile image uploads |
| **Firebase Hosting** | SPA CDN, custom domain (`unshelvd.koshkikode.com`), managed SSL |
| **Cloud Monitoring** | Uptime checks, log-based alerting |
| **Cloud Logging** | Structured application logs |
| **Route 53** | DNS host for `koshkikode.com` (external — domain management only) |

### Request routing

```
Route 53 → Firebase Hosting (unshelvd.koshkikode.com)
              │
              ├── /          → SPA static files (CDN cache)
              ├── /api/**    → Cloud Run (rewrite proxy — HTTP only)
              └── /ws        → ⚠️  NOT proxied (see §11 — WebSocket)
                                   Use Cloud Run URL directly for WebSocket
```

---

## 1. Prerequisites

```bash
node --version
```
Expected: Node.js 20+

```bash
npm --version
```
Expected: npm 10+

```bash
gcloud --version
```
Expected: Google Cloud CLI (latest stable)

```bash
docker --version
```
Expected: Docker Engine 24+

```bash
firebase --version
```
Expected: Firebase CLI 13+ — install with: `npm install -g firebase-tools`

---

## 2. Clone, install, and verify locally

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

## 3. Set shell variables (copy/paste once per session)

Replace only `YOUR_GCP_PROJECT_ID`.

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
export ALLOYDB_CLUSTER=unshelvd-db
```

```bash
export ALLOYDB_INSTANCE=unshelvd-primary
```

```bash
export VPC_CONNECTOR=unshelvd-connector
```

```bash
export DOMAIN=unshelvd.koshkikode.com
```

---

## 4. Authenticate and configure Google Cloud

```bash
gcloud auth login
```

```bash
gcloud config set project "$PROJECT_ID"
```

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  alloydb.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  vpcaccess.googleapis.com \
  servicenetworking.googleapis.com \
  storage.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  firebase.googleapis.com \
  firebasehosting.googleapis.com \
  iam.googleapis.com
```

---

## 5. Firebase project setup (one time)

Link your Google Cloud project to Firebase (required for Firebase Hosting).

```bash
firebase login
```

```bash
firebase projects:addfirebase "$PROJECT_ID"
```

```bash
firebase use "$PROJECT_ID"
```

Create `firebase.json` in the project root (copy/paste exactly):

```json
{
  "hosting": {
    "public": "dist/public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "unshelvd",
          "region": "us-central1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "/assets/**",
        "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
      }
    ]
  }
}
```

> **Note — WebSocket:** Firebase Hosting does not proxy WebSocket upgrade requests.
> The `/ws` endpoint must connect directly to the Cloud Run URL.
> See §11 for the full WebSocket setup.

Initialize Firebase Hosting (answer prompts: use existing project, public dir = `dist/public`, SPA = yes, no GitHub action overwrite):

```bash
firebase init hosting
```

---

## 6. Artifact Registry (one time)

```bash
gcloud artifacts repositories create "$REPO_NAME" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Unshelv'd containers"
```

---

## 7. AlloyDB — database (one time)

### 7.1 Allocate a private IP range for AlloyDB

```bash
gcloud compute addresses create google-managed-services-default \
  --global \
  --purpose=VPC_PEERING \
  --prefix-length=16 \
  --network=default
```

```bash
gcloud services vpc-peerings connect \
  --service=servicenetworking.googleapis.com \
  --ranges=google-managed-services-default \
  --network=default \
  --project="$PROJECT_ID"
```

### 7.2 Create the AlloyDB cluster

```bash
gcloud alloydb clusters create "$ALLOYDB_CLUSTER" \
  --region="$REGION" \
  --network=default \
  --password='CHANGE_ME_ALLOYDB_ADMIN_PASSWORD'
```

### 7.3 Create the primary instance (takes ~5 minutes)

```bash
gcloud alloydb instances create "$ALLOYDB_INSTANCE" \
  --cluster="$ALLOYDB_CLUSTER" \
  --region="$REGION" \
  --instance-type=PRIMARY \
  --cpu-count=2
```

### 7.4 Get the AlloyDB private IP

```bash
gcloud alloydb instances describe "$ALLOYDB_INSTANCE" \
  --cluster="$ALLOYDB_CLUSTER" \
  --region="$REGION" \
  --format='value(ipAddress)'
```

Save the output — you need it for the `DATABASE_URL` secret in §9.

> The default admin user for AlloyDB is `postgres`. Create a dedicated
> `unshelvd` user by connecting to the instance and running SQL:
>
> ```sql
> CREATE USER unshelvd WITH PASSWORD 'CHANGE_ME_DB_USER_PASSWORD';
> CREATE DATABASE unshelvd OWNER unshelvd;
> GRANT ALL PRIVILEGES ON DATABASE unshelvd TO unshelvd;
> ```

### 7.5 Create the Serverless VPC Access connector

This allows Cloud Run services and jobs to reach AlloyDB's private IP.

```bash
gcloud compute networks vpc-access connectors create "$VPC_CONNECTOR" \
  --region="$REGION" \
  --network=default \
  --range=10.8.0.0/28
```

---

## 8. IAM roles (one time)

```bash
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
```

```bash
export COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
```

```bash
export CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
```

Grant Cloud Run the AlloyDB client role:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/alloydb.client"
```

Grant Cloud Build the AlloyDB client role (needed for migrate/seed jobs):

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/alloydb.client"
```

Allow Cloud Build to deploy Cloud Run as the Compute service account:

```bash
gcloud iam service-accounts add-iam-policy-binding "$COMPUTE_SA" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/iam.serviceAccountUser"
```

Grant both SAs access to the VPC connector:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/vpcaccess.user"
```

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/vpcaccess.user"
```

---

## 9. Secrets (one time)

First, save your AlloyDB private IP and DB user password as shell variables (using the IP from §7.4):

```bash
export ALLOYDB_IP=PASTE_ALLOYDB_PRIVATE_IP_FROM_ABOVE
```

```bash
export DB_PASSWORD=CHANGE_ME_DB_USER_PASSWORD
```

### 9.1 Database URL

```bash
echo -n "postgresql://unshelvd:${DB_PASSWORD}@${ALLOYDB_IP}:5432/unshelvd" | \
  gcloud secrets create DATABASE_URL --replication-policy=automatic --data-file=-
```

### 9.2 Session secret

```bash
openssl rand -hex 32 | tr -d '\n' | \
  gcloud secrets create SESSION_SECRET --replication-policy=automatic --data-file=-
```

### 9.3 Stripe keys (where to find each value)

1. Open `https://dashboard.stripe.com/`
2. Go to **Developers → API keys**:
   - **Secret key** (`sk_live_...`) → paste as `STRIPE_SECRET_KEY`
   - **Publishable key** (`pk_live_...`) → used in the deploy command in §13 (`_STRIPE_PK`)
3. Go to **Developers → Webhooks → Add endpoint**:
   - Endpoint URL: `https://unshelvd.koshkikode.com/api/webhooks/stripe`
   - Events: `payment_intent.succeeded,payment_intent.payment_failed,account.updated,transfer.failed,charge.refunded`
   - Save, copy **Signing secret** (`whsec_...`) → paste as `STRIPE_WEBHOOK_SECRET`

```bash
echo -n 'PASTE_sk_live_SECRET_KEY' | \
  gcloud secrets create STRIPE_SECRET_KEY --replication-policy=automatic --data-file=-
```

```bash
echo -n 'PASTE_whsec_WEBHOOK_SECRET' | \
  gcloud secrets create STRIPE_WEBHOOK_SECRET --replication-policy=automatic --data-file=-
```

### 9.4 Admin credentials (optional — recommended)

```bash
echo -n 'admin@koshkikode.com' | \
  gcloud secrets create ADMIN_EMAIL --replication-policy=automatic --data-file=-
```

```bash
echo -n 'admin' | \
  gcloud secrets create ADMIN_USERNAME --replication-policy=automatic --data-file=-
```

```bash
openssl rand -base64 24 | tr -d '\n' | \
  gcloud secrets create ADMIN_PASSWORD --replication-policy=automatic --data-file=-
```

### 9.5 Grant Secret Manager access to both service accounts

```bash
for SECRET in DATABASE_URL SESSION_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET ADMIN_EMAIL ADMIN_USERNAME ADMIN_PASSWORD; do
  gcloud secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:${COMPUTE_SA}" --role="roles/secretmanager.secretAccessor"
  gcloud secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:${CLOUDBUILD_SA}" --role="roles/secretmanager.secretAccessor"
done
```

---

## 10. Cloud Storage — profile images (optional)

Skip this section to run in data-URI fallback mode (not recommended for production).

```bash
gsutil mb -l "$REGION" "gs://${PROJECT_ID}-unshelvd-uploads"
```

```bash
gcloud storage buckets add-iam-policy-binding "gs://${PROJECT_ID}-unshelvd-uploads" \
  --member=allUsers \
  --role=roles/storage.objectViewer
```

```bash
gcloud storage buckets add-iam-policy-binding "gs://${PROJECT_ID}-unshelvd-uploads" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role=roles/storage.objectCreator
```

---

## 11. WebSocket — direct Cloud Run URL

Firebase Hosting does not proxy WebSocket upgrade requests (`101 Switching Protocols`).
The `/ws` endpoint on this app must connect directly to the Cloud Run service.

**After your first deploy (§13)**, get the Cloud Run URL:

```bash
gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --format='value(status.url)'
```

Pass it as `_WS_URL` in all deploy commands.
The client uses `VITE_WS_URL` to connect WebSocket directly to the Cloud Run URL.

> **Alternative — dedicated API subdomain:**
> Map `api.unshelvd.koshkikode.com` directly to Cloud Run (§15 variant),
> and have Firebase Hosting `/api/**` rewrite point to that subdomain instead.
> This gives WebSocket a stable clean URL (`wss://api.unshelvd.koshkikode.com/ws`).

---

## 12. Update `cloudbuild.yaml` for AlloyDB + Firebase Hosting

The existing `cloudbuild.yaml` targets Cloud SQL. For AlloyDB + Firebase Hosting it needs three changes:

1. **Replace** `--set-cloudsql-instances` with `--set-env-vars=NODE_ENV=production,GCS_BUCKET_NAME=...` and add `--vpc-connector` flag in the Cloud Run deploy step.
2. **Add** `--vpc-connector="${VPC_CONNECTOR}"` to the migrate and seed jobs.
3. **Add** a Firebase Hosting deploy step after the Cloud Run deploy:

```yaml
  # 6. Build frontend and deploy to Firebase Hosting
  - name: 'node:20-alpine'
    entrypoint: 'sh'
    env:
      - 'VITE_API_URL=${_API_URL}'
      - 'VITE_WS_URL=${_WS_URL}'
      - 'VITE_STRIPE_PUBLISHABLE_KEY=${_STRIPE_PK}'
      - 'VITE_THRIFTBOOKS_AFF_ID=${_THRIFTBOOKS_AFF_ID}'
      - 'VITE_ADSENSE_CLIENT=${_ADSENSE_CLIENT}'
    args:
      - '-c'
      - 'npm ci && SKIP_ENV_VERIFY=true npm run build'

  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        npm install -g firebase-tools
        firebase deploy --only hosting --project=$PROJECT_ID --token "$(gcloud auth print-access-token)"
```

> Add `_WS_URL` to the substitutions block with the Cloud Run URL after first deploy.

---

## 13. First deploy

This command builds, migrates, seeds, and deploys the backend to Cloud Run.
Run it before §14 (Firebase Hosting deploy) on first setup.

Replace `_WS_URL` with your Cloud Run URL after you know it (leave blank on first run).

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_REGION="$REGION",_SERVICE_NAME="$SERVICE_NAME",_REPO="$REPO_NAME",_SQL_INSTANCE="$ALLOYDB_CLUSTER",_STRIPE_PK='PASTE_pk_live_PUBLISHABLE_KEY',_API_URL='https://unshelvd.koshkikode.com',_WS_URL='',_GCS_BUCKET="${PROJECT_ID}-unshelvd-uploads"
```

After the deploy, get the Cloud Run URL and run again with `_WS_URL` set:

```bash
export CLOUDRUN_URL="$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(status.url)')"
```

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_REGION="$REGION",_SERVICE_NAME="$SERVICE_NAME",_REPO="$REPO_NAME",_SQL_INSTANCE="$ALLOYDB_CLUSTER",_STRIPE_PK='PASTE_pk_live_PUBLISHABLE_KEY',_API_URL='https://unshelvd.koshkikode.com',_WS_URL="$CLOUDRUN_URL",_GCS_BUCKET="${PROJECT_ID}-unshelvd-uploads"
```

---

## 14. Deploy frontend to Firebase Hosting

Build the frontend and deploy:

```bash
VITE_API_URL=https://unshelvd.koshkikode.com VITE_WS_URL="$CLOUDRUN_URL" SKIP_ENV_VERIFY=true npm run build
```

```bash
firebase deploy --only hosting
```

---

## 15. Custom domain — Firebase Hosting + Route 53 DNS

### 15.1 Add custom domain in Firebase Hosting

```bash
firebase hosting:sites:create unshelvd
```

Open the Firebase Console → **Hosting → Add custom domain** → enter `unshelvd.koshkikode.com`.

Firebase will display DNS records to verify ownership and point the domain.

### 15.2 Add DNS records in Route 53

1. Open Route 53 → Hosted Zones → `koshkikode.com`
2. Add exactly the records Firebase shows (typically):
   - **TXT** record for domain ownership verification
   - **A** records (two IPs) for the apex domain `unshelvd.koshkikode.com`
   - **CNAME** `www.unshelvd.koshkikode.com` → Firebase-provided target (if using `www`)

3. Wait for DNS propagation (usually under 10 minutes for Route 53)
4. Firebase provisions a managed SSL certificate automatically

---

## 16. Set up Cloud Build trigger (auto-deploy on push)

```bash
gcloud builds triggers create github \
  --repo-name=unshelvd \
  --repo-owner=KoshkiKode \
  --branch-pattern='^main$' \
  --build-config=cloudbuild.yaml \
  --substitutions=_REGION="${REGION}",_SERVICE_NAME="${SERVICE_NAME}",_REPO="${REPO_NAME}",_SQL_INSTANCE="${ALLOYDB_CLUSTER}",_STRIPE_PK='PASTE_pk_live_PUBLISHABLE_KEY',_API_URL='https://unshelvd.koshkikode.com',_WS_URL="${CLOUDRUN_URL}",_GCS_BUCKET="${PROJECT_ID}-unshelvd-uploads" \
  --name=deploy-on-push-to-main
```

Connect the GitHub repository in the Cloud Build console at `https://console.cloud.google.com/cloud-build/triggers` if not already connected.

---

## 17. Cloud Monitoring — uptime checks and alerting

### 17.1 Create an uptime check

```bash
gcloud monitoring uptime-checks create \
  --display-name="Unshelv'd health check" \
  --http-check-path="/api/health" \
  --http-check-port=443 \
  --http-check-use-ssl \
  --resource=uptime_url \
  --http-check-host="$DOMAIN" \
  --period=60s \
  --timeout=10s
```

### 17.2 Create a notification channel (email)

```bash
gcloud beta monitoring channels create \
  --display-name="Unshelv'd alerts" \
  --type=email \
  --channel-labels=email_address=admin@koshkikode.com
```

### 17.3 View logs in Cloud Logging

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME}" \
  --limit=50 \
  --format='table(timestamp, severity, textPayload)'
```

All `console.log` / `console.error` output from the app is automatically captured in Cloud Logging.

---

## 18. Verification checklist (after deploy)

```bash
curl -si https://unshelvd.koshkikode.com/api/health
```

```bash
curl -si https://unshelvd.koshkikode.com/
```

Confirm all of these:

- [ ] `https://unshelvd.koshkikode.com/` loads the SPA (served from Firebase Hosting CDN)
- [ ] `https://unshelvd.koshkikode.com/api/health` returns 200 (proxied to Cloud Run)
- [ ] Stripe webhook endpoint is configured in Stripe Dashboard
- [ ] Admin login works at `https://unshelvd.koshkikode.com/#/admin`
- [ ] Profile image upload works (if GCS bucket is configured)
- [ ] Firebase Hosting SSL certificate is active (green padlock in browser)
- [ ] Cloud Monitoring uptime check is green in the console

---

## 19. Native app builds

Always build native apps pointing to the production server:

```bash
VITE_API_URL=https://unshelvd.koshkikode.com VITE_WS_URL="$CLOUDRUN_URL" npm run build
```

```bash
API_URL=https://unshelvd.koshkikode.com npm run cap:build:android
```

```bash
API_URL=https://unshelvd.koshkikode.com npm run cap:build:ios
```

---

## 20. Re-deploy (updates)

### Backend + frontend (full deploy via Cloud Build)

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_REGION="$REGION",_SERVICE_NAME="$SERVICE_NAME",_REPO="$REPO_NAME",_SQL_INSTANCE="$ALLOYDB_CLUSTER",_STRIPE_PK='PASTE_pk_live_PUBLISHABLE_KEY',_API_URL='https://unshelvd.koshkikode.com',_WS_URL="$CLOUDRUN_URL",_GCS_BUCKET="${PROJECT_ID}-unshelvd-uploads"
```

### Frontend only (Firebase Hosting)

```bash
VITE_API_URL=https://unshelvd.koshkikode.com VITE_WS_URL="$CLOUDRUN_URL" SKIP_ENV_VERIFY=true npm run build
```

```bash
firebase deploy --only hosting
```

### Rotate secrets

```bash
echo -n 'PASTE_NEW_sk_live' | gcloud secrets versions add STRIPE_SECRET_KEY --data-file=-
```

```bash
echo -n 'PASTE_NEW_whsec' | gcloud secrets versions add STRIPE_WEBHOOK_SECRET --data-file=-
```

```bash
openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add SESSION_SECRET --data-file=-
```

---

## 21. Runtime admin overrides (Stripe, PayPal, Email)

The admin panel provides runtime overrides without a redeploy:

- Open `https://unshelvd.koshkikode.com/#/admin`
- **Settings → Payments** — override Stripe and PayPal keys
- **Settings → Email** — configure SMTP host, port, user, password

> Keep canonical production values in Secret Manager.
> Use admin panel overrides only for rotation or temporary changes.

---

## 22. Local development (`docker-compose`)

```bash
docker-compose up -d
```

The `docker-compose.yml` starts a local PostgreSQL instance on port 5432.
Set `DATABASE_URL=postgresql://unshelvd:unshelvd_dev@localhost:5432/unshelvd` in your `.env`.

Full reference: `.env.example` in the project root.
