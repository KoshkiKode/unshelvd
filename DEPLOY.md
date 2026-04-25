# Unshelv'd — Full Production Deployment Guide (AWS)

This is the single, complete deployment reference for this repository.
Follow every step in order — sections marked **(one time)** only need to be
done on the very first deploy.

## Canonical identifiers (do not drift)

| | |
|---|---|
| **Production URL** | `https://unshelvd.koshkikode.com` |
| **Mobile bundle / application ID** | `com.koshkikode.unshelvd` (Android `applicationId` + iOS `PRODUCT_BUNDLE_IDENTIFIER` + Capacitor `appId`) |
| **Desktop bundle ID (Tauri)** | `com.koshkikode.unshelvd.desktop` |
| **AWS App Runner service name** | `unshelvd` |
| **Amazon ECR repository** | `unshelvd` |
| **Amazon RDS instance** | `unshelvd-db` |
| **Amazon S3 uploads bucket** | `unshelvd-uploads` |
| **Sender email** | `noreply@koshkikode.com` |

These values appear throughout this guide, in `apprunner.yaml`,
`capacitor.config.ts`, `android/app/build.gradle`, the iOS Xcode project,
`server/index.ts` (CORS allow-list), and `client/index.html` (canonical /
Open Graph tags). If you change one, change them all.

## Production URL (canonical)

```
https://unshelvd.koshkikode.com/
```

The apex domain `koshkikode.com` (and its `www.` host) is also operated by
the same team on AWS Amplify Hosting. The backend's CORS allow-list includes
both `https://koshkikode.com` and `https://www.koshkikode.com` so a sibling
marketing site on the apex domain can call the Unshelv'd API without extra
configuration.

---

## Quick-reference: what you will build

```
Route 53 (DNS)
  └── koshkikode.com / unshelvd.koshkikode.com
        │
        ├── /            → Amplify Hosting (SPA on CloudFront global CDN)
        ├── /api/**      → Amplify rewrite → AWS App Runner (Express API)
        └── /ws/**       → Amplify rewrite → AWS App Runner (WebSocket chat)

App Runner container
  ├── reads secrets from AWS Secrets Manager on startup
  ├── connects to Amazon RDS for PostgreSQL (database)
  └── writes profile / cover images to Amazon S3

GitHub Actions
  ├── ci.yml         — type-check + build + test on every PR / push
  └── deploy.yml     — migrate DB → build Docker image → push ECR → App Runner
```

| Service | Role |
|---------|------|
| **GitHub Actions** | CI/CD |
| **Amazon ECR** | Docker image registry |
| **AWS App Runner** | Backend API + WebSocket server (containerised) |
| **Amazon RDS for PostgreSQL** | Managed database |
| **AWS Secrets Manager** | Runtime secrets (database URL, session key, Stripe, PayPal) |
| **Amazon S3** | Profile image and cover uploads |
| **AWS Amplify Hosting** | SPA CDN, custom domain, managed TLS, `/api/**` and `/ws/**` rewrite proxy |
| **Amazon CloudWatch** | Logs, metrics, alarms |
| **Amazon Route 53** | DNS host for `koshkikode.com` |

> 💡 This guide uses **test-mode Stripe/PayPal credentials** for first launch.
> Swap in live keys only after the platform has been reviewed and you're ready
> to accept real money.

---

## Inputs you'll need before you start

Have these values ready — the rest of the doc is copy/paste once they're in
your shell.

| Input | Where it comes from | Used in |
|---|---|---|
| AWS account ID | `aws sts get-caller-identity` | IAM, ECR, secrets ARNs |
| AWS region | Your choice (e.g. `us-east-1`) | Every `aws` command |
| Production domain | `unshelvd.koshkikode.com` | Amplify, App Runner env, CORS |
| RDS master password | You generate (`openssl rand -base64 24`) | RDS, Secrets Manager |
| Admin email + password | You choose | First-login credentials |
| SMTP credentials | Your email provider | Transactional email |
| Stripe **test** keys (publishable + secret) | Stripe dashboard → Developers | Build args, Secrets Manager |
| Stripe webhook signing secret (test) | Stripe dashboard → Webhooks | Secrets Manager |
| PayPal sandbox credentials *(optional)* | PayPal developer portal | Secrets Manager |

---

## Step 0 — Pre-deploy code changes (REQUIRED before first deploy)

These are code changes that **must be made in the repository before any
deployment will work**. Do them on a branch, get them merged to `main`, and
then continue with the infrastructure steps.

### 0a. Remove the maintenance mode block

`server/index.ts` contains a middleware that returns HTTP 503 for every API
call. This was added as a temporary hold during maintenance and **must be
removed** before going live.

Open `server/index.ts` and delete these three lines (around line 141):

```ts
// ── Maintenance mode — all API endpoints temporarily disabled ──────────────
app.use("/api", (_req, res) => {
  res.status(503).json({ message: "Service temporarily unavailable. Please try again later." });
});
```

After deleting them, the `app.use` request-logging middleware immediately
below becomes the first thing that runs for every request, and
`registerRoutes()` (called shortly after) registers all the API handlers.

### 0b. Re-enable the CI workflow

`.github/workflows/ci.yml` has `if: false` on the `test` job, which disables
type-checking, building, and testing on every push. Remove that line so CI
runs normally:

```yaml
  test:
    name: Type-check, Build & Test
    # if: false   ← delete this line
    runs-on: ubuntu-latest
```

### 0c. Re-enable the Deploy workflow

`.github/workflows/deploy.yml` has `if: false` on both the `migrate` and
`build-and-deploy` jobs. Remove both:

```yaml
  migrate:
    name: Drizzle migrate (Amazon RDS)
    # if: false   ← delete this line
    runs-on: ubuntu-latest

  build-and-deploy:
    name: Build → ECR → App Runner
    # if: false   ← delete this line
    runs-on: ubuntu-latest
```

### 0d. Uncomment `S3_BUCKET_NAME` in `apprunner.yaml`

