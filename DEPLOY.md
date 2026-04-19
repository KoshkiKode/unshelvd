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
Route 53 (DNS) → Firebase Hosting (unshelvd.koshkikode.com)
                    │
                    ├── /          → SPA static files (Firebase global CDN)
                    └── /api/**    → Cloud Run (rewrite proxy, us-central1)
```

### Why Firebase Hosting + Cloud Run (not Cloud Run alone)

Unshelv'd is a global peer-to-peer marketplace. The two services serve completely different workloads and pricing models:

| Traffic type | Served by | Cost model |
|---|---|---|
| SPA shell, JS/CSS bundles, images | Firebase Hosting CDN | ~free (10 GB/month free egress on Blaze) |
| API calls — listings, auth, Stripe | Cloud Run | Pay per request + CPU |

**What this means in practice:**
- A user in Tokyo, Lagos, or São Paulo gets the frontend from the nearest Firebase CDN edge node — no latency penalty, no Cloud Run cold start, no egress charge.
- Cloud Run only receives actual API traffic. Browse-heavy usage (users scrolling listings) costs virtually nothing on the backend.
- Cloud Run runs in a single region (`us-central1`). Without Firebase CDN in front, every page load would hit that one region from wherever the user is. Firebase makes the app feel fast worldwide without paying for multi-region Cloud Run.

**Route 53 role:** Route 53 is the authoritative DNS host for `koshkikode.com` (the domain is registered/managed there). It delegates to Firebase Hosting via A records — it does not proxy traffic. All actual request handling is Firebase → Cloud Run.

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

> **Note — Firebase Hosting rewrites HTTP only.** The `/api/**` rewrite proxy handles
> all REST API calls. This is sufficient for the current app which uses standard HTTP.

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
# Use a strong random password. Store it securely (e.g., in a password manager)
# then use it again when creating the DATABASE_URL secret in §9.
gcloud alloydb clusters create "$ALLOYDB_CLUSTER" \
  --region="$REGION" \
  --network=default \
  --password="$(openssl rand -base64 24 | tr -d '=+/')"
```

> **Tip:** The command above generates a random admin password. Record it somewhere
> safe — you will not need it at runtime (the app connects as the `unshelvd` user),
> but you will need it if you ever connect manually as `postgres`.

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

## 11. `cloudbuild.yaml` — AlloyDB VPC connector + Firebase Hosting

`cloudbuild.yaml` in this repository is already configured for AlloyDB and Firebase Hosting:

- All three steps (migrate job, seed job, Cloud Run service deploy) use `--vpc-connector=${_VPC_CONNECTOR}` and `--vpc-egress=private-ranges-only` so that Cloud Run reaches AlloyDB's private IP through the Serverless VPC Access connector created in §7.5.
- `DATABASE_URL` in Secret Manager must be the AlloyDB TCP connection string (`postgresql://user:pass@PRIVATE_IP:5432/db`), not a Cloud SQL socket path.
- The Vite frontend is built into `dist/public` and deployed to Firebase Hosting separately (§14). Firebase Hosting rewrites `/api/**` to the Cloud Run service — so the web app and native apps both use `https://unshelvd.koshkikode.com` as their single endpoint.

**Admin account is created automatically on the first deploy.** The seed job prints the generated username, email, and password to Cloud Logging once. On every subsequent deploy the seed job is a no-op for admin credentials — it does not rotate them.

No manual edits to `cloudbuild.yaml` are needed before the first deploy.

---

## 13. First deploy

This command builds, migrates, seeds, and deploys the backend to Cloud Run.
Run it before §14 (Firebase Hosting deploy) on first setup.

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_REGION="$REGION",_SERVICE_NAME="$SERVICE_NAME",_REPO="$REPO_NAME",_VPC_CONNECTOR="$VPC_CONNECTOR",_API_URL='https://unshelvd.koshkikode.com',_GCS_BUCKET="${PROJECT_ID}-unshelvd-uploads"
```

> **`_STRIPE_PK` is not needed here.** The admin dashboard (**Admin → Integrations → Stripe**) accepts the publishable key at runtime without a redeploy. Set it there after the first deploy.

### 13.1 Find your admin credentials (first-deploy only)

After the build completes, read the admin credentials from the seed job log:

```bash
gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=${SERVICE_NAME}-seed" \
  --limit=50 \
  --format='value(textPayload)' \
  --project="$PROJECT_ID" | grep -A 5 "ADMIN CREDENTIALS"
```

> **Save the printed username, email, and password somewhere secure (password manager).** They will never be printed again unless you explicitly request a rotation (see §20 — Credential recovery).

### 13.2 Post-deploy admin dashboard setup (no redeploy needed)

Log in at `https://unshelvd.koshkikode.com/#/admin` and configure the following from the dashboard:

| Dashboard section | What to configure |
|---|---|
| **Admin → My Account** | Change username, email, and password to your preferred values |
| **Admin → Integrations → Stripe** | Paste Stripe publishable key, secret key, webhook secret; enable Stripe |
| **Admin → Integrations → PayPal** | Paste PayPal client ID, secret, webhook ID (if using PayPal) |
| **Admin → Integrations → Email** | Configure SMTP host, port, credentials, from address |
| **Admin → Integrations → Platform Settings** | Set platform fee %, toggle maintenance mode, registrations |

Everything above takes effect immediately — no redeploy required.

---

## 14. Deploy frontend to Firebase Hosting

Build the frontend and deploy:

```bash
VITE_API_URL=https://unshelvd.koshkikode.com SKIP_ENV_VERIFY=true npm run build
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
  --substitutions=_REGION="${REGION}",_SERVICE_NAME="${SERVICE_NAME}",_REPO="${REPO_NAME}",_VPC_CONNECTOR="${VPC_CONNECTOR}",_API_URL='https://unshelvd.koshkikode.com',_GCS_BUCKET="${PROJECT_ID}-unshelvd-uploads" \
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
VITE_API_URL=https://unshelvd.koshkikode.com npm run build
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
  --substitutions=_REGION="$REGION",_SERVICE_NAME="$SERVICE_NAME",_REPO="$REPO_NAME",_VPC_CONNECTOR="$VPC_CONNECTOR",_API_URL='https://unshelvd.koshkikode.com',_GCS_BUCKET="${PROJECT_ID}-unshelvd-uploads"
```

> Admin credentials are **not** changed by a redeploy. All API keys and settings survive redeployment — they are stored in AlloyDB, not in the image.

### Frontend only (Firebase Hosting)

```bash
VITE_API_URL=https://unshelvd.koshkikode.com SKIP_ENV_VERIFY=true npm run build
```

```bash
firebase deploy --only hosting
```

### Rotate Secret Manager secrets

```bash
echo -n 'PASTE_NEW_sk_live' | gcloud secrets versions add STRIPE_SECRET_KEY --data-file=-
```

```bash
echo -n 'PASTE_NEW_whsec' | gcloud secrets versions add STRIPE_WEBHOOK_SECRET --data-file=-
```

```bash
openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add SESSION_SECRET --data-file=-
```

> **Stripe and PayPal keys can also be rotated from the admin dashboard** (Admin → Integrations) without touching Secret Manager or redeploying.

### Credential recovery (lost admin password)

If you can no longer log in to the admin account:

1. Create a secret in Secret Manager:
   ```bash
   echo -n "true" | gcloud secrets create ADMIN_FORCE_ROTATE --replication-policy=automatic --data-file=-
   ```
2. Grant Cloud Build access:
   ```bash
   gcloud secrets add-iam-policy-binding ADMIN_FORCE_ROTATE \
     --member="serviceAccount:${CLOUDBUILD_SA}" \
     --role="roles/secretmanager.secretAccessor"
   ```
3. Add `ADMIN_FORCE_ROTATE=ADMIN_FORCE_ROTATE:latest` to the `--set-secrets` line of the seed step in `cloudbuild.yaml`, then run a deploy.
4. Read the new credentials from Cloud Logging (same command as §13.1).
5. **Remove the `ADMIN_FORCE_ROTATE` secret and the `--set-secrets` entry.** Leaving it in would rotate credentials on every future deploy.

---

## 21. Runtime admin management (no redeploy needed)

The admin dashboard at `https://unshelvd.koshkikode.com/#/admin` is the single place to manage the platform after the first deploy.

| Tab | What you can do |
|-----|-----------------|
| **Overview** | Live stats — users, listings, revenue, pending payouts, disputes |
| **Transactions** | View all transactions; filter by status; issue refunds; resolve disputes |
| **Users** | Browse all accounts; suspend / unsuspend users |
| **Revenue** | Monthly revenue breakdown; platform fees earned; pending seller payouts |
| **Integrations → Stripe** | Enable/disable; set publishable key, secret key, webhook secret |
| **Integrations → PayPal** | Enable/disable; set client ID, client secret, webhook ID, sandbox/live mode |
| **Integrations → Email** | Enable/disable; configure SMTP host, port, credentials, from address |
| **Integrations → Platform Settings** | Platform fee %; enable/disable new registrations; toggle maintenance mode |
| **Catalog Seeder** | Import books from Open Library by query |
| **My Account** | Change admin username, email, and password |

> Keep canonical production Stripe/PayPal keys in Secret Manager as a backup reference. Use the admin dashboard for routine rotation and changes.

---

## 22. Local development (`docker-compose`)

```bash
docker-compose up -d
```

The `docker-compose.yml` starts a local PostgreSQL instance on port 5432.
Set `DATABASE_URL=postgresql://unshelvd:unshelvd_dev@localhost:5432/unshelvd` in your `.env`.

Full reference: `.env.example` in the project root.
