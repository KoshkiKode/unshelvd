# Unshelv'd — Server Setup & Deployment Guide

This document covers everything you need to go from zero to a live v1.0.0 production
deployment. Three paths are described:

| Path | DNS | Backend / Container | Database | Email |
|------|-----|---------------------|----------|-------|
| **[Hybrid](#hybrid-aws-route-53--google-cloud-run)** | AWS Route 53 | Google Cloud Run | Cloud SQL | AWS SES |
| **[AWS Exclusive](#aws-exclusive-ecs-fargate--rds)** | AWS Route 53 | AWS ECS Fargate | AWS RDS | AWS SES |
| **[GCP Exclusive](#gcp-exclusive-full-google-cloud)** | Cloud DNS (or external) | Google Cloud Run | Cloud SQL | SendGrid / SMTP |

Jump to the [Cost Comparison](#cost-comparison) section at the end.

---

## Is the Codebase v1.0.0-Ready?

**Short answer: yes — with the items below squared away before launch.**

### ✅ What's production-ready today

| Area | Status |
|------|--------|
| React frontend (web) | ✅ Full UI, 10 languages, RTL, dark mode |
| Express API | ✅ All endpoints, Zod validation, rate limiting, Helmet |
| Auth | ✅ Passport.js sessions, bcrypt (12 rounds), Unicode password policy |
| Payments | ✅ Stripe Connect escrow, webhook verification |
| Database | ✅ Drizzle ORM, migrations, indexes, FK constraints |
| Android app | ✅ Capacitor 8, CI APK build on every push |
| iOS app | ✅ Capacitor 8, CI verify on every push (requires macOS to archive) |
| Desktop app | ✅ Tauri v2 guide (requires per-platform build machine) |
| GCP deployment | ✅ One-command `gcloud builds submit`, migrate + seed jobs |
| Docker image | ✅ Multi-stage, Alpine-based, ~100 MB |
| Email | ✅ Nodemailer + AWS SES config in `.env.example` |
| Admin panel | ✅ Role-gated endpoints + admin dashboard page |
| Tests | ✅ Unit + integration (vitest), coverage available |
| Security | ✅ CORS, rate limits, sanitized LIKE, no raw SQL |
| CI | ✅ GitHub Actions: APK build + iOS verify |

### ⚠️ Pre-launch checklist

- [ ] **Stripe live keys** — switch `sk_test_` → `sk_live_`, update webhook endpoint to production URL
- [ ] **Admin password** — set `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` in secrets before first seed (otherwise auto-generated; retrieve from logs)
- [ ] **CORS origins** — confirm `allowedOrigins` in `server/index.ts` includes your production domain
- [ ] **Session secret** — `openssl rand -hex 32` — never reuse a dev value
- [ ] **Email** — verify SES domain + request production access (lifts sandbox limits)
- [ ] **Stripe webhook** — register `https://YOUR_DOMAIN/api/webhooks/stripe` with events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated`, `transfer.failed`
- [ ] **Mobile API URL** — build native apps with `VITE_API_URL=https://YOUR_DOMAIN`
- [ ] **Database backups** — enable automated backups (Cloud SQL or RDS)
- [ ] **Monitoring** — set up uptime check on `/api/health`
- [ ] **Google Play / App Store** — sign AAB/IPA, upload to stores if distributing publicly

---

## Common Prerequisites (All Paths)

```bash
# Install Node.js 20+ (https://nodejs.org)
node --version   # should be 20+

# Install Docker (for local dev)
docker --version

# Clone the repo
git clone https://github.com/KoshkiKode/unshelvd.git
cd unshelvd
npm install

# Local dev (PostgreSQL via Docker)
docker-compose up -d db
cp .env.example .env   # edit DATABASE_URL, SESSION_SECRET, Stripe keys
npm run db:push
npm run db:seed         # saves admin credentials — copy them immediately!
npm run dev             # http://localhost:5000
```

### Required environment variables

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `DATABASE_URL` | PostgreSQL connection string | See path-specific sections below |
| `SESSION_SECRET` | 32-byte hex string | `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` | Stripe server-side key | dashboard.stripe.com → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | dashboard.stripe.com → Webhooks |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (baked at build) | dashboard.stripe.com → API Keys |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Email delivery | AWS SES SMTP or any SMTP |
| `EMAIL_FROM` | Sender address | e.g. `Unshelv'd <noreply@koshkikode.com>` |
| `ADMIN_EMAIL` | Admin account email (optional) | Your choice |
| `ADMIN_USERNAME` | Admin username (optional) | Your choice |
| `ADMIN_PASSWORD` | Admin password (optional) | Strong, e.g. `openssl rand -base64 18` |

Optional:

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Production API URL for native app builds |
| `VITE_ADSENSE_CLIENT` | Google AdSense publisher ID |
| `VITE_THRIFTBOOKS_AFF_ID` | ThriftBooks affiliate ID |

---

## Hybrid: AWS Route 53 + Google Cloud Run

> **This is the current live setup.** Route 53 owns the domain; Google Cloud Run
> hosts the app and database. AWS SES is used for email because the domain is
> already verified in Route 53.

### Architecture

```
Users
  │
  ▼
AWS Route 53 (koshkikode.com)
  │  CNAME → Cloud Run URL
  ▼
Google Cloud Run  ←──► Cloud SQL (PostgreSQL 16)
  │                     Cloud Secret Manager
  │                     Artifact Registry
  ▼
AWS SES (email)
```

### Step 1 — Google Cloud infrastructure (one time)

```bash
# Authenticate and set project
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
export PROJECT_ID=$(gcloud config get-value project)
export REGION=us-central1

# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com
```

#### 1a. Cloud SQL (PostgreSQL 16)

```bash
# Create instance — upgrade tier for production load (see tier table in DEPLOY.md)
gcloud sql instances create unshelvd-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=$REGION \
  --root-password=CHOOSE_A_ROOT_PASSWORD

gcloud sql databases create unshelvd --instance=unshelvd-db

gcloud sql users create unshelvd \
  --instance=unshelvd-db \
  --password=CHOOSE_A_USER_PASSWORD
```

#### 1b. Artifact Registry

```bash
gcloud artifacts repositories create unshelvd \
  --repository-format=docker \
  --location=$REGION
```

#### 1c. Secrets in Secret Manager

```bash
DB_URL="postgresql://unshelvd:USER_PASSWORD@/unshelvd?host=/cloudsql/${PROJECT_ID}:${REGION}:unshelvd-db"

echo -n "$DB_URL" | gcloud secrets create DATABASE_URL \
  --replication-policy=automatic --data-file=-

echo -n "$(openssl rand -hex 32)" | gcloud secrets create SESSION_SECRET \
  --replication-policy=automatic --data-file=-

# Stripe keys
echo -n "sk_live_..." | gcloud secrets create STRIPE_SECRET_KEY \
  --replication-policy=automatic --data-file=-
echo -n "whsec_..."   | gcloud secrets create STRIPE_WEBHOOK_SECRET \
  --replication-policy=automatic --data-file=-

# Admin credentials (prevents plain-text in logs)
echo -n "admin@koshkikode.com"              | gcloud secrets create ADMIN_EMAIL    --replication-policy=automatic --data-file=-
echo -n "youradminusername"                 | gcloud secrets create ADMIN_USERNAME  --replication-policy=automatic --data-file=-
echo -n "$(openssl rand -base64 18)!A1"    | gcloud secrets create ADMIN_PASSWORD  --replication-policy=automatic --data-file=-

# Grant Cloud Build + Cloud Run service accounts access
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
for SA in \
  "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  "${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"; do
  for SECRET in DATABASE_URL SESSION_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET \
                ADMIN_EMAIL ADMIN_USERNAME ADMIN_PASSWORD; do
    gcloud secrets add-iam-policy-binding $SECRET \
      --member="serviceAccount:${SA}" \
      --role="roles/secretmanager.secretAccessor"
  done
done

# Grant Cloud SQL Client role
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/cloudsql.client"
```

### Step 2 — Deploy (and every subsequent deploy)

```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_STRIPE_PK=pk_live_...
```

This single command: builds the Docker image → pushes to Artifact Registry →
runs schema migrations → seeds the catalog if empty → deploys to Cloud Run.

### Step 3 — AWS Route 53 DNS

1. After deployment, get the Cloud Run URL:

```bash
gcloud run services describe unshelvd --region=$REGION \
  --format='value(status.url)'
# e.g. https://unshelvd-abc123-uc.a.run.app
```

2. In **AWS Route 53 → Hosted Zones → koshkikode.com**, add:

| Record type | Name | Value | TTL |
|-------------|------|-------|-----|
| `CNAME` | `unshelvd` (or `@` apex via ALIAS/ANAME) | Cloud Run URL (without `https://`) | 300 |

> **Apex domain note:** Route 53 supports ALIAS records at the zone apex. However,
> Cloud Run does not natively support them. The recommended approach is to use a
> subdomain like `app.koshkikode.com` as a CNAME, or use a load balancer (see GCP
> Exclusive section for custom domain mapping).

3. Set up a **custom domain** in Cloud Run for HTTPS:

```bash
gcloud run domain-mappings create \
  --service=unshelvd \
  --domain=app.koshkikode.com \   # or unshelvd.koshkikode.com
  --region=$REGION
```

Cloud Run will provision a managed TLS certificate automatically.
Add the CNAME/A records it shows you to Route 53.

### Step 4 — AWS SES (email)

```bash
# In AWS Console → SES → Verified Identities → Create Identity → Domain
# Select "koshkikode.com" — AWS auto-adds DKIM/SPF records to Route 53
# Request production access (removes sandbox restriction)
# SES → SMTP Settings → Create SMTP Credentials → copy host/user/password
```

Then set in Cloud Secret Manager (or pass at deploy time):

```bash
# These can be plain env vars — not sensitive enough to require Secret Manager
gcloud run services update unshelvd --region=$REGION \
  --set-env-vars="SMTP_HOST=email-smtp.us-east-1.amazonaws.com,SMTP_PORT=587,EMAIL_FROM=Unshelv'd <noreply@koshkikode.com>"

# SMTP credentials are sensitive — use Secret Manager
echo -n "AKIAIOSFODNN7EXAMPLE"        | gcloud secrets create SMTP_USER --replication-policy=automatic --data-file=-
echo -n "wJalrXUtnFEMI/..."           | gcloud secrets create SMTP_PASS --replication-policy=automatic --data-file=-
# Grant access as above, then add to --set-secrets in cloudbuild.yaml
```

### Step 5 — Enable automated database backups

```bash
gcloud sql instances patch unshelvd-db \
  --backup-start-time=03:00 \
  --retained-backups-count=7 \
  --retained-transaction-log-days=7
```

### Step 6 — Set up monitoring

```bash
gcloud monitoring uptime create \
  --display-name="Unshelv'd API health" \
  --http-check-path=/api/health \
  --monitored-resource-type=uptime-url \
  --resource-labels=host=app.koshkikode.com \
  --period=1
```

Then create an alert policy in **Cloud Console → Monitoring → Alerting**.

---

## AWS Exclusive: ECS Fargate + RDS

> Use this path if you want everything in AWS. Your Route 53 domain stays in
> the same account as the infrastructure, simplifying DNS and certificate
> management. AWS Certificate Manager (ACM) provides free TLS.

### Architecture

```
Users
  │
  ▼
AWS Route 53
  │  A/ALIAS → ALB
  ▼
Application Load Balancer (ALB)  [TLS termination via ACM]
  │
  ▼
ECS Fargate (Docker container)
  │
  ├──► RDS PostgreSQL 16
  ├──► AWS Secrets Manager
  └──► SES (email)

ECR (container images)
```

### Step 1 — Prerequisites

```bash
# Install AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html
aws configure   # enter Access Key ID, Secret Access Key, region (e.g. us-east-1)
export AWS_REGION=us-east-1
export AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
```

### Step 2 — ECR (container registry)

```bash
aws ecr create-repository --repository-name unshelvd --region $AWS_REGION

# Authenticate Docker to ECR
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS \
    --password-stdin ${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com
```

### Step 3 — Build and push the Docker image

```bash
IMAGE="${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com/unshelvd:latest"

docker build \
  --build-arg VITE_STRIPE_PUBLISHABLE_KEY=pk_live_... \
  -t $IMAGE .

docker push $IMAGE
```

> Add this to a GitHub Actions workflow for automated deploys on push to `main`
> (see `.github/workflows/` for the existing CI pattern).

### Step 4 — RDS PostgreSQL

```bash
# Create a DB subnet group (use your VPC's private subnets)
aws rds create-db-subnet-group \
  --db-subnet-group-name unshelvd-subnet-group \
  --db-subnet-group-description "Unshelv'd DB" \
  --subnet-ids subnet-XXXXXXXX subnet-YYYYYYYY

# Create the RDS instance (db.t4g.micro for low traffic)
aws rds create-db-instance \
  --db-instance-identifier unshelvd-db \
  --db-instance-class db.t4g.micro \
  --engine postgres \
  --engine-version 16.3 \
  --master-username unshelvd \
  --master-user-password CHOOSE_A_PASSWORD \
  --db-name unshelvd \
  --allocated-storage 20 \
  --no-publicly-accessible \
  --db-subnet-group-name unshelvd-subnet-group \
  --backup-retention-period 7 \
  --deletion-protection

# Wait for the instance to be available (~5-10 minutes)
aws rds wait db-instance-available --db-instance-identifier unshelvd-db

# Get the endpoint
aws rds describe-db-instances \
  --db-instance-identifier unshelvd-db \
  --query 'DBInstances[0].Endpoint.Address' --output text
```

The `DATABASE_URL` for RDS (SSL required — RDS enforces SSL by default):

```
postgresql://unshelvd:PASSWORD@your-endpoint.rds.amazonaws.com:5432/unshelvd?sslmode=require
```

### Step 5 — AWS Secrets Manager

```bash
aws secretsmanager create-secret \
  --name /unshelvd/DATABASE_URL \
  --secret-string "postgresql://unshelvd:PASSWORD@endpoint.rds.amazonaws.com:5432/unshelvd?sslmode=require"

aws secretsmanager create-secret \
  --name /unshelvd/SESSION_SECRET \
  --secret-string "$(openssl rand -hex 32)"

aws secretsmanager create-secret \
  --name /unshelvd/STRIPE_SECRET_KEY \
  --secret-string "sk_live_..."

aws secretsmanager create-secret \
  --name /unshelvd/STRIPE_WEBHOOK_SECRET \
  --secret-string "whsec_..."

aws secretsmanager create-secret \
  --name /unshelvd/ADMIN_EMAIL    --secret-string "admin@koshkikode.com"
aws secretsmanager create-secret \
  --name /unshelvd/ADMIN_USERNAME --secret-string "youradminusername"
aws secretsmanager create-secret \
  --name /unshelvd/ADMIN_PASSWORD \
  --secret-string "$(openssl rand -base64 18)!A1"
```

### Step 6 — IAM role for ECS tasks

Create a task execution role with:
- `AmazonECSTaskExecutionRolePolicy` (ECR pull + CloudWatch logs)
- `SecretsManagerReadWrite` restricted to `/unshelvd/*`

```bash
# Create the trust policy
cat > /tmp/trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "ecs-tasks.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
  --role-name unshelvd-ecs-task-role \
  --assume-role-policy-document file:///tmp/trust-policy.json

aws iam attach-role-policy \
  --role-name unshelvd-ecs-task-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Grant Secrets Manager access
cat > /tmp/secrets-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["secretsmanager:GetSecretValue"],
    "Resource": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:/unshelvd/*"
  }]
}
EOF

aws iam put-role-policy \
  --role-name unshelvd-ecs-task-role \
  --policy-name unshelvd-secrets \
  --policy-document file:///tmp/secrets-policy.json
```

### Step 7 — ECS Cluster + Task Definition

```bash
# Create the cluster
aws ecs create-cluster --cluster-name unshelvd

# Register the task definition (save as /tmp/task-def.json first)
# Key fields: image, environment variables from Secrets Manager, port 8080
```

Create `/tmp/task-def.json`:

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
      {"name": "DATABASE_URL",           "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:/unshelvd/DATABASE_URL"},
      {"name": "SESSION_SECRET",         "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:/unshelvd/SESSION_SECRET"},
      {"name": "STRIPE_SECRET_KEY",      "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:/unshelvd/STRIPE_SECRET_KEY"},
      {"name": "STRIPE_WEBHOOK_SECRET",  "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:/unshelvd/STRIPE_WEBHOOK_SECRET"}
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
      "command": ["CMD-SHELL", "curl -f http://localhost:8080/api/health || exit 1"],
      "interval": 30,
      "timeout": 5,
      "retries": 3,
      "startPeriod": 60
    }
  }]
}
```

```bash
# Replace ACCOUNT and REGION placeholders, then:
aws ecs register-task-definition --cli-input-json file:///tmp/task-def.json

