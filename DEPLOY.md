# Unshelv'd — Deployment Guide (AWS)

This is the single deployment reference for this repository.

## Production URL (canonical)

```
https://unshelvd.koshkikode.com/
```

---

## Stack

| Service | Role |
|---------|------|
| **GitHub Actions** | CI/CD — type-check/build/test on every PR; deploy to ECR + App Runner on `main` |
| **Amazon ECR** | Docker image registry |
| **AWS App Runner** | Backend API + WebSocket server (containerised) |
| **Amazon RDS for PostgreSQL** | Managed database |
| **AWS Secrets Manager** | Runtime secrets (database URL, session key, Stripe, PayPal) |
| **Amazon S3** | Profile image / cover uploads |
| **AWS Amplify Hosting** | SPA CDN, custom domain (`unshelvd.koshkikode.com`), managed TLS, `/api/**` rewrite proxy |
| **Amazon CloudWatch** | Logs, metrics, alarms |
| **Amazon Route 53** | DNS host for `koshkikode.com` |

### Request routing

```
Route 53 (DNS) → Amplify Hosting (unshelvd.koshkikode.com)
                     │
                     ├── /          → SPA static files (Amplify global CDN)
                     └── /api/**    → App Runner service (rewrite proxy)
```

### Why Amplify Hosting + App Runner (not App Runner alone)

Unshelv'd is a global peer-to-peer marketplace. The two services serve completely different workloads:

| Traffic type | Served by | Cost model |
|---|---|---|
| SPA shell, JS/CSS bundles, static assets | Amplify Hosting CDN | Per-GB egress (very cheap) |
| API calls — listings, auth, Stripe | App Runner | Per-vCPU-second + memory |

A user in Tokyo, Lagos, or São Paulo gets the frontend from the nearest CloudFront edge node fronting Amplify — no cold-start latency on browse pages. App Runner only handles actual API traffic.

**Route 53 role:** authoritative DNS for `koshkikode.com`. It delegates to Amplify Hosting via the records Amplify provides during the custom-domain wizard. It does not proxy traffic.

---

## 1. Prerequisites

```bash
node --version   # 20+
npm --version    # 10+
docker --version # 24+
aws --version    # AWS CLI v2
```

You'll also need an AWS account with permission to create IAM roles, ECR repos, App Runner services, RDS instances, S3 buckets, and Secrets Manager secrets.

---

## 2. Clone, install, verify locally

```bash
git clone https://github.com/KoshkiKode/unshelvd.git
cd unshelvd
npm install
npm run check
npm test
npm run build
```

---

## 3. Set shell variables (copy/paste once per session)

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export ECR_REPO=unshelvd
export APPRUNNER_SERVICE=unshelvd
export S3_BUCKET=unshelvd-uploads
export RDS_INSTANCE=unshelvd-db
export DOMAIN=unshelvd.koshkikode.com
```

---

## 4. Amazon ECR — image registry (one time)

```bash
aws ecr create-repository \
  --repository-name "$ECR_REPO" \
  --region "$AWS_REGION" \
  --image-scanning-configuration scanOnPush=true
```

---

## 5. Amazon RDS — PostgreSQL (one time)

Create a small Postgres instance in the same region. Adjust storage/instance class to taste.

```bash
aws rds create-db-instance \
  --db-instance-identifier "$RDS_INSTANCE" \
  --db-instance-class db.t4g.micro \
  --engine postgres \
  --engine-version 16 \
  --allocated-storage 20 \
  --storage-type gp3 \
  --master-username unshelvd \
  --master-user-password "$(openssl rand -base64 24)" \
  --publicly-accessible \
  --backup-retention-period 7 \
  --region "$AWS_REGION"
```

> ⚠️  `--publicly-accessible` is the simplest option for a single-region setup; lock it down with a security group that only allows your App Runner egress + your laptop. For production hardening, put App Runner and RDS in the same VPC and use a VPC Connector instead.

After the instance is `available`, grab the endpoint:

```bash
aws rds describe-db-instances \
  --db-instance-identifier "$RDS_INSTANCE" \
  --query 'DBInstances[0].Endpoint.Address' --output text
```

Build the connection string:

```
postgresql://unshelvd:<MASTER_PASSWORD>@<ENDPOINT>:5432/unshelvd?sslmode=require
```

Create the database:

```bash
psql "postgresql://unshelvd:<PASSWORD>@<ENDPOINT>:5432/postgres?sslmode=require" \
  -c "CREATE DATABASE unshelvd;"
