# Unshelv'd — Deployment Reference

> **This document is the detailed technical reference for deploying Unshelv'd.**
> For the full setup walkthrough (three deployment paths, mobile, DNS, email, cost comparison),
> see [`README-SETUP.md`](./README-SETUP.md).

---

## Contents

1. [How the Build Works](#how-the-build-works)
2. [Google Cloud Run](#google-cloud-run)
   - [One-Time Infrastructure](#one-time-infrastructure)
   - [Secrets](#secrets)
   - [Stripe Payments](#stripe-payments)
   - [First Deploy](#first-deploy)
   - [Subsequent Deploys](#subsequent-deploys)
   - [Automated Deploys via Cloud Build Trigger](#automated-deploys-via-cloud-build-trigger)
   - [GCS for Profile Images](#gcs-for-profile-images)
   - [Custom Domain & TLS](#custom-domain--tls)
   - [Monitoring](#monitoring)
3. [AWS Deployment](#aws-deployment)
   - [AWS Amplify as CI/CD](#aws-amplify-as-cicd)
   - [ECS Fargate (Container Runtime)](#ecs-fargate-container-runtime)
   - [GitHub Actions to ECS](#github-actions-to-ecs)
4. [Database Operations](#database-operations)
   - [Bootstrap (first deploy only)](#bootstrap-first-deploy-only)
   - [Migrations](#migrations)
   - [Seeding](#seeding)
   - [Adding a New Migration](#adding-a-new-migration)
   - [Retrieving Admin Credentials](#retrieving-admin-credentials)
5. [Environment Variables Reference](#environment-variables-reference)
6. [Troubleshooting](#troubleshooting)

---

## How the Build Works

Understanding the build pipeline helps you debug failures and customise deploys.

### `npm run build` (two-stage pipeline)

```
npm run build
 ├── prebuild: tsx scripts/sync-version.ts   ← stamps package.json version into the bundle
 ├── tsx scripts/verify-env.ts               ← aborts if required env vars are missing
 ├── vite build                              ← compiles React SPA → dist/public/
 └── esbuild (script/build.ts)              ← bundles Express server → dist/index.cjs
```

**Vite client build** (`dist/public/`)

- Reads `client/` source and `shared/` schema types
- Bakes `VITE_*` environment variables into the JS bundle at build time — these
  cannot be changed at runtime; you must rebuild if they change
- Produces `index.html` + hashed JS/CSS chunks

**esbuild server build** (`dist/index.cjs`)

- Entry point: `server/index.ts`
- Output format: CommonJS (`.cjs`) so it can be started with plain `node`
- Hot-path dependencies (express, stripe, drizzle-orm, etc.) are bundled in to
  reduce `openat(2)` syscalls on Cloud Run cold starts
- Heavy node_modules (pg, bcryptjs, Capacitor, etc.) stay external so they are
  loaded from `node_modules/` at runtime

### Dockerfile (multi-stage)

```
Stage 1 — builder (node:20-alpine)
  ├── npm ci                            ← install all deps (dev + prod)
  ├── SKIP_ENV_VERIFY=true npm run build ← run the two-stage build above
  └── dist/  migrations/  shared/  script/

Stage 2 — runner (node:20-alpine)
  ├── npm ci --omit=dev                 ← production deps only
  ├── COPY --from=builder dist/         ← compiled output
  ├── COPY --from=builder migrations/   ← SQL migration files (needed by migrate.js)
  ├── COPY --from=builder script/       ← bootstrap.js, migrate.js, seed.js
  ├── USER node                         ← non-root for security
  └── CMD ["node", "dist/index.cjs"]
```

> The container image is approximately 150–200 MB. The multi-stage build keeps
> TypeScript compiler, Vite, and devDependencies out of the final image.

### Script files in `script/`

| File | When to run | What it does |
|------|-------------|--------------|
| `script/bootstrap.js` | First deploy only | Creates `public` / `drizzle` schemas; grants permissions. Safe to run on an existing DB (detects tables and skips destructive steps). |
| `script/migrate.js` | Every deploy (before starting the server) | Applies any unapplied Drizzle SQL migrations from `migrations/`. Idempotent. |
| `script/seed.js` | First deploy (and optionally on re-deploy) | Inserts 126 literary works + 156 catalog entries if tables are empty; creates/rotates admin account. Completely idempotent — never overwrites existing data. |

---

## Google Cloud Run

### One-Time Infrastructure

Run these commands once per project. Re-running them is safe (they are idempotent).

```bash
# Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
export PROJECT_ID=$(gcloud config get-value project)
export REGION=us-central1          # change to your preferred region

# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com

# Artifact Registry — stores Docker images
gcloud artifacts repositories create unshelvd \
  --repository-format=docker \
  --location=$REGION \
  --description="Unshelv'd container images"

# Cloud SQL — PostgreSQL 16
# Upgrade --tier to db-g1-small or db-n1-standard-1 for production load (see tier table below)
gcloud sql instances create unshelvd-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=$REGION \
  --storage-auto-increase \
  --storage-size=10GB \
  --root-password=CHOOSE_A_ROOT_PASSWORD

gcloud sql databases create unshelvd --instance=unshelvd-db

gcloud sql users create unshelvd \
  --instance=unshelvd-db \
  --password=CHOOSE_A_USER_PASSWORD

# Save the connection name — used in DATABASE_URL
gcloud sql instances describe unshelvd-db \
  --format='value(connectionName)'
# Output: YOUR_PROJECT_ID:us-central1:unshelvd-db

# Grant IAM roles to Cloud Run's default service account
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

# Cloud SQL Client — allows the container to connect via Unix socket
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/cloudsql.client"

# Cloud SQL Client for Cloud Build (migration + seed jobs)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/cloudsql.client"

# Cloud Run Job invoker for Cloud Build
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/run.admin"

# Allow Cloud Build to act as the Compute SA
gcloud iam service-accounts add-iam-policy-binding $COMPUTE_SA \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/iam.serviceAccountUser"
```

**Cloud SQL tier guide:**

| Tier | vCPU | RAM | Monthly cost (est.) | Suitable for |
|------|------|-----|---------------------|--------------|
| `db-f1-micro` | shared | 0.6 GB | ~$8 | Development / very low traffic |
| `db-g1-small` | shared | 1.7 GB | ~$26 | Small production (< 1k users) |
| `db-n1-standard-1` | 1 | 3.75 GB | ~$52 | Medium production |
| `db-n1-standard-2` | 2 | 7.5 GB | ~$103 | High-traffic production |

---

### Secrets

> **This section is referenced by `cloudbuild.yaml`.**

All secrets are stored in Google Cloud Secret Manager and injected at runtime —
they never appear in the Docker image or build logs.

#### Required secrets (must exist before first deploy)

```bash
# 1. DATABASE_URL — Unix socket format for Cloud SQL Auth Proxy
#    Replace PROJECT_ID:REGION:INSTANCE with your connection name
DB_URL="postgresql://unshelvd:USER_PASSWORD@/unshelvd?host=/cloudsql/${PROJECT_ID}:${REGION}:unshelvd-db"
echo -n "$DB_URL" | gcloud secrets create DATABASE_URL \
  --replication-policy=automatic --data-file=-

# 2. SESSION_SECRET — 32-byte random hex string
#    Rotating this value invalidates all active user sessions
openssl rand -hex 32 | gcloud secrets create SESSION_SECRET \
  --replication-policy=automatic --data-file=-
```

#### Optional admin credential secrets

If these are **not** set, `script/seed.js` auto-generates credentials and prints
them to the seed job logs on every deploy (see [Retrieving Admin Credentials](#retrieving-admin-credentials)).
Set these only if you want deterministic, non-rotating admin credentials.

```bash
echo -n "admin@yourdomain.com"           | gcloud secrets create ADMIN_EMAIL    --replication-policy=automatic --data-file=-
echo -n "youradminusername"              | gcloud secrets create ADMIN_USERNAME  --replication-policy=automatic --data-file=-
openssl rand -base64 18 | tr -d '\n'     | gcloud secrets create ADMIN_PASSWORD  --replication-policy=automatic --data-file=-
```

#### Grant secret access to service accounts

```bash
for SECRET in DATABASE_URL SESSION_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET \
              ADMIN_EMAIL ADMIN_USERNAME ADMIN_PASSWORD SMTP_USER SMTP_PASS; do
  # Grant to Compute SA (Cloud Run service + jobs)
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/secretmanager.secretAccessor" 2>/dev/null || true

  # Grant to Cloud Build SA (migration + seed jobs in the build pipeline)
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${CLOUDBUILD_SA}" \
    --role="roles/secretmanager.secretAccessor" 2>/dev/null || true
done
```

> The `2>/dev/null || true` suppresses errors for secrets that don't exist yet
> (e.g. Stripe secrets before you've created them). Run this again after creating
> new secrets.

#### Updating a secret value

```bash
# Rotate SESSION_SECRET (invalidates all user sessions)
openssl rand -hex 32 | gcloud secrets versions add SESSION_SECRET --data-file=-

# Rotate a Stripe key
echo -n "sk_live_NEW_KEY" | gcloud secrets versions add STRIPE_SECRET_KEY --data-file=-

# Cloud Run picks up the new version on the next request — no redeploy needed
# because cloudbuild.yaml uses `:latest` which always resolves to the newest version.
```

---

### Stripe Payments

> **This section is referenced by `cloudbuild.yaml`.**

Stripe keys are kept out of `cloudbuild.yaml` by default because Cloud Run
refuses to deploy if a referenced secret doesn't exist in Secret Manager. This
means you must create the secrets **before** enabling them in the YAML.

#### Step 1 — Create the secrets

```bash
echo -n "sk_live_..."  | gcloud secrets create STRIPE_SECRET_KEY    --replication-policy=automatic --data-file=-
echo -n "whsec_..."    | gcloud secrets create STRIPE_WEBHOOK_SECRET --replication-policy=automatic --data-file=-
```

Grant access to both service accounts (re-run the grant loop above, or grant individually):

```bash
for SECRET in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${COMPUTE_SA}" --role="roles/secretmanager.secretAccessor"
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${CLOUDBUILD_SA}" --role="roles/secretmanager.secretAccessor"
done
```

#### Step 2 — Enable in `cloudbuild.yaml`

In step 5 (the `gcloud run deploy` step), update `--set-secrets`:

```yaml
# Before (no Stripe):
- "--set-secrets=DATABASE_URL=DATABASE_URL:latest,SESSION_SECRET=SESSION_SECRET:latest"

# After (with Stripe):
- "--set-secrets=DATABASE_URL=DATABASE_URL:latest,SESSION_SECRET=SESSION_SECRET:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest"
```

#### Step 3 — Pass the publishable key at build time

```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_STRIPE_PK=pk_live_YOUR_PUBLISHABLE_KEY
```

`VITE_STRIPE_PUBLISHABLE_KEY` is baked into the client bundle at build time. It
is safe to expose publicly — it is not a secret.

#### Step 4 — Register the webhook in the Stripe Dashboard

- **URL:** `https://unshelvd.yourdomain.com/api/webhooks/stripe`
- **Events to listen for:**
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `account.updated`
  - `transfer.failed`
  - `charge.refunded`

#### Switching from test to live mode

1. Create new secrets (or update existing versions) with `sk_live_` and `pk_live_` keys
2. Register a new webhook endpoint in Stripe Dashboard → Webhooks (live mode)
3. Update `STRIPE_WEBHOOK_SECRET` secret with the new `whsec_` from the live webhook
4. Redeploy: `gcloud builds submit --config=cloudbuild.yaml --substitutions=_STRIPE_PK=pk_live_...`

---

### First Deploy

Before the very first deploy on a brand-new Cloud SQL instance, run the
bootstrap script to initialise the database schemas.

#### Bootstrap the database

The bootstrap script is safe to run on an existing database — it detects tables
and skips the destructive `DROP SCHEMA` path if any application tables already exist.

```bash
# Option A — run as a Cloud Run Job (recommended; no local DB access required)
gcloud run jobs deploy unshelvd-bootstrap \
  --image=node:20-alpine \
  --command=sh \
  --args="-c,npm ci --omit=dev && node script/bootstrap.js" \
  --region=$REGION \
  --set-cloudsql-instances=${PROJECT_ID}:${REGION}:unshelvd-db \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest \
  --execute-now \
  --wait

# Option B — run locally via Cloud SQL Auth Proxy
# 1. Start the proxy: cloud-sql-proxy ${PROJECT_ID}:${REGION}:unshelvd-db
# 2. DATABASE_URL="postgresql://unshelvd:PASS@localhost:5432/unshelvd" node script/bootstrap.js
```

#### First full deploy

```bash
# Basic deploy (no Stripe, no optional extras)
gcloud builds submit --config=cloudbuild.yaml

# Full production deploy
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=\
_STRIPE_PK=pk_live_YOUR_PUBLISHABLE_KEY,\
_GCS_BUCKET=your-gcs-bucket-name,\
_THRIFTBOOKS_AFF_ID=your-thriftbooks-impact-id,\
_ADSENSE_CLIENT=ca-pub-XXXXXXXXXX
```

**What `cloudbuild.yaml` does (in order):**

| Step | Command | Notes |
|------|---------|-------|
| 1 | `docker build` | Builds image with `VITE_*` args baked in |
| 2 | `docker push --all-tags` | Pushes `:$COMMIT_SHA` and `:latest` to Artifact Registry |
| 3 | `gcloud run jobs deploy … --execute-now --wait` | Runs `node script/migrate.js` — applies Drizzle migrations |
| 4 | `gcloud run jobs deploy … --execute-now --wait` | Runs `node script/seed.js` — seeds catalog + admin |
| 5 | `gcloud run deploy` | Deploys the new image to the Cloud Run service |

Steps 3 and 4 run as Cloud Run Jobs and **block** the pipeline (`--wait`). If
either job fails, the pipeline stops and the service is not updated — this
prevents deploying a new image against an unmigrated database.

---

### Subsequent Deploys

```bash
# Standard redeploy (preserves all existing substitutions)
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_STRIPE_PK=pk_live_...,_GCS_BUCKET=...

# Deploy without Stripe (payments will be disabled at runtime)
gcloud builds submit --config=cloudbuild.yaml
```

There is no downtime during redeploy — Cloud Run performs a rolling update,
keeping the old revision live until the new one passes health checks.

---

### Automated Deploys via Cloud Build Trigger

Set up continuous deployment so every push to `main` triggers a deploy automatically.

```bash
# Connect your GitHub repo to Cloud Build first (one-time, in Cloud Console):
# Cloud Build → Triggers → Connect Repository → GitHub → KoshkiKode/unshelvd

# Then create the trigger
gcloud builds triggers create github \
  --repo-name=unshelvd \
  --repo-owner=KoshkiKode \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml \
  --substitutions=\
_STRIPE_PK=pk_live_YOUR_PUBLISHABLE_KEY,\
_GCS_BUCKET=your-bucket

# To manually trigger:
gcloud builds triggers run TRIGGER_ID --branch=main
```

---

### GCS for Profile Images

Without a GCS bucket, user profile images are stored as base64 data URIs in the
database. This works but bloats the DB significantly. Set up GCS for production.

```bash
# Create a publicly readable bucket
gcloud storage buckets create gs://unshelvd-avatars \
  --location=$REGION \
  --uniform-bucket-level-access

# Allow anyone to read uploaded files
gcloud storage buckets add-iam-policy-binding gs://unshelvd-avatars \
  --member=allUsers --role=roles/storage.objectViewer

# Allow the Cloud Run service account to create/delete objects
gcloud storage buckets add-iam-policy-binding gs://unshelvd-avatars \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role=roles/storage.objectAdmin

# Pass the bucket name at deploy time
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_GCS_BUCKET=unshelvd-avatars,...
```

`GCS_BUCKET_NAME` is passed as a plain env var (not a secret) because bucket
names are not sensitive.

---

### Custom Domain & TLS

Cloud Run manages TLS certificates automatically when you create a domain mapping.

```bash
# Map your domain
gcloud run domain-mappings create \
  --service=unshelvd \
  --domain=unshelvd.yourdomain.com \
  --region=$REGION

# Get the DNS records to add to your DNS provider
gcloud run domain-mappings describe \
  --domain=unshelvd.yourdomain.com \
  --region=$REGION
# The output lists the CNAME / A / AAAA records to add.
```

**Route 53 notes:**
- For a subdomain like `unshelvd.yourdomain.com`, add a **CNAME** record
  pointing to the `ghs.googlehosted.com` value shown in the mapping describe output.
- For the apex domain (`yourdomain.com`), Route 53 **ALIAS** records cannot
  point to Cloud Run directly. Options:
  1. Use a subdomain (`www` / `app`)
  2. Put a Cloud Load Balancer in front of Cloud Run (see [GCP load balancing docs](https://cloud.google.com/load-balancing/docs/https/setting-up-https-serverless))

TLS certificates are provisioned automatically within a few minutes of adding
the DNS records. Cloud Run renews them automatically.

---

### Monitoring

```bash
# Uptime check on the health endpoint
gcloud monitoring uptime create \
  --display-name="Unshelv'd API health" \
  --http-check-path=/api/health \
  --monitored-resource-type=uptime-url \
  --resource-labels=host=unshelvd.yourdomain.com \
  --period=1

# Then in Cloud Console → Monitoring → Alerting:
# Create an alert policy on "Uptime check failure" → notify via email / PagerDuty
```

**Automated database backups:**

```bash
gcloud sql instances patch unshelvd-db \
  --backup-start-time=03:00 \
  --retained-backups-count=7 \
  --retained-transaction-log-days=7
```

---

## AWS Deployment

### AWS Amplify as CI/CD

> **Important:** AWS Amplify *Hosting* is designed for static sites and Next.js
> serverless functions. It cannot run a stateful Express server with persistent
> PostgreSQL connections, WebSockets, or long-running background jobs.
>
> Use Amplify **only as a CI/CD pipeline** (build + push Docker image to ECR +
> trigger an ECS service update). The container runtime is **ECS Fargate**.

#### `amplify.yml` for CI/CD only

Create this file at the repository root:

```yaml
version: 1
backend:
  phases:
    preBuild:
      commands:
        - aws ecr get-login-password --region $AWS_REGION |
            docker login --username AWS --password-stdin
            $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
    build:
      commands:
        # Build and push Docker image to ECR
        - |
          docker build \
            --build-arg VITE_API_URL=$VITE_API_URL \
            --build-arg VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY \
            --build-arg VITE_THRIFTBOOKS_AFF_ID=$VITE_THRIFTBOOKS_AFF_ID \
            --build-arg VITE_ADSENSE_CLIENT=$VITE_ADSENSE_CLIENT \
            -t $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/unshelvd:$CODEBUILD_RESOLVED_SOURCE_VERSION \
            -t $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/unshelvd:latest \
            .
        - docker push --all-tags $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/unshelvd
        # Run migrations as a one-off ECS task before updating the service
        - |
          aws ecs run-task \
            --cluster unshelvd \
            --task-definition unshelvd \
            --launch-type FARGATE \
            --network-configuration "awsvpcConfiguration={subnets=[$ECS_SUBNET],securityGroups=[$ECS_SG],assignPublicIp=ENABLED}" \
            --overrides '{"containerOverrides":[{"name":"unshelvd","command":["node","script/migrate.js"]}]}' \
            --query 'tasks[0].taskArn' --output text
        # Force a new deployment (pulls latest image)
        - aws ecs update-service --cluster unshelvd --service unshelvd-svc --force-new-deployment
```

**Amplify environment variables to set in the Amplify Console:**

| Variable | Value |
|----------|-------|
| `AWS_REGION` | e.g. `us-east-1` |
| `AWS_ACCOUNT_ID` | your 12-digit AWS account number |
| `VITE_API_URL` | `https://unshelvd.yourdomain.com` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` |
| `VITE_THRIFTBOOKS_AFF_ID` | optional affiliate ID |
| `VITE_ADSENSE_CLIENT` | optional AdSense publisher ID |
| `ECS_SUBNET` | subnet ID where ECS tasks run |
| `ECS_SG` | security group ID for ECS tasks |

Grant the Amplify service role these permissions:
- `ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, `ecr:PutImage`, `ecr:InitiateLayerUpload`, etc.
- `ecs:RunTask`, `ecs:UpdateService`, `ecs:DescribeTasks`
- `iam:PassRole` on the ECS task execution role

---

### ECS Fargate (Container Runtime)

This is the correct AWS equivalent of Cloud Run.

#### Step 1 — ECR repository

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

aws ecr create-repository --repository-name unshelvd --region $AWS_REGION

# Authenticate Docker
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin \
    ${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com
```

#### Step 2 — RDS PostgreSQL 16

```bash
# DB subnet group (use private subnets within your VPC)
aws rds create-db-subnet-group \
  --db-subnet-group-name unshelvd-subnets \
  --db-subnet-group-description "Unshelv'd DB" \
  --subnet-ids subnet-XXXXXXXX subnet-YYYYYYYY

# Create the instance
aws rds create-db-instance \
  --db-instance-identifier unshelvd-db \
  --db-instance-class db.t4g.micro \
  --engine postgres \
  --engine-version "16.3" \
  --master-username unshelvd \
  --master-user-password CHOOSE_A_STRONG_PASSWORD \
  --db-name unshelvd \
  --allocated-storage 20 \
  --storage-type gp3 \
  --no-publicly-accessible \
  --db-subnet-group-name unshelvd-subnets \
  --backup-retention-period 7 \
  --deletion-protection \
  --region $AWS_REGION

# Wait for it to be available (~5–10 min)
aws rds wait db-instance-available --db-instance-identifier unshelvd-db

# Get the endpoint
aws rds describe-db-instances \
  --db-instance-identifier unshelvd-db \
  --query 'DBInstances[0].Endpoint.Address' --output text
```

The `DATABASE_URL` for RDS uses TCP (no Unix socket):

```
postgresql://unshelvd:PASSWORD@your-endpoint.rds.amazonaws.com:5432/unshelvd?sslmode=require
```

#### Step 3 — Secrets Manager

```bash
aws secretsmanager create-secret \
  --name /unshelvd/DATABASE_URL \
  --secret-string "postgresql://unshelvd:PASS@endpoint.rds.amazonaws.com:5432/unshelvd?sslmode=require"

aws secretsmanager create-secret \
  --name /unshelvd/SESSION_SECRET \
  --secret-string "$(openssl rand -hex 32)"

aws secretsmanager create-secret \
  --name /unshelvd/STRIPE_SECRET_KEY \
  --secret-string "sk_live_..."

aws secretsmanager create-secret \
  --name /unshelvd/STRIPE_WEBHOOK_SECRET \
  --secret-string "whsec_..."

# Optional admin credential overrides
aws secretsmanager create-secret --name /unshelvd/ADMIN_EMAIL    --secret-string "admin@yourdomain.com"
aws secretsmanager create-secret --name /unshelvd/ADMIN_USERNAME --secret-string "youradminusername"
aws secretsmanager create-secret --name /unshelvd/ADMIN_PASSWORD --secret-string "$(openssl rand -base64 18)!A1"
```

#### Step 4 — IAM role for ECS tasks

```bash
# Trust policy
cat > /tmp/ecs-trust.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{"Effect": "Allow", "Principal": {"Service": "ecs-tasks.amazonaws.com"}, "Action": "sts:AssumeRole"}]
}
EOF

aws iam create-role \
  --role-name unshelvd-ecs-task-role \
  --assume-role-policy-document file:///tmp/ecs-trust.json

# Standard ECS task execution permissions (ECR pull, CloudWatch logs)
aws iam attach-role-policy \
  --role-name unshelvd-ecs-task-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Grant Secrets Manager read access
cat > /tmp/ecs-secrets-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["secretsmanager:GetSecretValue"],
    "Resource": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT}:secret:/unshelvd/*"
  }]
}
EOF

aws iam put-role-policy \
  --role-name unshelvd-ecs-task-role \
  --policy-name unshelvd-secrets \
  --policy-document file:///tmp/ecs-secrets-policy.json
```

#### Step 5 — Build and push the image

```bash
IMAGE="${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com/unshelvd:latest"

docker build \
  --build-arg VITE_API_URL=https://unshelvd.yourdomain.com \
  --build-arg VITE_STRIPE_PUBLISHABLE_KEY=pk_live_... \
  -t $IMAGE .

docker push $IMAGE
```

#### Step 6 — Bootstrap and migrate (first deploy only)

```bash
# Bootstrap via the Docker image locally (requires DB to be reachable)
DATABASE_URL="postgresql://unshelvd:PASS@endpoint.rds.amazonaws.com:5432/unshelvd?sslmode=require" \
  docker run --rm \
    -e DATABASE_URL \
    -e NODE_ENV=production \
    $IMAGE \
    node script/bootstrap.js

# Migrate
DATABASE_URL="postgresql://..." \
  docker run --rm -e DATABASE_URL $IMAGE node script/migrate.js

# Seed
DATABASE_URL="postgresql://..." SESSION_SECRET="$(openssl rand -hex 32)" \
  docker run --rm -e DATABASE_URL -e SESSION_SECRET -e NODE_ENV=production \
    $IMAGE node script/seed.js
```

#### Step 7 — ECS Task Definition

Create `/tmp/task-def.json` (replace `ACCOUNT` and `REGION` placeholders):

```json
{
  "family": "unshelvd",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/unshelvd-ecs-task-role",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/unshelvd-ecs-task-role",
  "containerDefinitions": [{
    "name": "unshelvd",
    "image": "ACCOUNT.dkr.ecr.REGION.amazonaws.com/unshelvd:latest",
    "portMappings": [{"containerPort": 8080, "protocol": "tcp"}],
    "essential": true,
    "environment": [
      {"name": "NODE_ENV", "value": "production"},
      {"name": "PORT",     "value": "8080"}
    ],
    "secrets": [
      {"name": "DATABASE_URL",          "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:/unshelvd/DATABASE_URL"},
      {"name": "SESSION_SECRET",        "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:/unshelvd/SESSION_SECRET"},
      {"name": "STRIPE_SECRET_KEY",     "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:/unshelvd/STRIPE_SECRET_KEY"},
      {"name": "STRIPE_WEBHOOK_SECRET", "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:/unshelvd/STRIPE_WEBHOOK_SECRET"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/unshelvd",
        "awslogs-region": "REGION",
        "awslogs-stream-prefix": "ecs"
      }
    },
    "healthCheck": {
      "command": ["CMD-SHELL", "curl -sf http://localhost:8080/api/health || exit 1"],
      "interval": 30,
      "timeout": 5,
      "retries": 3,
      "startPeriod": 60
    }
  }]
}
```

```bash
# Create CloudWatch log group
aws logs create-log-group --log-group-name /ecs/unshelvd

# Register the task definition
aws ecs register-task-definition --cli-input-json file:///tmp/task-def.json

# Create the ECS cluster
aws ecs create-cluster --cluster-name unshelvd

# Create the service (set your VPC subnet and security group IDs)
aws ecs create-service \
  --cluster unshelvd \
  --service-name unshelvd-svc \
  --task-definition unshelvd \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-XXXX],securityGroups=[sg-XXXX],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:REGION:ACCOUNT:targetgroup/unshelvd/...,containerName=unshelvd,containerPort=8080"
```

For the ALB + ACM + Route 53 DNS setup, see
[Step 8 in README-SETUP.md (AWS Exclusive)](./README-SETUP.md#step-8--application-load-balancer--ecs-service).

---

### GitHub Actions to ECS

If you prefer GitHub Actions over Amplify for CI/CD, use the existing workflow
pattern in `.github/workflows/` as a starting point. A minimal deploy job:

```yaml
name: Deploy to ECS
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push
        env:
          REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        run: |
          docker build \
            --build-arg VITE_API_URL=https://unshelvd.yourdomain.com \
            --build-arg VITE_STRIPE_PUBLISHABLE_KEY=${{ secrets.VITE_STRIPE_PUBLISHABLE_KEY }} \
            -t $REGISTRY/unshelvd:${{ github.sha }} \
            -t $REGISTRY/unshelvd:latest .
          docker push --all-tags $REGISTRY/unshelvd

      - name: Run migrations
        run: |
          aws ecs run-task \
            --cluster unshelvd \
            --task-definition unshelvd \
            --launch-type FARGATE \
            --network-configuration "awsvpcConfiguration={subnets=[${{ secrets.ECS_SUBNET }}],securityGroups=[${{ secrets.ECS_SG }}]}" \
            --overrides '{"containerOverrides":[{"name":"unshelvd","command":["node","script/migrate.js"]}]}'

      - name: Deploy service
        run: |
          aws ecs update-service \
            --cluster unshelvd \
            --service unshelvd-svc \
            --force-new-deployment
```

---

## Database Operations

### Bootstrap (first deploy only)

The bootstrap script (`script/bootstrap.js`) prepares a brand-new PostgreSQL
instance for Drizzle migrations. It:

1. Checks whether application tables already exist
2. **If yes:** refreshes `GRANT` permissions only — does NOT drop or alter any data
3. **If no:** drops and recreates the `public` and `drizzle` schemas, then grants permissions

**Run this exactly once on a fresh database, before running migrations.**

```bash
# Cloud Run Job (recommended for Cloud SQL)
gcloud run jobs deploy unshelvd-bootstrap \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/unshelvd/unshelvd:latest \
  --command=node \
  --args=script/bootstrap.js \
  --region=$REGION \
  --set-cloudsql-instances=${PROJECT_ID}:${REGION}:unshelvd-db \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest \
  --execute-now \
  --wait

# Via Cloud SQL Auth Proxy (local machine)
# Terminal 1: cloud-sql-proxy ${PROJECT_ID}:${REGION}:unshelvd-db
# Terminal 2:
DATABASE_URL="postgresql://unshelvd:PASS@localhost:5432/unshelvd" node script/bootstrap.js
```

⚠️ **Never run bootstrap on a live database that has user data unless you
understand that it will skip the destructive path automatically.**

---

### Migrations

Migrations are SQL files in `migrations/` generated by Drizzle Kit. They are
tracked in `migrations/meta/` and applied by `script/migrate.js` using the
Drizzle migrator, which records applied migrations in the `drizzle.__drizzle_migrations` table.

**`migrate.js` is idempotent** — already-applied migrations are skipped. It is
safe (and expected) to run on every deploy.

```bash
# Cloud Run Job (used automatically by cloudbuild.yaml step 3)
gcloud run jobs deploy unshelvd-migrate \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/unshelvd/unshelvd:latest \
  --command=node \
  --args=script/migrate.js \
  --region=$REGION \
  --set-cloudsql-instances=${PROJECT_ID}:${REGION}:unshelvd-db \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest \
  --execute-now \
  --wait

# npm shortcut (runs script/migrate.js)
DATABASE_URL="..." npm run db:migrate:run

# Check migration logs on Cloud Run
gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=unshelvd-migrate" \
  --limit=50 --format="value(textPayload)"
```

**Order matters:** always run migrations **before** deploying a new service image.
`cloudbuild.yaml` enforces this automatically.

---

### Seeding

`script/seed.js` is idempotent — it checks for existing data before inserting.

What it does:
- Inserts 126 classic literary works into the `works` table (skipped if any works exist)
- Inserts 156 catalog entries into `book_catalog` (skipped if any exist)
- Creates or updates the admin user account (see credential behaviour below)

```bash
# Cloud Run Job (used automatically by cloudbuild.yaml step 4)
gcloud run jobs deploy unshelvd-seed \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/unshelvd/unshelvd:latest \
  --command=node \
  --args=script/seed.js \
  --region=$REGION \
  --set-cloudsql-instances=${PROJECT_ID}:${REGION}:unshelvd-db \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,SESSION_SECRET=SESSION_SECRET:latest \
  --set-env-vars=NODE_ENV=production \
  --execute-now \
  --wait

# npm shortcut
DATABASE_URL="..." SESSION_SECRET="..." NODE_ENV=production npm run db:seed

# Import Open Library catalog entries (~500 works, fast)
DATABASE_URL="..." npm run catalog:seed

# Mass catalog import via Python (~12,000–15,000 works, 5–10 minutes)
DATABASE_URL="..." npm run catalog:mass-seed:py
```

---

### Adding a New Migration

When you modify `shared/schema.ts`, you must generate a new migration file and
commit it before deploying.

```bash
# 1. Make your schema changes in shared/schema.ts

# 2. Generate the SQL migration file
DATABASE_URL="postgresql://unshelvd:PASS@localhost:5432/unshelvd" npm run db:generate
# Creates migrations/XXXX_<description>.sql and updates migrations/meta/

# 3. Review the generated SQL
cat migrations/XXXX_<description>.sql

# 4. Commit the migration files
git add migrations/
git commit -m "feat: add <description> migration"

# 5. Deploy — cloudbuild.yaml will apply the migration automatically in step 3
gcloud builds submit --config=cloudbuild.yaml ...
```

**Dev shortcut** (skips migration files — never use in production):

```bash
DATABASE_URL="..." npm run db:push
# Applies schema directly without generating migration files
```

---

### Retrieving Admin Credentials

If `ADMIN_EMAIL`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` are **not** set as
secrets, `script/seed.js` auto-generates fresh credentials on every run and
prints them to stdout.

```bash
# Cloud Run — find credentials in the seed job logs
gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=unshelvd-seed" \
  --limit=100 \
  --order=desc \
  --format="value(textPayload)" \
  | grep -E "(admin|password|email|username)" -i

# AWS ECS — find credentials in CloudWatch Logs
aws logs filter-log-events \
  --log-group-name /ecs/unshelvd \
  --filter-pattern "admin" \
  --query 'events[*].message' \
  --output text
```

To stop credential rotation and pin a specific admin account, create the three
secrets (`ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`) in Secret Manager
and add them to the `--set-secrets` line in `cloudbuild.yaml` step 4.

---

## Environment Variables Reference

### Runtime secrets (injected from Secret Manager / Secrets Manager)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string. **GCP:** Unix socket form `postgresql://user:pass@/db?host=/cloudsql/PROJECT:REGION:INSTANCE`. **AWS:** TCP form `postgresql://user:pass@endpoint:5432/db?sslmode=require`. |
| `SESSION_SECRET` | ✅ | 32-byte random hex string. Rotate to invalidate all active sessions. |
| `STRIPE_SECRET_KEY` | Payments | `sk_live_...` or `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Payments | `whsec_...` from Stripe Dashboard → Webhooks |
| `ADMIN_EMAIL` | No | Pin admin email. Auto-generated if absent. |
| `ADMIN_USERNAME` | No | Pin admin username. Auto-generated if absent. |
| `ADMIN_PASSWORD` | No | Pin admin password. Auto-generated if absent. |
| `SMTP_USER` | Email | SES SMTP username (or SendGrid `apikey`) |
| `SMTP_PASS` | Email | SES SMTP password (or SendGrid API key value) |

### Runtime environment variables (plain, non-secret)

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Must be `production` in production. Enables CSRF, HSTS, strict CORS, pg-backed rate limiting. |
| `PORT` | `8080` | TCP port the server listens on. Cloud Run requires `8080`. |
| `GCS_BUCKET_NAME` | `""` | GCS bucket name for profile image uploads. Falls back to base64 DB storage if unset. |
| `CORS_ALLOWED_ORIGINS` | `""` | Comma-separated list of extra origins allowed by the CORS middleware (e.g. `https://app.yourdomain.com`). |
| `SMTP_HOST` | `""` | SMTP server hostname (e.g. `email-smtp.us-east-1.amazonaws.com`). |
| `SMTP_PORT` | `587` | SMTP port. |
| `EMAIL_FROM` | `""` | Sender address, e.g. `Unshelv'd <noreply@yourdomain.com>`. |
| `PUBLIC_APP_URL` | `""` | Canonical app URL used in auth/verification emails. |

### Build-time `VITE_*` variables (baked into the client bundle)

These are passed as `--build-arg` in the Dockerfile and as `--substitutions` in
`cloudbuild.yaml`. They **cannot be changed at runtime** — a new build is required.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_STRIPE_PUBLISHABLE_KEY` | `""` | Stripe publishable key (`pk_live_...`). Safe to expose publicly. |
| `VITE_API_URL` | `""` | API base URL for native (Capacitor) app builds. Leave empty for same-origin web deploys. |
| `VITE_THRIFTBOOKS_AFF_ID` | `""` | ThriftBooks affiliate ID. |
| `VITE_ADSENSE_CLIENT` | `""` | Google AdSense publisher ID (`ca-pub-...`). |

---

## Troubleshooting

### "Offline or Server Unavailable" screen

The `ConnectivityGuard` component calls `GET /api/health` on startup. The health
endpoint performs `SELECT 1` against PostgreSQL and returns `200 {status:"ok"}` or
`503 {status:"degraded", db:"error"}`. The offline screen appears when the health
check fails.

```bash
# Test the health endpoint directly
curl -si https://unshelvd.yourdomain.com/api/health
# Expected:  HTTP/2 200  {"status":"ok","db":"ok","timestamp":"..."}
# Problem:   HTTP/2 503  {"status":"degraded","db":"error","error":"..."}
```

| Symptom | Most likely cause | Fix |
|---------|-------------------|-----|
| `503` with `"db":"error"` | Database unreachable | Check `DATABASE_URL` secret; verify Cloud SQL instance is running; confirm service account has `roles/cloudsql.client`; check `--set-cloudsql-instances` in the deploy command |
| `503` on Cloud Run after deploy | Migration blocked startup | Check migrate job logs for errors; run `node script/migrate.js` manually |
| Network error (no response) | CORS rejection or server not running | Verify origin is in `allowedOrigins` (`server/index.ts`) or `CORS_ALLOWED_ORIGINS` env var |
| `200 OK` but still shows offline | Native app `VITE_API_URL` wrong | Rebuild the app with the correct `VITE_API_URL` baked in |
| Maintenance mode | `maintenance_mode = "true"` in DB | See below |

### Check Cloud Run logs

```bash
# Stream live logs
gcloud logging tail \
  "resource.type=cloud_run_revision AND resource.labels.service_name=unshelvd" \
  --format="value(timestamp,textPayload)"

# Last 200 lines
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=unshelvd" \
  --limit=200 --order=desc \
  --format="table(timestamp,textPayload)"

# Migration job logs
gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=unshelvd-migrate" \
  --limit=100 --format="value(textPayload)"
```

### Maintenance mode stuck on

If maintenance mode was enabled via the admin panel and you cannot access the
UI to turn it off:

```bash
# Via Cloud SQL Auth Proxy
# Terminal 1: cloud-sql-proxy PROJECT:REGION:unshelvd-db
# Terminal 2:
psql "postgresql://unshelvd:PASS@localhost:5432/unshelvd" \
  -c "UPDATE platform_settings SET value = 'false' WHERE key = 'maintenance_mode';"
```

### Cold starts are slow

Cloud Run bills for idle instances. To keep one instance warm (recommended for
production because the app uses WebSockets):

```yaml
# In cloudbuild.yaml, ensure --min-instances is at least 1 (it is by default):
_MIN_INSTANCES: "1"
```

The `--startup-cpu-boost` flag is already set in `cloudbuild.yaml` — it
temporarily doubles the CPU allocation during startup to speed up cold starts.

### Migrations fail on deploy

Migrations are idempotent — if a migration fails halfway through, fix the issue
and re-run. The migrator tracks applied migrations in `drizzle.__drizzle_migrations`.

Common causes:

| Error | Cause | Fix |
|-------|-------|-----|
| `relation "drizzle" does not exist` | Bootstrap was not run | Run `node script/bootstrap.js` first |
| `column X already exists` | Schema drift between DB and migration | Run `node script/migrate.js` — it will skip already-applied migrations |
| `timeout` | DB under load or Cloud SQL proxy not attached | Check `--set-cloudsql-instances` in the job definition; retry |
| `DATABASE_URL` missing | Secret not granted to the job's service account | Re-run the IAM grant loop in [Secrets](#secrets) |

### Resetting the database (development only)

⚠️ **This destroys all data. Never run on a production database.**

```bash
DATABASE_URL="..." node script/bootstrap.js   # resets schemas
DATABASE_URL="..." node script/migrate.js      # re-applies all migrations
DATABASE_URL="..." SESSION_SECRET="..." NODE_ENV=production node script/seed.js  # re-seeds
```