# Create CloudWatch log group
aws logs create-log-group --log-group-name /ecs/unshelvd
```

### Step 8 — Application Load Balancer + ECS Service

Use the AWS Console or CDK/Terraform for full ALB + Security Group + ECS Service
setup (the CLI for this is verbose). Key settings:

- **ALB listener 443** → target group → ECS tasks on port 8080
- **ALB listener 80** → redirect to 443
- **ACM certificate** — request in Certificate Manager for `koshkikode.com` /
  `*.koshkikode.com`; Route 53 validates it automatically (DNS validation)
- **Security groups** — ALB: inbound 80/443 from `0.0.0.0/0`; ECS tasks: inbound
  8080 from ALB SG only; RDS: inbound 5432 from ECS task SG only
- **ECS service** — desired count 1, Fargate, enable auto-scaling (target 70% CPU)

### Step 9 — DNS (Route 53)

1. In Route 53 → koshkikode.com, add an **ALIAS** record:
   - Type: `A` (alias)
   - Name: `app` (or `@` for apex)
   - Value: your ALB DNS name

2. Register the Stripe webhook at `https://app.koshkikode.com/api/webhooks/stripe`.

### Step 10 — Run migrations and seed

```bash
# Run migrations using a one-off ECS task (Fargate)
aws ecs run-task \
  --cluster unshelvd \
  --task-definition unshelvd \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-XXXX],securityGroups=[sg-XXXX]}" \
  --overrides '{"containerOverrides":[{"name":"unshelvd","command":["node","script/migrate.js"]}]}'

# Run seed
aws ecs run-task \
  --cluster unshelvd \
  --task-definition unshelvd \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-XXXX],securityGroups=[sg-XXXX]}" \
  --overrides '{"containerOverrides":[{"name":"unshelvd","command":["node","script/seed.js"]}]}'
```