```

---

## 6. AWS Secrets Manager — runtime secrets (one time)

Create one secret per value. The deploy workflow expects to look these up by name.

```bash
aws secretsmanager create-secret --name unshelvd/DATABASE_URL \
  --secret-string "postgresql://unshelvd:<PASSWORD>@<ENDPOINT>:5432/unshelvd?sslmode=require"

aws secretsmanager create-secret --name unshelvd/SESSION_SECRET \
  --secret-string "$(openssl rand -hex 32)"

# Stripe (only if payments are enabled)
aws secretsmanager create-secret --name unshelvd/STRIPE_SECRET_KEY     --secret-string "sk_live_..."
aws secretsmanager create-secret --name unshelvd/STRIPE_WEBHOOK_SECRET --secret-string "whsec_..."

# PayPal (optional)
aws secretsmanager create-secret --name unshelvd/PAYPAL_CLIENT_SECRET --secret-string "..."
```

---

## 7. Amazon S3 — profile image bucket (one time)

```bash
aws s3api create-bucket \
  --bucket "$S3_BUCKET" \
  --region "$AWS_REGION" \
  $( [ "$AWS_REGION" != "us-east-1" ] && echo --create-bucket-configuration LocationConstraint="$AWS_REGION" )

# Disable Block Public Access for this bucket so the public-read policy below can take effect.
aws s3api put-public-access-block \
  --bucket "$S3_BUCKET" \
  --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# Allow anonymous GET on the avatar/cover prefixes only.
cat > /tmp/bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadAvatarsAndCovers",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": [
        "arn:aws:s3:::$S3_BUCKET/avatars/*",
        "arn:aws:s3:::$S3_BUCKET/covers/*"
      ]
    }
  ]
}
EOF
aws s3api put-bucket-policy --bucket "$S3_BUCKET" --policy file:///tmp/bucket-policy.json
```

> Prefer to keep the bucket private? Front it with CloudFront and configure a CloudFront Origin Access Control (OAC) — then update `server/s3.ts` `publicUrl()` to return the CloudFront URL instead.

---

## 8. AWS App Runner — backend service (one time)

The simplest path is the Console wizard:

1. Open **App Runner → Create service**.
2. Source: **Container registry → Amazon ECR**, image `…dkr.ecr.<region>.amazonaws.com/unshelvd:latest`.
3. Deployment trigger: **Manual** (the GitHub Actions workflow calls `start-deployment` after each image push).
4. Let App Runner create a new **ECR access role** (it needs `AmazonEC2ContainerRegistryReadOnly`).
5. Service settings:
   - Port: `8080`
   - CPU/Memory: 1 vCPU / 2 GB (start small — App Runner scales horizontally automatically)
   - **Instance role**: create one with this inline policy so the service can read secrets and write to S3:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Action": ["secretsmanager:GetSecretValue"],
           "Resource": "arn:aws:secretsmanager:*:*:secret:unshelvd/*"
         },
         {
           "Effect": "Allow",
           "Action": ["s3:PutObject", "s3:DeleteObject"],
           "Resource": "arn:aws:s3:::unshelvd-uploads/*"
         }
       ]
     }
     ```
6. **Environment variables** (non-secret) — match `apprunner.yaml`:
   - `NODE_ENV=production`
   - `PORT=8080`
   - `APP_URL=https://unshelvd.koshkikode.com`
   - `PUBLIC_APP_URL=https://unshelvd.koshkikode.com`
   - `WEB_BASE_URL=https://unshelvd.koshkikode.com`
   - `CORS_ALLOWED_ORIGINS=https://unshelvd.koshkikode.com`
   - `S3_BUCKET_NAME=unshelvd-uploads`
7. **Environment variable references** (from Secrets Manager) — choose "Reference" type for each:
   - `DATABASE_URL`         → `arn:aws:secretsmanager:…:secret:unshelvd/DATABASE_URL-…`
   - `SESSION_SECRET`       → `…unshelvd/SESSION_SECRET-…`
   - `STRIPE_SECRET_KEY`    → `…unshelvd/STRIPE_SECRET_KEY-…` *(only if enabled)*
   - `STRIPE_WEBHOOK_SECRET`→ `…unshelvd/STRIPE_WEBHOOK_SECRET-…` *(only if enabled)*
   - `PAYPAL_CLIENT_SECRET` → `…unshelvd/PAYPAL_CLIENT_SECRET-…` *(optional)*
8. Health check path: `/api/health` (HTTP, port 8080).