`apprunner.yaml` has the `S3_BUCKET_NAME` environment variable commented out.
Uncomment it so App Runner passes it to the container:

```yaml
    - name: S3_BUCKET_NAME
      value: unshelvd-uploads
```

### 0e. Commit and push

```bash
git add server/index.ts .github/workflows/ci.yml .github/workflows/deploy.yml apprunner.yaml
git commit -m "chore: remove maintenance mode, re-enable CI/deploy workflows, enable S3"
git push origin main
```

---

## Step 1 — Prerequisites

Install these tools on your workstation before running any AWS CLI commands.

```bash
node --version   # 20 or higher
npm --version    # 10 or higher
docker --version # 24 or higher
aws --version    # AWS CLI v2 — https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
psql --version   # PostgreSQL client — used once to create the database
jq --version     # JSON processor — used in the verification steps
```

Authenticate the AWS CLI with an IAM user or role that has permission to
create IAM roles, ECR repositories, App Runner services, RDS instances, S3
buckets, and Secrets Manager secrets:

```bash
aws configure
# AWS Access Key ID:     <your key>
# AWS Secret Access Key: <your secret>
# Default region name:   us-east-1
# Default output format: json
```

Verify it works:

```bash
aws sts get-caller-identity
```

---

## Step 2 — Clone, install, and verify locally

```bash
git clone https://github.com/KoshkiKode/unshelvd.git
cd unshelvd
npm install
npm run check    # TypeScript type-check
npm test         # unit tests
npm run build    # full production build
```

All three commands must succeed before continuing.

---

## Step 3 — Set shell variables (copy/paste once per terminal session)

These variables are referenced by every AWS CLI command in this guide.
Run them all in the same terminal before continuing.

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export ECR_REPO=unshelvd
export APPRUNNER_SERVICE=unshelvd
export S3_BUCKET=unshelvd-uploads
export RDS_INSTANCE=unshelvd-db
export DOMAIN=unshelvd.koshkikode.com

echo "Account: $AWS_ACCOUNT_ID  Region: $AWS_REGION"
```

---

## Step 4 — Amazon ECR — Docker image registry (one time)

Create the repository that will hold the production Docker images. ECR
vulnerability scanning is enabled so every pushed image is scanned
automatically.

```bash
aws ecr create-repository \
  --repository-name "$ECR_REPO" \
  --region "$AWS_REGION" \
  --image-scanning-configuration scanOnPush=true \
  --image-tag-mutability MUTABLE
```

Note the repository URI printed in the output — it looks like:
`<ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/unshelvd`.
You will use this URI when creating the App Runner service in Step 7.

---

## Step 5 — Amazon RDS — PostgreSQL database (one time)

### 5a. Generate and save the master password

```bash
export RDS_PASSWORD="$(openssl rand -base64 24)"
echo "RDS master password: $RDS_PASSWORD"
# Save this somewhere safe (1Password, AWS Secrets Manager, etc.)
# You cannot retrieve it from AWS after this point.
```

### 5b. Create the RDS instance

```bash
aws rds create-db-instance \
  --db-instance-identifier "$RDS_INSTANCE" \
  --db-instance-class db.t4g.micro \
  --engine postgres \
  --engine-version 16 \
  --allocated-storage 20 \
  --storage-type gp3 \
  --master-username unshelvd \
  --master-user-password "$RDS_PASSWORD" \
  --publicly-accessible \
  --backup-retention-period 7 \
  --deletion-protection \
  --region "$AWS_REGION"
```

> ⚠️ `--publicly-accessible` is the simplest option for a first deploy. To
> harden for production, see **Step 5e** below.

### 5c. Wait for the instance to become available

This takes 5–10 minutes. Poll until the status is `available`:

```bash
watch -n 30 "aws rds describe-db-instances \
  --db-instance-identifier $RDS_INSTANCE \
  --query 'DBInstances[0].DBInstanceStatus' --output text"
# Press Ctrl-C when it shows "available"
```

### 5d. Grab the endpoint and create the application database

```bash
export RDS_ENDPOINT="$(aws rds describe-db-instances \
  --db-instance-identifier "$RDS_INSTANCE" \
  --query 'DBInstances[0].Endpoint.Address' --output text)"
echo "RDS endpoint: $RDS_ENDPOINT"

# Connect to the default "postgres" database and create the app database
psql "postgresql://unshelvd:${RDS_PASSWORD}@${RDS_ENDPOINT}:5432/postgres?sslmode=require" \
  -c "CREATE DATABASE unshelvd;"
```

The full connection string for subsequent steps is:

```
postgresql://unshelvd:<PASSWORD>@<RDS_ENDPOINT>:5432/unshelvd?sslmode=require
```

### 5e. (Recommended) Lock down the RDS security group

By default, `--publicly-accessible` exposes the database to the internet on
port 5432. Restrict it to your IP and the App Runner NAT range:

1. **AWS Console → EC2 → Security Groups** — find the security group attached
   to the RDS instance (named something like `default` or `rds-launch-wizard`).
2. **Inbound rules → Edit → Add rule**:
   - Type: `PostgreSQL`  Port: `5432`  Source: **My IP** (your workstation)
3. After creating the App Runner service (Step 7), add a second inbound rule
   with the App Runner NAT gateway IP shown in the service's **Networking** tab.
4. For a fully private setup, create a VPC with private subnets, place both
   App Runner (via a VPC Connector) and RDS in it, and remove public
   accessibility from RDS altogether.

---

## Step 6 — AWS Secrets Manager — runtime secrets (one time)

Create one secret per sensitive value. The deploy workflow reads
`DATABASE_URL` from Secrets Manager during migrations; App Runner reads all
of them at startup as environment variable references.

Replace every `<PLACEHOLDER>` with real values before running.

```bash
# Database URL (built from Step 5)
aws secretsmanager create-secret \
  --name unshelvd/DATABASE_URL \
  --region "$AWS_REGION" \
  --secret-string "postgresql://unshelvd:${RDS_PASSWORD}@${RDS_ENDPOINT}:5432/unshelvd?sslmode=require"