### SES email (same as hybrid)

See [Step 4 in the Hybrid section](#step-4--aws-ses-email). Set the SMTP env vars
as additional ECS task environment variables (or Secrets Manager entries).

---

## GCP Exclusive: Full Google Cloud

> Use this path if you want to move everything into GCP (or already have your
> domain in Cloud DNS / an external DNS provider).

The backend is identical to the Hybrid setup. The only difference is DNS.

### DNS options (no Route 53)

**Option A — Cloud DNS (migrate domain from Route 53)**

```bash
gcloud dns managed-zones create unshelvd-zone \
  --dns-name=koshkikode.com. \
  --description="Unshelv'd production zone"

# Get the name servers
gcloud dns managed-zones describe unshelvd-zone \
  --format='value(nameServers)'

# At your domain registrar, update the NS records to the above Cloud DNS name servers.
# If your domain is registered through Route 53 (just DNS hosting):
# AWS Console → Route 53 → Registered Domains → koshkikode.com → Edit Name Servers
```

**Option B — Keep Route 53 as the DNS host, add a CNAME only**

This is the Hybrid approach. No changes needed to Route 53 hosting — just add
the CNAME record pointing to the Cloud Run URL (see Hybrid Step 3).

### Cloud Run custom domain + TLS

```bash
# Map your domain to the Cloud Run service (Cloud handles TLS automatically)
gcloud run domain-mappings create \
  --service=unshelvd \
  --domain=app.koshkikode.com \
  --region=$REGION

# Cloud Run will print CNAME/A/AAAA records to add in Cloud DNS or Route 53
gcloud run domain-mappings describe \
  --domain=app.koshkikode.com \
  --region=$REGION
```

### Email in GCP-only setup

Google Cloud does not provide a built-in SMTP service. Recommended options:

| Provider | Free tier | Notes |
|----------|-----------|-------|
| **SendGrid** | 100 emails/day | Easy setup, SES-compatible env vars |
| **Mailgun** | 1,000 emails/month (Flex) | EU/US regions |
| **AWS SES via API** | 62,000 emails/month (from EC2/GCR) | Cheapest if volume is high |
| **Postmark** | Paid only | Best deliverability for transactional |

For SendGrid:

```bash
# Use the same SMTP env vars — just change the host
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.YOUR_SENDGRID_API_KEY
EMAIL_FROM=Unshelv'd <noreply@koshkikode.com>
```

Store in Secret Manager and add to `--set-secrets` in `cloudbuild.yaml`.

### Everything else

Infrastructure setup (Cloud SQL, Artifact Registry, Secret Manager, Cloud Run
deployment, monitoring, backups) is identical to the [Hybrid path](#step-1--google-cloud-infrastructure-one-time).

---

## Mobile App Deployment

### Android (Google Play Store)

```bash
# Build signed release AAB
VITE_API_URL=https://app.koshkikode.com npm run build
npx cap sync android

cd android

# Create signing keystore (once)
keytool -genkey -v \
  -keystore unshelvd-release.keystore \
  -alias unshelvd \
  -keyalg RSA -keysize 2048 -validity 10000

# Build release AAB
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

Upload the `.aab` to [Google Play Console](https://play.google.com/console).

### iOS (Apple App Store)

```bash
VITE_API_URL=https://app.koshkikode.com npm run build
npx cap sync ios
npx cap open ios   # opens Xcode (macOS only)
```

In Xcode: Product → Archive → Distribute App → App Store Connect.

See [MOBILE.md](./MOBILE.md) for full signing details.

---

## Cost Comparison

> All prices are approximate **monthly** USD as of mid-2025. "Low traffic" means
> < 10,000 MAU; "medium" means ~50,000 MAU. Domain costs ($14/yr Route 53) are
> excluded per your request.

### Hybrid (AWS Route 53 + GCP Cloud Run)

| Service | Tier | Approx cost/month |
|---------|------|-------------------|
| **Cloud Run** (1 min instance, 512 MB) | 1 always-warm instance | ~$10–15 |
| **Cloud Run** request charges | 10k–500k requests/month | ~$0–2 |
| **Cloud SQL** PostgreSQL | db-f1-micro (0.6 GB RAM) | ~$7 |
| **Artifact Registry** | <1 GB storage | ~$0.10 |
| **Secret Manager** | 10 secrets, 10k accesses | ~$0.10 |
| **Cloud Build** | 120 min/day free, then $0.003/min | ~$0 (free tier) |
| **Cloud Monitoring** uptime checks | 1 check × 1-min interval | ~$0 |
| **AWS SES** email | 1,000 emails/month | ~$0.10 |
| **Stripe** fees | 2.9% + $0.30 per transaction | Variable |
| **Total (low traffic)** | | **~$18–25/month** |
| **Total (medium traffic)** | db-g1-small, 2 CR instances | **~$55–75/month** |

### AWS Exclusive (ECS Fargate + RDS)

| Service | Tier | Approx cost/month |
|---------|------|-------------------|
| **ECS Fargate** (0.5 vCPU, 1 GB, 1 task) | ~730 hrs/month | ~$15–20 |
| **RDS PostgreSQL** | db.t4g.micro, 20 GB | ~$15–18 |
| **ALB** (Application Load Balancer) | always-on | ~$18–22 |
| **ECR** | <1 GB storage | ~$0.10 |
| **Secrets Manager** | 5 secrets | ~$2 |
| **CloudWatch Logs** | 5 GB/month | ~$2–3 |
| **ACM TLS certificate** | Free with ALB | $0 |
| **Data transfer out** | <10 GB/month | ~$1 |
| **SES email** | 1,000 emails/month | ~$0.10 |
| **Total (low traffic)** | | **~$53–66/month** |
| **Total (medium traffic)** | db.t4g.small, 2 tasks, more logs | **~$110–140/month** |

> **ALB cost note:** The ALB (~$18/month base) is the biggest AWS-exclusive overhead.
> AWS App Runner (no ALB needed, similar to Cloud Run) costs ~$5/month base for the
> compute + $0.05/vCPU-hr and can reduce this to ~$30–40/month total at low traffic.

### GCP Exclusive (Full Google Cloud)

Identical to **Hybrid** pricing for the GCP components. Email changes:

| Email provider | Cost for 1k emails/month |
|----------------|--------------------------|
| AWS SES (via hybrid) | ~$0.10 |
| SendGrid (free tier) | $0 |
| Mailgun (Flex) | $0 (free 1k/month) |
| Postmark | ~$15 (100 credits) |

**GCP Exclusive total (low traffic): ~$18–25/month** (same as Hybrid — AWS SES
swapped for free SendGrid/Mailgun tier).

### Summary

| Path | Low traffic | Medium traffic | Complexity |
|------|-------------|----------------|------------|
| **Hybrid (recommended)** | ~$18–25/mo | ~$55–75/mo | Low (current setup) |
| **GCP Exclusive** | ~$18–25/mo | ~$55–75/mo | Low |
| **AWS Exclusive** | ~$53–66/mo | ~$110–140/mo | Medium |

**Winner on cost: Hybrid or GCP Exclusive.** Cloud Run's serverless pricing and
Cloud SQL's micro tier are meaningfully cheaper than ECS Fargate + ALB + RDS at
low-to-medium traffic. AWS becomes more cost-competitive at high scale (>100k MAU)
where Reserved Instances reduce RDS and compute costs significantly.

---

## Updating / Re-deploying

### Hybrid / GCP

```bash
# Deploy new version (builds, migrates, seeds if needed, deploys)
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_STRIPE_PK=pk_live_...

# Or set up auto-deploy on push to main (see DEPLOY.md § Automated Cloud Build Trigger)
```

### AWS

```bash
# Rebuild and push new image
docker build --build-arg VITE_STRIPE_PUBLISHABLE_KEY=pk_live_... \
  -t $IMAGE .
docker push $IMAGE

# Update the ECS service (triggers rolling deploy)
aws ecs update-service \
  --cluster unshelvd \
  --service unshelvd \
  --force-new-deployment
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Cloud Run container never starts | Migration taking >240s or wrong Cloud SQL instance ID | Check `--set-cloudsql-instances` format: `PROJECT:REGION:INSTANCE` |
| `schema already exists` on startup | First deploy on empty DB | Run `GRANT ALL ON SCHEMA public TO public;` via psql, then redeploy |
| Catalog is empty after deploy | Seed job skipped (tables not empty) | `TRUNCATE works CASCADE; TRUNCATE book_catalog;` then re-run seed job |
| ECS task exits immediately | Missing secrets or wrong IAM permissions | Check CloudWatch logs for startup error; verify Secrets Manager ARNs |
| Stripe webhooks failing | Wrong endpoint URL or signing secret | Verify endpoint URL in Stripe Dashboard matches your domain |
| Emails not delivered | SES still in sandbox mode | Request SES production access in AWS Console |
| CORS errors in browser | Production domain not in allowed origins | Add domain to `allowedOrigins` in `server/index.ts`, redeploy |
| Mobile app can't reach API | `VITE_API_URL` not set at build time | Rebuild with `VITE_API_URL=https://YOUR_DOMAIN` |

---

*For the Google Cloud-only deployment reference, see [DEPLOY.md](./DEPLOY.md).
For mobile build details, see [MOBILE.md](./MOBILE.md).
For desktop (Tauri) setup, see [DESKTOP.md](./DESKTOP.md).*