After the service is created, copy the **service ARN** and the default `*.awsapprunner.com` URL — you'll need both shortly.

---

## 9. GitHub OIDC role — let CI deploy without long-lived keys (one time)

Add GitHub as an OIDC identity provider in IAM (only needed once per AWS account):

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

Create the deploy role (`unshelvd-github-deploy`) with this trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike":   { "token.actions.githubusercontent.com:sub": "repo:KoshkiKode/unshelvd:*" }
    }
  }]
}
```

Attach an inline policy granting:
- `ecr:GetAuthorizationToken`, `ecr:Batch*`, `ecr:Put*`, `ecr:Initiate*`, `ecr:Upload*`, `ecr:Complete*` on the repository
- `apprunner:StartDeployment` on the service ARN
- `secretsmanager:GetSecretValue` on `unshelvd/DATABASE_URL` (used by the migrate job)

---

## 10. Configure the GitHub repository

**Settings → Secrets and variables → Actions → Secrets**:

| Secret | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::<ACCOUNT_ID>:role/unshelvd-github-deploy` |
| `APPRUNNER_SERVICE_ARN` | The App Runner service ARN from step 8 |

**Settings → Secrets and variables → Actions → Variables**:

| Variable | Value |
|---|---|
| `AWS_REGION` | `us-east-1` (or your region) |
| `ECR_REPOSITORY` | `unshelvd` |
| `DATABASE_URL_SECRET_ID` | `unshelvd/DATABASE_URL` |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_…` (baked into the Vite client at build time) |
| `THRIFTBOOKS_AFF_ID` | *(optional)* |
| `ADSENSE_CLIENT` | *(optional)* AdSense publisher ID |

---

## 11. AWS Amplify Hosting — frontend + custom domain

1. **Amplify Console → Host web app → GitHub** → pick this repo, branch `main`.
2. Amplify auto-detects `amplify.yml`. Confirm the build settings.
3. Set the same Vite-prefixed env vars as build-time variables in the Amplify console:
   - `VITE_STRIPE_PUBLISHABLE_KEY`
   - `VITE_THRIFTBOOKS_AFF_ID` *(optional)*
   - `VITE_ADSENSE_CLIENT` *(optional)*
   - Leave `VITE_API_URL` unset so the SPA uses same-origin requests.
4. **Rewrites and redirects** — Amplify replaces the old Firebase Hosting `/api/**` rewrite. Add these rules in order:

   | Source | Target | Type |
   |---|---|---|
   | `/api/<*>` | `https://<APP_RUNNER_URL>.awsapprunner.com/api/<*>` | `200 (Rewrite)` |
   | `/<*>` | `/index.html` | `200 (Rewrite)` |

   Order matters — the API rule must be **above** the SPA fallback.
5. **Custom domain** → add `unshelvd.koshkikode.com`. Amplify will issue an ACM certificate and give you the CNAME(s) to add in Route 53. Point the apex (`koshkikode.com`) and `www` redirects in the same wizard if desired.

---

## 12. First deploy

The `Deploy` workflow runs on every push to `main`. Trigger the first one manually from the Actions tab to confirm the OIDC role and ECR push work end-to-end.

```bash
git commit --allow-empty -m "ci: trigger first AWS deploy"
git push origin main
```

The workflow:
1. Builds the Docker image with the Vite client baked in.
2. Pushes `:<sha>` and `:latest` tags to ECR.
3. Calls `aws apprunner start-deployment` against the service ARN.
4. Runs `node script/migrate.js` against RDS using a temporary DATABASE_URL pulled from Secrets Manager.

App Runner will pull the new `:latest` image and roll the service.

---

## 13. Post-deploy verification

```bash
curl -fsS https://$DOMAIN/api/health | jq .
curl -fsS https://$DOMAIN/                 # SPA HTML
```

CloudWatch Logs are at:
- `/aws/apprunner/<service>/<service-id>/application` — app stdout/stderr
- `/aws/apprunner/<service>/<service-id>/service`     — App Runner platform events

---

## Rollbacks

App Runner keeps the previous container image around. To roll back:

1. **Console** → App Runner → service → **Deployments** tab → pick a previous deployment → **Redeploy**.
2. Or push a new commit that resets the image tag — the deploy workflow always tags `:latest`, so rolling forward is the usual path.

---

## Local dev parity

Local development continues to use Docker Compose for Postgres and the data-URI fallback for image uploads (no S3 needed). See `README.md` for the local setup walkthrough.