# Session secret — must be a long random hex string
aws secretsmanager create-secret \
  --name unshelvd/SESSION_SECRET \
  --region "$AWS_REGION" \
  --secret-string "$(openssl rand -hex 32)"

# Stripe (required if payments are enabled)
aws secretsmanager create-secret \
  --name unshelvd/STRIPE_SECRET_KEY \
  --region "$AWS_REGION" \
  --secret-string "sk_test_..."   # replace with sk_live_... for production

aws secretsmanager create-secret \
  --name unshelvd/STRIPE_WEBHOOK_SECRET \
  --region "$AWS_REGION" \
  --secret-string "whsec_..."    # signing secret from Stripe dashboard → Webhooks

# PayPal (optional — only needed if PayPal checkout is enabled)
aws secretsmanager create-secret \
  --name unshelvd/PAYPAL_CLIENT_SECRET \
  --region "$AWS_REGION" \
  --secret-string "EFgh..."      # from PayPal Developer → My Apps & Credentials

# SMTP password (required for transactional email)
aws secretsmanager create-secret \
  --name unshelvd/SMTP_PASS \
  --region "$AWS_REGION" \
  --secret-string "your-smtp-password"
```

To update a secret later (e.g. rotating the session key):

```bash
aws secretsmanager put-secret-value \
  --secret-id unshelvd/SESSION_SECRET \
  --secret-string "$(openssl rand -hex 32)"
```

---

## Step 7 — Amazon S3 — profile image and cover bucket (one time)

### 7a. Create the bucket

```bash
# us-east-1 does not accept a LocationConstraint parameter
if [ "$AWS_REGION" = "us-east-1" ]; then
  aws s3api create-bucket \
    --bucket "$S3_BUCKET" \
    --region "$AWS_REGION"
else
  aws s3api create-bucket \
    --bucket "$S3_BUCKET" \
    --region "$AWS_REGION" \
    --create-bucket-configuration LocationConstraint="$AWS_REGION"
fi
```

### 7b. Enable public read for avatar and cover prefixes only

```bash
# Remove the account-level Block Public Access override so the bucket
# policy below can take effect.
aws s3api put-public-access-block \
  --bucket "$S3_BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# Write the policy allowing anonymous GET on avatars/* and covers/* only
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
        "arn:aws:s3:::${S3_BUCKET}/avatars/*",
        "arn:aws:s3:::${S3_BUCKET}/covers/*"
      ]
    }
  ]
}
EOF
aws s3api put-bucket-policy --bucket "$S3_BUCKET" --policy file:///tmp/bucket-policy.json
```

### 7c. Enable versioning (recommended for production)

```bash
aws s3api put-bucket-versioning \
  --bucket "$S3_BUCKET" \
  --versioning-configuration Status=Enabled
```

> **Private bucket alternative:** Keep `BlockPublicPolicy=true`, create a
> CloudFront distribution with Origin Access Control (OAC) pointing at this
> bucket, and update `server/s3.ts` `publicUrl()` to return the CloudFront
> domain instead of the S3 virtual-hosted URL.

---

## Step 8 — AWS App Runner — backend service (one time)

### 8a. Create the App Runner instance IAM role

The App Runner container needs permission to read Secrets Manager and write
to S3. Create a role it can assume at runtime.

```bash
# Save the trust policy
cat > /tmp/apprunner-trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "tasks.apprunner.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
  --role-name unshelvd-apprunner-instance \
  --assume-role-policy-document file:///tmp/apprunner-trust.json

# Attach the permissions policy
cat > /tmp/apprunner-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadSecrets",
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:unshelvd/*"
    },
    {
      "Sid": "WriteS3",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::${S3_BUCKET}/*"
    }
  ]
}
EOF
aws iam put-role-policy \
  --role-name unshelvd-apprunner-instance \
  --policy-name unshelvd-apprunner-permissions \
  --policy-document file:///tmp/apprunner-policy.json

export INSTANCE_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/unshelvd-apprunner-instance"
echo "Instance role ARN: $INSTANCE_ROLE_ARN"
```

### 8b. Create the service via the AWS Console

The Console wizard is the fastest path for a first-time setup:

1. Open **AWS Console → App Runner → Create service**.
2. **Source**: Container registry → **Amazon ECR** →
   image `<ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/unshelvd:latest`.
3. **ECR access**: let App Runner create a new ECR access role
   (needs `AmazonEC2ContainerRegistryReadOnly`).
4. **Deployment trigger**: **Manual** (CI calls `start-deployment` after
   each image push, so automatic ECR polling is unnecessary).
5. **Service settings**:
   - Service name: `unshelvd`
   - Port: `8080`
   - CPU: `1 vCPU`  Memory: `2 GB`
   - Instance role: select `unshelvd-apprunner-instance` (created above)
6. **Environment variables** — add these as plain (non-secret) values:

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `PORT` | `8080` |
   | `APP_URL` | `https://unshelvd.koshkikode.com` |
   | `PUBLIC_APP_URL` | `https://unshelvd.koshkikode.com` |
   | `WEB_BASE_URL` | `https://unshelvd.koshkikode.com` |
   | `CORS_ALLOWED_ORIGINS` | `https://unshelvd.koshkikode.com` |
   | `S3_BUCKET_NAME` | `unshelvd-uploads` |
   | `SMTP_HOST` | `smtp.your-provider.com` |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | `your-smtp-user` |
   | `EMAIL_FROM` | `Unshelv'd <noreply@koshkikode.com>` |
   | `PAYPAL_CLIENT_ID` | `Aabc...` *(only if PayPal is enabled)* |
   | `PAYPAL_WEBHOOK_ID` | `xxxxx` *(only if PayPal is enabled)* |

7. **Environment variable references** (from Secrets Manager) — choose
   **"Reference"** type for each and paste the full secret ARN:

   | Key | Secret name |
   |-----|-------------|
   | `DATABASE_URL` | `unshelvd/DATABASE_URL` |
   | `SESSION_SECRET` | `unshelvd/SESSION_SECRET` |
   | `STRIPE_SECRET_KEY` | `unshelvd/STRIPE_SECRET_KEY` *(if Stripe enabled)* |
   | `STRIPE_WEBHOOK_SECRET` | `unshelvd/STRIPE_WEBHOOK_SECRET` *(if Stripe enabled)* |
   | `PAYPAL_CLIENT_SECRET` | `unshelvd/PAYPAL_CLIENT_SECRET` *(if PayPal enabled)* |
   | `SMTP_PASS` | `unshelvd/SMTP_PASS` |

   To get a secret ARN:
   ```bash
   aws secretsmanager describe-secret --secret-id unshelvd/DATABASE_URL \
     --query ARN --output text
   ```

8. **Health check**:
   - Protocol: `HTTP`
   - Path: `/api/health`
   - Port: `8080`
   - Healthy threshold: `1`
   - Unhealthy threshold: `5`
   - Interval: `10` seconds
   - Timeout: `5` seconds

9. Click **Create and deploy**. The first deployment will fail with
   "ImageNotFoundException" until you push an image in Step 11. That is
   expected — the service and its ARN are what you need right now.

10. After the service is created, copy:
    - The **Service ARN** (e.g. `arn:aws:apprunner:…:service/unshelvd/…`)
    - The **Default domain** (e.g. `abc123.us-east-1.awsapprunner.com`)

    You'll use both in the next steps.

---

## Step 9 — Configure email (SMTP)

Unshelv'd sends transactional email for password resets, offer
notifications, shipping updates, delivery confirmations, and new messages.

### 9a. Choose an SMTP provider

Recommended options (all have free tiers that cover a new marketplace):

| Provider | Free tier | Notes |
|---|---|---|
| **Amazon SES** | 62,000/month from EC2/App Runner | Best cost; requires domain verification |
| **Resend** | 3,000/month | Developer-friendly API; has SMTP relay |
| **SendGrid** | 100/day | Well-known; good deliverability |
| **Mailgun** | 100/day | Good API + SMTP |
| **Brevo (Sendinblue)** | 300/day | Generous free tier |

### 9b. Verify your domain (for SES)

If you use Amazon SES, you must verify the sending domain and request
production access (SES starts in sandbox mode):

```bash
# Verify the domain (SES will give you CNAME/TXT records to add to Route 53)
aws sesv2 create-email-identity \
  --email-identity koshkikode.com \
  --region "$AWS_REGION"

# List the DKIM tokens to add as CNAME records in Route 53
aws sesv2 get-email-identity \
  --email-identity koshkikode.com \
  --region "$AWS_REGION" \
  --query 'DkimAttributes.Tokens'
```

To get out of SES sandbox mode, open a **Service Quotas → SES → Sending
limits → Request increase** ticket in the AWS Console.

### 9c. Configure via the admin panel (recommended)

After deploying the app, go to `https://$DOMAIN/#/admin` → **Settings →
Email** and enter SMTP credentials there. This lets you test without
redeploying.

Alternatively, set them as App Runner environment variables:
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` (plain) and `SMTP_PASS` (from Secrets
Manager as shown in Step 8).

### 9d. Add SPF and DKIM records in Route 53

Your SMTP provider will give you specific DNS records. Add them in Route 53
under the `koshkikode.com` hosted zone so emails don't land in spam.

At minimum, add:
- **SPF** (TXT record on `koshkikode.com`): `"v=spf1 include:your-provider.com ~all"`
- **DKIM** CNAME records (given by your provider)
- **DMARC** (TXT on `_dmarc.koshkikode.com`): `"v=DMARC1; p=none; rua=mailto:dmarc@koshkikode.com"`

---

## Step 10 — GitHub OIDC role — CI/CD without long-lived keys (one time)

This lets GitHub Actions assume an IAM role to push images and trigger
deployments without storing any AWS access keys in GitHub secrets.

### 10a. Register GitHub as an OIDC identity provider (once per AWS account)

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

If you get "EntityAlreadyExists", the provider is already registered — skip
this command.

### 10b. Create the deploy role trust policy

```bash
cat > /tmp/github-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:KoshkiKode/unshelvd:*"
      }
    }
  }]
}
EOF
```

### 10c. Create the role

```bash
aws iam create-role \
  --role-name unshelvd-github-deploy \
  --assume-role-policy-document file:///tmp/github-trust-policy.json

export DEPLOY_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/unshelvd-github-deploy"
echo "Deploy role ARN: $DEPLOY_ROLE_ARN"
```

### 10d. Attach the deploy permissions policy

Replace `<APPRUNNER_SERVICE_ARN>` with the ARN you copied in Step 8.

```bash
cat > /tmp/github-deploy-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRAuth",
      "Effect": "Allow",
      "Action": ["ecr:GetAuthorizationToken"],
      "Resource": "*"
    },
    {
      "Sid": "ECRPush",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:CompleteLayerUpload",
        "ecr:GetDownloadUrlForLayer",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      ],
      "Resource": "arn:aws:ecr:${AWS_REGION}:${AWS_ACCOUNT_ID}:repository/${ECR_REPO}"
    },
    {
      "Sid": "AppRunnerDeploy",
      "Effect": "Allow",
      "Action": ["apprunner:StartDeployment"],
      "Resource": "<APPRUNNER_SERVICE_ARN>"
    },
    {
      "Sid": "ReadDatabaseUrl",
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:unshelvd/DATABASE_URL*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name unshelvd-github-deploy \
  --policy-name unshelvd-deploy-permissions \
  --policy-document file:///tmp/github-deploy-policy.json
```

---

## Step 11 — Configure the GitHub repository

### 11a. Repository secrets

Go to **GitHub → Settings → Secrets and variables → Actions → Secrets** and
add:

| Secret name | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | The deploy role ARN from Step 10 (`arn:aws:iam::<ACCOUNT_ID>:role/unshelvd-github-deploy`) |
| `APPRUNNER_SERVICE_ARN` | The App Runner service ARN from Step 8 |

### 11b. Repository variables

Go to **GitHub → Settings → Secrets and variables → Actions → Variables** and
add:

| Variable name | Value |
|---|---|
| `AWS_REGION` | `us-east-1` (or your region) |
| `ECR_REPOSITORY` | `unshelvd` |
| `DATABASE_URL_SECRET_ID` | `unshelvd/DATABASE_URL` |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_…` (baked into the Vite client at build time; swap to `pk_live_…` for production) |
| `THRIFTBOOKS_AFF_ID` | Your ThriftBooks Impact affiliate ID *(optional)* |
| `ADSENSE_CLIENT` | Your AdSense publisher ID, e.g. `ca-pub-XXXXXXXXXX` *(optional)* |

---

## Step 12 — AWS Amplify Hosting — frontend + custom domain (one time)

### 12a. Connect the repository

1. Open **AWS Console → AWS Amplify → Host web app**.
2. Source: **GitHub** → authorize Amplify → pick the `KoshkiKode/unshelvd`
   repository, branch `main`.
3. Amplify auto-detects `amplify.yml`. Confirm the build settings look correct
   (build command: `SKIP_ENV_VERIFY=true npm run build`, artifacts: `dist/public`).

### 12b. Set build-time environment variables

In **App settings → Environment variables** add:

| Key | Value |
|---|---|
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` (same as the GitHub variable) |
| `VITE_THRIFTBOOKS_AFF_ID` | affiliate ID *(optional)* |
| `VITE_ADSENSE_CLIENT` | `ca-pub-…` *(optional)* |

Leave `VITE_API_URL` **unset** so the SPA makes same-origin API calls and
Amplify's rewrite rule proxies them to App Runner.

### 12c. Configure rewrites and redirects

In **App settings → Rewrites and redirects** add the following rules **in
this exact order** (order matters — the SPA fallback must be last):

| # | Source pattern | Target | Rewrite type |
|---|---|---|---|
| 1 | `/api/<*>` | `https://<APP_RUNNER_DEFAULT_URL>/api/<*>` | `200 (Rewrite)` |
| 2 | `/ws/<*>` | `https://<APP_RUNNER_DEFAULT_URL>/ws/<*>` | `200 (Rewrite)` |
| 3 | `/<*>` | `/index.html` | `200 (Rewrite)` |

Replace `<APP_RUNNER_DEFAULT_URL>` with the `abc123.us-east-1.awsapprunner.com`
URL from Step 8.

**Why rule 2 matters:** without the `/ws/<*>` rewrite, WebSocket upgrade
requests from web browsers are swallowed by the SPA fallback. Messaging then
silently falls back to 5-second HTTP polling instead of instant push delivery.

### 12d. Add the custom domain

1. In **Domain management → Add domain** enter `unshelvd.koshkikode.com`.
2. Amplify issues an ACM certificate and shows you CNAME records to add in
   Route 53. Copy them.
3. Open **Route 53 → Hosted zones → koshkikode.com** and add each CNAME
   record. ACM validation usually completes within 5 minutes.
4. Once the certificate is validated and the domain is active, Amplify
   serves the SPA over HTTPS with automatic certificate renewal.
5. *(Optional)* Add `koshkikode.com` and `www.koshkikode.com` redirects in
   the same wizard.

---

## Step 13 — Set the admin account credentials (one time)

The first time the container starts it runs `auto-seed`, which creates an
admin user. Set predictable credentials by adding environment variables to
the App Runner service **before** the first successful deploy.

In the App Runner console → your service → **Configuration → Environment
variables**, add:

| Key | Value |
|---|---|
| `ADMIN_USERNAME` | `admin` (or your preferred username) |
| `ADMIN_EMAIL` | `your-email@koshkikode.com` |
| `ADMIN_PASSWORD` | A strong password (12+ chars, upper/lower/number/symbol) |

If these are not set, `auto-seed` generates random credentials and prints
them in the App Runner application log. You can find them at:

```
CloudWatch → Log groups → /aws/apprunner/unshelvd/<service-id>/application
```

Search for the line starting with `Admin credentials:`.

---

## Step 14 — First deploy

Now trigger the first deploy by pushing to `main`. The CI + Deploy workflows
you re-enabled in Step 0 will run automatically.

```bash
git push origin main
# Or, if you haven't changed any code:
git commit --allow-empty -m "ci: trigger first AWS deploy"
git push origin main
```

Watch progress in **GitHub → Actions**. The workflow:

1. **`migrate` job** — checks out the code, installs Node 24, fetches
   `DATABASE_URL` from Secrets Manager, and runs `node script/migrate.js`.
   This creates all database tables. Migrations are idempotent — safe to
   re-run on subsequent deploys.
2. **`build-and-deploy` job** (runs after `migrate` succeeds) — builds the
   Docker image with the Vite client baked in, pushes `:<sha>` and `:latest`
   tags to ECR, then calls `apprunner start-deployment`.
3. App Runner pulls the new `:latest` image, runs the health-check against
   `/api/health`, and rolls the service when it passes.

The first deploy takes 10–15 minutes end to end. Subsequent deploys are
typically 5–8 minutes.

---

## Step 15 — Post-deploy verification checklist

Run these checks from top to bottom. Fix any failure before proceeding to
the next item.

### 15a. API health

```bash
curl -fsS "https://$DOMAIN/api/health" | jq .
# Expected: { "status": "ok", ... }
```

### 15b. SPA loads

```bash
curl -fsS "https://$DOMAIN/" | grep -c "<html"
# Expected: 1
```

### 15c. Admin login (web)

1. Open `https://$DOMAIN/#/login` in a browser.
2. Sign in with the admin email and password from Step 13.
3. Open `https://$DOMAIN/#/admin` — the admin dashboard must load.
4. *(Confirms the session cookie is crossing the Amplify → App Runner origin
   boundary with `SameSite=None; Secure` correctly.)*

### 15d. Real-time messaging (WebSocket)

1. Register two test user accounts (or use admin + a demo account).
2. Open a conversation in `/#/messages` on one browser tab.
3. Open the same conversation in a second tab or incognito window.
4. Send a message from one tab — it must appear on the other **within ~1
   second**. A 5-second delay means the `/ws/<*>` Amplify rewrite is not set
   (see Step 12c).

### 15e. Image upload (S3)

1. Go to `/#/settings` and upload a profile avatar.
2. The avatar URL in the page source must start with
   `https://unshelvd-uploads.s3.us-east-1.amazonaws.com/avatars/`.
   (If it starts with `data:image/`, S3 is not configured — check that
   `S3_BUCKET_NAME` is set in the App Runner environment variables.)

### 15f. Email delivery

1. Go to `/#/login` → **Forgot password** → enter the admin email.
2. A password-reset email must arrive within 60 seconds.
3. If it doesn't arrive, check the App Runner logs for SMTP errors:
   ```bash
   aws logs tail /aws/apprunner/unshelvd/<service-id>/application \
     --filter-pattern "SMTP" --follow
   ```

### 15g. Stripe webhook (if payments are enabled)

1. In the Stripe dashboard → **Webhooks** → add an endpoint:
   `https://$DOMAIN/api/webhooks/stripe`
   Events: `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `account.updated`, `transfer.failed`, `charge.refunded`.
2. Copy the signing secret (`whsec_…`) and update it in Secrets Manager:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id unshelvd/STRIPE_WEBHOOK_SECRET \
     --secret-string "whsec_..."
   ```
3. Use the **Send test event** button in the Stripe dashboard. The App Runner
   logs should show `200` for the webhook delivery.

### 15h. CloudWatch logs (confirm App Runner is healthy)

```bash
# Application logs (stdout/stderr from the Node.js process)
aws logs tail /aws/apprunner/unshelvd/<service-id>/application --follow

# Platform events (deployments, health checks, scaling)
aws logs tail /aws/apprunner/unshelvd/<service-id>/service --follow
```

---

## Step 16 — CloudWatch alarms (recommended)

Set up basic alarms so you are notified before customers notice problems.

### 16a. Create an SNS topic for alert emails

```bash
export ALERT_TOPIC_ARN="$(aws sns create-topic \
  --name unshelvd-alerts \
  --region "$AWS_REGION" \
  --query TopicArn --output text)"

aws sns subscribe \
  --topic-arn "$ALERT_TOPIC_ARN" \
  --protocol email \
  --notification-endpoint "your-email@koshkikode.com"

echo "Topic ARN: $ALERT_TOPIC_ARN"
# Check your email and confirm the subscription before continuing.
```

### 16b. App Runner 5xx error rate alarm

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "unshelvd-5xx-rate" \
  --alarm-description "More than 5% of App Runner responses are 5xx" \
  --namespace "AWS/AppRunner" \
  --metric-name "5xxStatusResponses" \
  --dimensions Name=ServiceName,Value=unshelvd \
  --statistic Sum \
  --period 60 \
  --threshold 10 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 2 \
  --alarm-actions "$ALERT_TOPIC_ARN" \
  --region "$AWS_REGION"
```

### 16c. RDS free storage alarm

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "unshelvd-rds-low-storage" \
  --alarm-description "RDS free storage below 2 GB" \
  --namespace "AWS/RDS" \
  --metric-name "FreeStorageSpace" \
  --dimensions Name=DBInstanceIdentifier,Value="$RDS_INSTANCE" \
  --statistic Average \
  --period 300 \
  --threshold 2147483648 \
  --comparison-operator LessThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions "$ALERT_TOPIC_ARN" \
  --region "$AWS_REGION"
```

---

## Step 17 — Mobile app production builds

See [MOBILE.md](./MOBILE.md) for the full Android and iOS build guide. Here
is the summary for the production web-connected builds.

### Android release AAB (Play Store)

```bash
# Build the web app pointing at production API
VITE_API_URL=https://unshelvd.koshkikode.com npm run build
npx cap sync android

cd android
./gradlew bundleRelease   # produces .aab for Play Store upload
# or:
./gradlew assembleRelease # produces .apk for direct install / testers
```

The GitHub Actions `release.yml` workflow does this automatically when you
push a version tag:

```bash
# Bump version in package.json, then:
git tag v1.0.0
git push origin v1.0.0
```

### iOS release IPA (App Store / TestFlight)

```bash
VITE_API_URL=https://unshelvd.koshkikode.com npm run build
npx cap sync ios
# Open Xcode, set the team + signing certificate, then Product → Archive
npx cap open ios
```

For automated iOS builds, see the `build-ios.yml` and `release.yml` workflows
and the secrets listed in `MOBILE.md`.

---

## Step 18 — Going live with real payments

When you're ready to accept real money (after the app has been reviewed and
tested end to end in test mode):

1. **Stripe** — replace test keys with live keys in Secrets Manager:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id unshelvd/STRIPE_SECRET_KEY \
     --secret-string "sk_live_..."
   aws secretsmanager put-secret-value \
     --secret-id unshelvd/STRIPE_WEBHOOK_SECRET \
     --secret-string "whsec_..."  # live endpoint signing secret
   ```
2. **Amplify build variable** — update `VITE_STRIPE_PUBLISHABLE_KEY` to
   `pk_live_…` (App settings → Environment variables) and redeploy.
3. **GitHub variable** — update `STRIPE_PUBLISHABLE_KEY` to `pk_live_…` so
   future CI deploys bake the live key into the client.
4. **PayPal** — in the admin panel (`/#/admin` → Settings → Payments), flip
   PayPal mode from `sandbox` to `live` and update the live client ID and
   secret.
5. **Stripe Connect** — complete Stripe's platform review and set your
   payout schedule and platform fee in the admin panel.

---

## Rollbacks

### App Runner rollback

App Runner keeps previous images. To roll back without a code change:

1. **Console → App Runner → service → Deployments** tab → pick a previous
   deployment → **Redeploy**.
2. Or redeploy the old image tag directly:
   ```bash
   aws apprunner start-deployment \
     --service-arn "$APPRUNNER_SERVICE_ARN"
   # (App Runner always deploys :latest — re-tag the old SHA as :latest first)
   REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
   docker pull "$REGISTRY/$ECR_REPO:<OLD_SHA>"
   docker tag  "$REGISTRY/$ECR_REPO:<OLD_SHA>" "$REGISTRY/$ECR_REPO:latest"
   docker push "$REGISTRY/$ECR_REPO:latest"
   aws apprunner start-deployment --service-arn "$APPRUNNER_SERVICE_ARN"
   ```

### Database rollback

Drizzle migrations are forward-only by design. To undo a schema change,
write a new migration that reverses it and deploy normally.

---

## Local dev parity

Local development uses Docker Compose for Postgres and data-URI fallback for
image uploads (no S3 needed). See `README.md` for the full local setup.

```bash
docker-compose up -d db   # starts local PostgreSQL
cp .env.example .env      # copy and fill in local values
npm run db:setup          # run migrations + seed
npm run dev               # start the dev server at http://localhost:5000
```

---

## Common failure modes

Work top-down. Most "the site is broken" symptoms come from one of these.

| Symptom | Likely cause | Fix |
|---|---|---|
| Every API call returns `503 Service temporarily unavailable` | The maintenance mode block in `server/index.ts` is still present | Delete the three maintenance mode lines — see **Step 0a** |
| GitHub Actions deploy workflow does nothing (jobs show as skipped) | `if: false` is still on the job definitions in `deploy.yml` | Remove `if: false` from the `migrate` and `build-and-deploy` jobs — see **Step 0c** |
| Amplify build fails on `npm run build` | Missing `VITE_*` env var in Amplify console | Add `VITE_STRIPE_PUBLISHABLE_KEY` under **App settings → Environment variables** and redeploy |
| `https://$DOMAIN/` loads, but `/api/health` returns the SPA HTML | Amplify rewrites are in the wrong order | Ensure `/api/<*>` rewrite rule is **above** the `/<*>` → `/index.html` rule |
| `/api/health` returns 502 or "Service Unavailable" | App Runner container is crashing on startup — usually a missing secret | Check App Runner application logs; confirm the instance role can read all `unshelvd/*` secrets |
| App Runner health check stuck on "Operation in progress" | Health check path or port mismatch | Set health check to HTTP, path `/api/health`, port `8080` |
| App Runner logs: `ECONNREFUSED` connecting to RDS | RDS security group doesn't allow the App Runner egress IP | Add the App Runner outbound IP to the RDS security group inbound rules |
| Login works on web but not in the mobile app | CORS rejected the Capacitor origin, or session cookie not crossing origins | Confirm `NODE_ENV=production` so cookies are `SameSite=None; Secure`; Capacitor origins are allowed by default |
| Images upload but show broken in the browser | `S3_BUCKET_NAME` env var not set in App Runner, or bucket policy blocks public reads | Confirm `S3_BUCKET_NAME=unshelvd-uploads` is set; verify the bucket policy allows anonymous GET on `avatars/*` and `covers/*` |
| Messages take 5s to arrive instead of instant | WebSocket not connecting — Amplify `/ws/<*>` rewrite is missing (web) | Add the `/ws/<*>` rewrite rule pointing to App Runner (see Step 12c) |
| Password-reset emails not delivered | SMTP not configured, or sending domain not verified | Set SMTP env vars in App Runner; check App Runner logs for SMTP errors; verify SPF/DKIM records in Route 53 |
| Stripe webhooks rejected with `signature verification failed` | Webhook signing secret mismatch | Re-copy the signing secret from the Stripe dashboard for the **specific endpoint** and update `unshelvd/STRIPE_WEBHOOK_SECRET` in Secrets Manager |
| `npm run check` fails in CI but passes locally | Node version drift | CI uses Node 24; keep your local Node 20+ and ensure `.nvmrc` is consistent |
| GitHub Actions OIDC fails: `not authorized to perform sts:AssumeRoleWithWebIdentity` | Trust policy `sub` condition doesn't match the repo | Update the trust policy `StringLike` to `repo:KoshkiKode/unshelvd:*` |
| App Runner shows `ImageNotFoundException` on first deploy | No Docker image has been pushed to ECR yet | Let the GitHub Actions deploy workflow run first (it pushes the image before calling `start-deployment`) |

For any other issue, the fastest signal is:

```bash
aws logs tail /aws/apprunner/unshelvd/<service-id>/application --follow
```

---

## Appendix A — Launch-day go/no-go checklist

A single signoff list to walk top-to-bottom on launch day. Every box must
be checked before flipping public DNS to the production CDN. Each item
links back to the section that explains how to satisfy it.

### Identifiers and references
- [ ] Production URL is `https://unshelvd.koshkikode.com` everywhere
      (`apprunner.yaml`, `server/index.ts` CORS allow-list,
      `client/index.html` canonical + OG tags, `.env.example`,
      `README.md`, `MOBILE.md`, `CONNECTIVITY.md`).
- [ ] Mobile bundle / application ID is `com.koshkikode.unshelvd` in
      `capacitor.config.ts`, `android/app/build.gradle`,
      `android/app/src/main/res/values/strings.xml`, and the iOS Xcode
      project (`PRODUCT_BUNDLE_IDENTIFIER`).
- [ ] Sender email is `noreply@koshkikode.com` and SPF / DKIM / DMARC
      records exist in Route 53 (Step 9d).

### Phase 1 — Pre-deploy code changes (Step 0)
- [ ] Maintenance-mode 503 middleware removed from `server/index.ts` (0a).
- [ ] `.github/workflows/ci.yml` `test` job is enabled (no `if: false`) (0b).
- [ ] `.github/workflows/deploy.yml` `migrate` and `build-and-deploy` jobs
      are enabled (no `if: false`) (0c).
- [ ] `S3_BUCKET_NAME` is uncommented in `apprunner.yaml` (0d).
- [ ] Changes merged to `main` (0e).

### Phase 2 — AWS infrastructure (one-time)
- [ ] Amazon ECR repository `unshelvd` created with `scanOnPush=true` (Step 4).
- [ ] Amazon RDS PostgreSQL `unshelvd-db` available, master password stored,
      `unshelvd` database created, security group locked down (Step 5).
- [ ] AWS Secrets Manager entries created for `DATABASE_URL`,
      `SESSION_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
      `PAYPAL_CLIENT_SECRET` (if used), `SMTP_PASS` (Step 6).
- [ ] Amazon S3 bucket `unshelvd-uploads` created with versioning enabled
      and bucket policy allowing public GET on `avatars/*` and `covers/*`
      only (Step 7).
- [ ] App Runner instance IAM role `unshelvd-apprunner-instance` created
      with read access to `unshelvd/*` secrets and write access to
      `unshelvd-uploads` (Step 8a).
- [ ] App Runner service `unshelvd` exists, port 8080, health check
      `/api/health`, all plain env vars and secret references attached
      (Step 8b).

### Phase 3 — CI / CD and frontend
- [ ] GitHub OIDC provider registered and `unshelvd-github-deploy` role
      scoped to `repo:KoshkiKode/unshelvd:*` (Step 10).
- [ ] GitHub repo secrets `AWS_DEPLOY_ROLE_ARN` and
      `APPRUNNER_SERVICE_ARN` set (Step 11a).
- [ ] GitHub repo variables `AWS_REGION`, `ECR_REPOSITORY=unshelvd`,
      `DATABASE_URL_SECRET_ID=unshelvd/DATABASE_URL`,
      `STRIPE_PUBLISHABLE_KEY` set (Step 11b).
- [ ] Amplify Hosting connected to `KoshkiKode/unshelvd` `main` branch and
      detects `amplify.yml` (Step 12a).
- [ ] Amplify build env `VITE_STRIPE_PUBLISHABLE_KEY` set;
      `VITE_API_URL` left **unset** so SPA uses same-origin (Step 12b).
- [ ] Amplify rewrites configured **in this exact order**:
      `/api/<*>` → App Runner, `/ws/<*>` → App Runner,
      `/<*>` → `/index.html` (Step 12c).
- [ ] Custom domain `unshelvd.koshkikode.com` added in Amplify, ACM
      certificate validated, Route 53 CNAME records live (Step 12d).
- [ ] First deploy succeeded — most recent GitHub Actions run on `main` is
      green and App Runner shows the new image as `Running` (Step 14).

### Phase 4 — Functional verification (Step 15)
- [ ] `curl -fsS https://unshelvd.koshkikode.com/api/health` returns
      `{ "status": "ok" }` (15a).
- [ ] `https://unshelvd.koshkikode.com/` serves the SPA (15b).
- [ ] Admin login works on the web at `/#/login` and `/#/admin` loads (15c).
- [ ] Real-time messaging round-trips in under 1 second between two
      browsers — proves the `/ws/<*>` Amplify rewrite is in place (15d).
- [ ] Avatar upload returns an `https://unshelvd-uploads.s3.…` URL (not a
      `data:image/` fallback) (15e).
- [ ] Password-reset email arrives within 60 seconds (15f).
- [ ] Stripe **test** webhook from the dashboard returns 200 in App
      Runner logs (15g).

### Phase 5 — Observability and safety nets (Step 16)
- [ ] SNS topic `unshelvd-alerts` exists and the operator email
      subscription is **confirmed** (16a).
- [ ] CloudWatch alarm `unshelvd-5xx-rate` armed against the App Runner
      `5xxStatusResponses` metric (16b).
- [ ] CloudWatch alarm `unshelvd-rds-low-storage` armed against
      `FreeStorageSpace` (16c).
- [ ] CloudWatch log retention set on `/aws/apprunner/unshelvd/*`
      (recommended: 30 days).
- [ ] One-time manual RDS snapshot taken immediately before launch.

### Phase 6 — Mobile readiness (Step 17 + MOBILE.md)
- [ ] Android signed AAB built with
      `VITE_API_URL=https://unshelvd.koshkikode.com` and uploaded to
      Play Console internal testing (package `com.koshkikode.unshelvd`).
- [ ] iOS archive uploaded to TestFlight (bundle id
      `com.koshkikode.unshelvd`).
- [ ] Play Console privacy policy URL set to
      `https://unshelvd.koshkikode.com/#/privacy`.
- [ ] App Store Connect privacy policy URL set to
      `https://unshelvd.koshkikode.com/#/privacy`.

### Phase 7 — Going live with real money (Step 18)
*Defer until the platform has been reviewed and you are ready to accept
real payments.*
- [ ] `unshelvd/STRIPE_SECRET_KEY` rotated to `sk_live_…` in Secrets
      Manager.
- [ ] `unshelvd/STRIPE_WEBHOOK_SECRET` rotated to the **live** endpoint
      signing secret.
- [ ] Amplify env `VITE_STRIPE_PUBLISHABLE_KEY` set to `pk_live_…` and
      site redeployed.
- [ ] GitHub variable `STRIPE_PUBLISHABLE_KEY` set to `pk_live_…`.
- [ ] PayPal flipped from `sandbox` to `live` in `/#/admin → Settings →
      Payments` with live client id + secret entered.
- [ ] Stripe Connect platform review completed and payout schedule +
      platform fee set in admin.

### Phase 8 — Recommended hardening (post-launch, not blocking)
- [ ] Move RDS into a private VPC; remove `--publicly-accessible`; attach
      App Runner via a VPC Connector.
- [ ] Switch S3 to a private bucket fronted by CloudFront with Origin
      Access Control; update `server/s3.ts` `publicUrl()` accordingly.
- [ ] Add AWS WAF in front of Amplify with
      `AWSManagedRulesCommonRuleSet` and
      `AWSManagedRulesAmazonIpReputationList`.
- [ ] Enable Amazon GuardDuty and AWS Security Hub.
- [ ] Add a CloudWatch Synthetics canary that hits `/api/health` and `/`
      every 5 minutes from at least two regions.
- [ ] Stand up a separate App Runner service from a `staging` branch for
      pre-production testing.

