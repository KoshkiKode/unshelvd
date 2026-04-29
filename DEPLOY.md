# Unshelv'd — Production Deployment Guide (macOS → AWS)

All deployment is done from your Mac using the AWS CLI.
**GitHub Actions only runs CI** (type-check, build, tests) — it does not deploy anything.

---

## Canonical identifiers (do not drift)

| | |
|---|---|
| **Production URL** | `https://unshelvd.koshkikode.com` |
| **Mobile bundle / application ID** | `com.koshkikode.unshelvd` |
| **ECS Cluster** | `unshelvd` |
| **ECS Service** | `unshelvd` |
| **ECS Task Definition** | `unshelvd` |
| **Application Load Balancer** | `unshelvd-alb` |
| **Amazon ECR repository** | `unshelvd` |
| **Amazon RDS instance** | `unshelvd-db` |
| **Amazon S3 uploads bucket** | `unshelvd-uploads` |
| **Sender email** | `noreply@koshkikode.com` |

These values appear in `ecs-task-def.json`, `capacitor.config.ts`,
`android/app/build.gradle`, the iOS Xcode project, `server/index.ts`
(CORS allow-list), and `client/index.html`. If you change one, change them all.

---

## Architecture overview

```
Route 53 (DNS)
  └── koshkikode.com / unshelvd.koshkikode.com
        │
        ├── /            → Amplify Hosting (SPA on CloudFront global CDN)
        ├── /api/**      → Amplify rewrite → ALB → ECS Fargate (Express API)
        └── /ws/**       → Amplify rewrite → ALB → ECS Fargate (WebSocket chat)

ECS Fargate service (behind Application Load Balancer)
  ├── reads secrets from AWS Secrets Manager on startup
  ├── connects to Amazon RDS for PostgreSQL (database)
  └── writes profile / cover images to Amazon S3
```

| Service | Role |
|---------|------|
| **macOS AWS CLI** | Deploy infrastructure and application |
| **Amazon ECR** | Docker image registry |
| **AWS ECS Fargate** | Backend API + WebSocket server (serverless containers) |
| **Application Load Balancer** | Routes HTTP/WebSocket traffic to ECS tasks |
| **Amazon RDS for PostgreSQL** | Managed database |
| **AWS Secrets Manager** | Runtime secrets (database URL, session key, Stripe, PayPal) |
| **Amazon S3** | Profile image and cover uploads |
| **AWS Amplify Hosting** | SPA CDN, custom domain, managed TLS, `/api/**` and `/ws/**` rewrite proxy |
| **Amazon CloudWatch** | Logs, metrics, alarms |
| **Amazon Route 53** | DNS for `koshkikode.com` |

> 💡 **Stripe and PayPal are entirely optional at launch.** Add keys later via
> the admin panel (`/#/admin → Settings → Payments`). The platform runs in
> "browse and list" mode without them.

---

## Step 1 — Install tools on your Mac (one time)

```bash
# AWS CLI v2
brew install awscli

# Docker Desktop (for building and pushing the container image)
brew install --cask docker

# jq (JSON processor — used in deploy commands)
brew install jq

# Node.js 20+ (use nvm or asdf, or the official installer from nodejs.org)
node --version   # must be 20 or higher

# PostgreSQL client (used once to create the app database in RDS)
brew install postgresql
```

Verify everything is installed:

```bash
aws --version
docker --version
node --version
jq --version
psql --version
```

---

## Step 2 — Configure AWS credentials (one time)

You need an IAM user (or SSO profile) with permission to create and manage
ECR, ECS, RDS, S3, ALB, Secrets Manager, IAM roles, CloudWatch, and
CloudFormation resources.

**Option A — IAM user with access keys (simplest for a solo deploy):**

1. AWS Console → **IAM → Users → Create user**
2. Attach the policy `AdministratorAccess` (or a scoped policy covering the
   services listed above)
3. Under the user → **Security credentials → Create access key →
   Application running outside AWS**
4. Copy the Access Key ID and Secret Access Key

```bash
aws configure
# AWS Access Key ID:     AKIAIOSFODNN7EXAMPLE
# AWS Secret Access Key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
# Default region name:   us-east-1
# Default output format: json
```

**Option B — AWS SSO / Identity Center:**

```bash
aws configure sso
# Follow the prompts — it opens a browser for you to sign in
aws sso login --profile your-profile-name
export AWS_PROFILE=your-profile-name
```

**Verify credentials work:**

```bash
aws sts get-caller-identity
# Prints your Account ID, UserId, and ARN
```

> ⚠️ Never commit AWS credentials to source control. Use `~/.aws/credentials`
> or environment variables only.

---

## Step 3 — Clone the repo and verify it builds

```bash
git clone https://github.com/KoshkiKode/unshelvd.git
cd unshelvd
npm install
npm run check    # TypeScript type-check
npm test         # unit tests
npm run build    # full production build (SKIP_ENV_VERIFY=true)
```

All three must succeed before continuing.

---

## Step 4 — Set shell variables (copy/paste once per terminal session)

Run these once at the start of every terminal session that uses the `aws` CLI.

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export ECR_REPO=unshelvd
export ECS_CLUSTER=unshelvd
export ECS_SERVICE=unshelvd
export ECS_TASK_DEF=unshelvd
export ALB_NAME=unshelvd-alb
export S3_BUCKET=unshelvd-uploads
export RDS_INSTANCE=unshelvd-db
export DOMAIN=unshelvd.koshkikode.com

echo "Account: $AWS_ACCOUNT_ID  Region: $AWS_REGION"
```

---

## Step 5 — Amazon ECR — Docker image registry (one time)

```bash
aws ecr create-repository \
  --repository-name "$ECR_REPO" \
  --region "$AWS_REGION" \
  --image-scanning-configuration scanOnPush=true \
  --image-tag-mutability MUTABLE
```

Note the `repositoryUri` in the output — it looks like:
`<ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/unshelvd`

---

## Step 6 — Amazon RDS — PostgreSQL database (one time)

### 6a. Generate and save the master password

```bash
export RDS_PASSWORD="$(openssl rand -base64 24)"
echo "RDS master password: $RDS_PASSWORD"
# Save this in 1Password or another safe location.
# AWS does not let you retrieve it again after creation.
```

### 6b. Create the RDS instance

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

> `--publicly-accessible` is simplest for a first deploy. See Step 6e to
> lock it down after the ECS service is running.

### 6c. Wait for the instance to become available (~5–10 min)

```bash
while true; do
  aws rds describe-db-instances \
    --db-instance-identifier "$RDS_INSTANCE" \
    --query 'DBInstances[0].DBInstanceStatus' --output text
  sleep 30
done
# Press Ctrl-C when it shows "available"
```

### 6d. Grab the endpoint and create the application database

```bash
export RDS_ENDPOINT="$(aws rds describe-db-instances \
  --db-instance-identifier "$RDS_INSTANCE" \
  --query 'DBInstances[0].Endpoint.Address' --output text)"
echo "RDS endpoint: $RDS_ENDPOINT"

# Connect and create the app database
psql "postgresql://unshelvd:${RDS_PASSWORD}@${RDS_ENDPOINT}:5432/postgres?sslmode=require" \
  -c "CREATE DATABASE unshelvd;"
```

The full `DATABASE_URL` for subsequent steps:

```
postgresql://unshelvd:<PASSWORD>@<RDS_ENDPOINT>:5432/unshelvd?sslmode=require
```

### 6e. (Recommended) Lock down the RDS security group

By default `--publicly-accessible` exposes port 5432 to the internet.
After creating the ECS service (Step 9), restrict access:

1. **AWS Console → EC2 → Security Groups** — find the security group on the
   RDS instance.
2. **Inbound rules → Edit → Add rule**: Type `PostgreSQL`, Port `5432`,
   Source: **My IP** (your Mac's IP).
3. After creating the ECS service, add a second rule allowing port 5432
   from the ECS task security group.

---

## Step 7 — AWS Secrets Manager — runtime secrets (one time)

These are injected into the ECS container at startup.
Replace every `<PLACEHOLDER>` with real values before running.

```bash
# Database URL (built from Step 6)
aws secretsmanager create-secret \
  --name unshelvd/DATABASE_URL \
  --region "$AWS_REGION" \
  --secret-string "postgresql://unshelvd:${RDS_PASSWORD}@${RDS_ENDPOINT}:5432/unshelvd?sslmode=require"

# Session secret — long random hex string
aws secretsmanager create-secret \
  --name unshelvd/SESSION_SECRET \
  --region "$AWS_REGION" \
  --secret-string "$(openssl rand -hex 32)"

# PayPal (optional — only needed if PayPal checkout is enabled)
aws secretsmanager create-secret \
  --name unshelvd/PAYPAL_CLIENT_SECRET \
  --region "$AWS_REGION" \
  --secret-string "EFgh..."

# SMTP password (required for transactional email)
aws secretsmanager create-secret \
  --name unshelvd/SMTP_PASS \
  --region "$AWS_REGION" \
  --secret-string "your-smtp-password"

# Stripe (optional — add later via the admin panel if you prefer)
# aws secretsmanager create-secret \
#   --name unshelvd/STRIPE_SECRET_KEY \
#   --region "$AWS_REGION" \
#   --secret-string "sk_test_..."
#
# aws secretsmanager create-secret \
#   --name unshelvd/STRIPE_WEBHOOK_SECRET \
#   --region "$AWS_REGION" \
#   --secret-string "whsec_..."
```

To update a secret later (e.g. rotating the session key):

```bash
aws secretsmanager put-secret-value \
  --secret-id unshelvd/SESSION_SECRET \
  --secret-string "$(openssl rand -hex 32)"
```

---

## Step 8 — Amazon S3 — profile image and cover bucket (one time)

### 8a. Create the bucket

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

### 8b. Enable public read for avatars and covers only

```bash
aws s3api put-public-access-block \
  --bucket "$S3_BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

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

### 8c. Enable versioning (recommended)

```bash
aws s3api put-bucket-versioning \
  --bucket "$S3_BUCKET" \
  --versioning-configuration Status=Enabled
```

---

## Step 9 — ECS Fargate — backend service (one time)

### 9a. Create IAM roles for ECS

```bash
# Trust policy shared by both roles
cat > /tmp/ecs-trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ecs-tasks.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

# ── Execution role (ECS uses this to pull images + read secrets) ──────────────
aws iam create-role \
  --role-name unshelvd-ecs-execution \
  --assume-role-policy-document file:///tmp/ecs-trust.json

aws iam attach-role-policy \
  --role-name unshelvd-ecs-execution \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

cat > /tmp/ecs-execution-secrets.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "ReadSecrets",
    "Effect": "Allow",
    "Action": ["secretsmanager:GetSecretValue"],
    "Resource": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:unshelvd/*"
  }]
}
EOF
aws iam put-role-policy \
  --role-name unshelvd-ecs-execution \
  --policy-name unshelvd-ecs-execution-secrets \
  --policy-document file:///tmp/ecs-execution-secrets.json

export EXECUTION_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/unshelvd-ecs-execution"

# ── Task role (what the running container is allowed to do) ───────────────────
aws iam create-role \
  --role-name unshelvd-ecs-task \
  --assume-role-policy-document file:///tmp/ecs-trust.json

cat > /tmp/ecs-task-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3ReadWrite",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::${S3_BUCKET}/*"
    }
  ]
}
EOF
aws iam put-role-policy \
  --role-name unshelvd-ecs-task \
  --policy-name unshelvd-ecs-task-permissions \
  --policy-document file:///tmp/ecs-task-policy.json

export TASK_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/unshelvd-ecs-task"
echo "Execution role: $EXECUTION_ROLE_ARN"
echo "Task role:      $TASK_ROLE_ARN"
```

### 9b. Create the ECS cluster

```bash
aws ecs create-cluster \
  --cluster-name "$ECS_CLUSTER" \
  --region "$AWS_REGION" \
  --capacity-providers FARGATE \
  --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1

aws ecs describe-clusters \
  --clusters "$ECS_CLUSTER" \
  --query 'clusters[0].status' --output text
# Expected: ACTIVE
```

### 9c. Create the CloudWatch log group

```bash
aws logs create-log-group \
  --log-group-name /ecs/unshelvd \
  --region "$AWS_REGION"

aws logs put-retention-policy \
  --log-group-name /ecs/unshelvd \
  --retention-in-days 30 \
  --region "$AWS_REGION"
```

### 9d. Register the ECS task definition

The template is at `ecs-task-def.json` in the repo root. Substitute the
account ID and register it:

```bash
sed "s/261142221895/${AWS_ACCOUNT_ID}/g" ecs-task-def.json > /tmp/task-def-filled.json

aws ecs register-task-definition \
  --cli-input-json file:///tmp/task-def-filled.json \
  --region "$AWS_REGION"

# Verify
aws ecs describe-task-definition \
  --task-definition "$ECS_TASK_DEF" \
  --query 'taskDefinition.taskDefinitionArn' --output text
```

To update environment variables later, edit `ecs-task-def.json`, commit it,
and re-run the register command above. Then deploy (see Step 12).

Plain environment variables go in the `environment` array; sensitive values
go in the `secrets` array as Secrets Manager references.

| Variable | Type | Value |
|---|---|---|
| `NODE_ENV` | plain | `production` |
| `PORT` | plain | `8080` |
| `APP_URL` | plain | `https://unshelvd.koshkikode.com` |
| `S3_BUCKET_NAME` | plain | `unshelvd-uploads` |
| `AWS_REGION` | plain | `us-east-1` |
| `SMTP_HOST` | plain | `email-smtp.us-east-1.amazonaws.com` |
| `SMTP_PORT` | plain | `587` |
| `SMTP_USER` | plain | your SES SMTP username |
| `EMAIL_FROM` | plain | `Unshelv'd <noreply@koshkikode.com>` |
| `DATABASE_URL` | secret | `unshelvd/DATABASE_URL` |
| `SESSION_SECRET` | secret | `unshelvd/SESSION_SECRET` |
| `STRIPE_SECRET_KEY` | secret | `unshelvd/STRIPE_SECRET_KEY` |
| `STRIPE_WEBHOOK_SECRET` | secret | `unshelvd/STRIPE_WEBHOOK_SECRET` |
| `PAYPAL_CLIENT_SECRET` | secret | `unshelvd/PAYPAL_CLIENT_SECRET` |
| `SMTP_PASS` | secret | `unshelvd/SMTP_PASS` |

### 9e. Create VPC security groups

```bash
export VPC_ID="$(aws ec2 describe-vpcs \
  --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text)"

export SUBNET_IDS="$(aws ec2 describe-subnets \
  --filters Name=vpc-id,Values="$VPC_ID" \
  --query 'Subnets[0:2].SubnetId' --output text | tr '\t' ',')"

echo "VPC: $VPC_ID  Subnets: $SUBNET_IDS"

# Security group for the ALB — inbound 80 + 443 from anywhere
export ALB_SG_ID="$(aws ec2 create-security-group \
  --group-name unshelvd-alb-sg \
  --description "Unshelv'd ALB — allow HTTP/HTTPS from internet" \
  --vpc-id "$VPC_ID" \
  --query GroupId --output text)"

aws ec2 authorize-security-group-ingress \
  --group-id "$ALB_SG_ID" --protocol tcp --port 80  --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress \
  --group-id "$ALB_SG_ID" --protocol tcp --port 443 --cidr 0.0.0.0/0

# Security group for ECS tasks — inbound 8080 from ALB only
export ECS_SG_ID="$(aws ec2 create-security-group \
  --group-name unshelvd-ecs-sg \
  --description "Unshelv'd ECS tasks — allow 8080 from ALB" \
  --vpc-id "$VPC_ID" \
  --query GroupId --output text)"

aws ec2 authorize-security-group-ingress \
  --group-id "$ECS_SG_ID" \
  --protocol tcp --port 8080 \
  --source-group "$ALB_SG_ID"

echo "ALB SG: $ALB_SG_ID  ECS SG: $ECS_SG_ID"
```

### 9f. Create the Application Load Balancer

```bash
export ALB_ARN="$(aws elbv2 create-load-balancer \
  --name "$ALB_NAME" \
  --subnets $(echo "$SUBNET_IDS" | tr ',' ' ') \
  --security-groups "$ALB_SG_ID" \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4 \
  --region "$AWS_REGION" \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)"

export ALB_DNS="$(aws elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN" \
  --query 'LoadBalancers[0].DNSName' --output text)"

echo "ALB DNS: $ALB_DNS"
# Save this value — you'll use it for Amplify rewrites in Step 11c

# Target group pointing to ECS tasks on port 8080
export TG_ARN="$(aws elbv2 create-target-group \
  --name unshelvd-tg \
  --protocol HTTP \
  --port 8080 \
  --vpc-id "$VPC_ID" \
  --target-type ip \
  --health-check-protocol HTTP \
  --health-check-path /api/health \
  --health-check-interval-seconds 10 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --region "$AWS_REGION" \
  --query 'TargetGroups[0].TargetGroupArn' --output text)"

echo "Target group ARN: $TG_ARN"

# HTTP listener — redirect all traffic to HTTPS
aws elbv2 create-listener \
  --load-balancer-arn "$ALB_ARN" \
  --protocol HTTP \
  --port 80 \
  --default-actions \
    Type=redirect,RedirectConfig="{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}" \
  --region "$AWS_REGION"
```

### 9g. Request an ACM certificate for the ALB

```bash
export CERT_ARN="$(aws acm request-certificate \
  --domain-name "$DOMAIN" \
  --validation-method DNS \
  --region "$AWS_REGION" \
  --query CertificateArn --output text)"

echo "Certificate ARN: $CERT_ARN"

# Get the DNS validation CNAME record to add in Route 53
aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region "$AWS_REGION" \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

Add the CNAME to Route 53, then wait for validation
(`aws acm describe-certificate ... --query Certificate.Status` → `ISSUED`).
Then create the HTTPS listener:

```bash
aws elbv2 create-listener \
  --load-balancer-arn "$ALB_ARN" \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn="$CERT_ARN" \
  --default-actions Type=forward,TargetGroupArn="$TG_ARN" \
  --region "$AWS_REGION"
```

### 9h. Create the ECS Fargate service

```bash
aws ecs create-service \
  --cluster "$ECS_CLUSTER" \
  --service-name "$ECS_SERVICE" \
  --task-definition "$ECS_TASK_DEF" \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration \
    "awsvpcConfiguration={subnets=[$(echo $SUBNET_IDS | tr ',' ' ')],securityGroups=[$ECS_SG_ID],assignPublicIp=ENABLED}" \
  --load-balancers \
    "targetGroupArn=$TG_ARN,containerName=unshelvd,containerPort=8080" \
  --health-check-grace-period-seconds 60 \
  --region "$AWS_REGION"
```

> `assignPublicIp=ENABLED` is required when using public subnets so tasks can
> pull the Docker image from ECR. In a private-subnet setup use `DISABLED` with
> a NAT Gateway.

Wait for the service to reach a steady state:

```bash
aws ecs wait services-stable \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --region "$AWS_REGION"
```

---

## Step 10 — Configure email (SMTP)

### 10a. Choose an SMTP provider

| Provider | Free tier | Notes |
|---|---|---|
| **Amazon SES** | 62,000/month from ECS | Best cost; requires domain verification |
| **Resend** | 3,000/month | Developer-friendly |
| **SendGrid** | 100/day | Well-known; good deliverability |
| **Mailgun** | 100/day | Good API + SMTP |

### 10b. Verify your domain (for SES)

```bash
aws sesv2 create-email-identity \
  --email-identity koshkikode.com \
  --region "$AWS_REGION"

# List DKIM tokens to add as CNAME records in Route 53
aws sesv2 get-email-identity \
  --email-identity koshkikode.com \
  --region "$AWS_REGION" \
  --query 'DkimAttributes.Tokens'
```

To leave SES sandbox mode, open **Service Quotas → SES → Sending limits →
Request increase** in the AWS Console.

### 10c. Configure via the admin panel (recommended)

After the app is running, go to `https://$DOMAIN/#/admin → Settings → Email`
and enter SMTP credentials there. You can test without redeploying.

Alternatively, add them directly to `ecs-task-def.json` as `environment`
entries (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `EMAIL_FROM`) and store
`SMTP_PASS` in Secrets Manager (already included in the template).

### 10d. Add SPF, DKIM, and DMARC records in Route 53

At minimum add these DNS records under `koshkikode.com`:

- **SPF** (TXT on `koshkikode.com`): `"v=spf1 include:your-provider.com ~all"`
- **DKIM** CNAME records (given by your provider)
- **DMARC** (TXT on `_dmarc.koshkikode.com`): `"v=DMARC1; p=none; rua=mailto:dmarc@koshkikode.com"`

---

## Step 11 — AWS Amplify Hosting — frontend CDN (one time)

### 11a. Connect the repository

1. **AWS Console → AWS Amplify → Host web app**
2. Source: **GitHub** → authorize Amplify → pick `KoshkiKode/unshelvd`,
   branch `main`
3. Amplify auto-detects `amplify.yml`. Confirm the build settings look correct
   (build command: `SKIP_ENV_VERIFY=true npm run build`, artifacts: `dist/public`)

### 11b. Set build-time environment variables

In **App settings → Environment variables** add:

| Key | Value |
|---|---|
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` *(optional — can be added later)* |
| `VITE_THRIFTBOOKS_AFF_ID` | affiliate ID *(optional)* |
| `VITE_ADSENSE_CLIENT` | `ca-pub-…` *(optional)* |

Leave `VITE_API_URL` **unset** — the SPA makes same-origin API calls and
Amplify's rewrite rule proxies them to ECS.

### 11c. Configure rewrites and redirects

In **App settings → Rewrites and redirects** add these rules **in this exact
order** (order matters — the SPA fallback must be last):

| # | Source pattern | Target | Rewrite type |
|---|---|---|---|
| 1 | `/api/<*>` | `https://<ALB_DNS>/api/<*>` | `200 (Rewrite)` |
| 2 | `/ws/<*>` | `https://<ALB_DNS>/ws/<*>` | `200 (Rewrite)` |
| 3 | `/<*>` | `/index.html` | `200 (Rewrite)` |

Replace `<ALB_DNS>` with the `ALB_DNS` value from Step 9f (e.g.
`unshelvd-alb-1234567890.us-east-1.elb.amazonaws.com`).

> **Why rule 2 matters:** without the `/ws/<*>` rewrite, WebSocket upgrade
> requests are swallowed by the SPA fallback, causing messaging to fall back
> to 5-second HTTP polling instead of instant push delivery.

### 11d. Add the custom domain

1. **Domain management → Add domain** → enter `unshelvd.koshkikode.com`
2. Amplify issues an ACM certificate and shows CNAME records — add them in
   Route 53. ACM validation usually completes within 5 minutes.
3. Once validated, Amplify serves the SPA over HTTPS with automatic
   certificate renewal.

### 11e. Route 53 DNS records

**Route 53 → Hosted zones → koshkikode.com → Create record:**

| Record name | Type | Routing | Target |
|---|---|---|---|
| `unshelvd` | A | Alias → Application Load Balancer → us-east-1 | `ALB_DNS` from Step 9f |
| `cdn` | A | Alias → CloudFront distribution | *(if you set up a CDN cert)* |

---

## Step 12 — Set admin account credentials (one time)

The first time the container starts it runs `auto-seed`, which creates an
admin user. Set predictable credentials by adding these to the `environment`
array in `ecs-task-def.json` **before** the first successful deploy, then
re-register the task definition (Step 9d) and deploy (Step 13):

| Key | Value |
|---|---|
| `ADMIN_USERNAME` | `admin` (or your preferred username) |
| `ADMIN_EMAIL` | `your-email@koshkikode.com` |
| `ADMIN_PASSWORD` | A strong password (12+ chars, upper/lower/number/symbol) |

If these are not set, `auto-seed` generates random credentials and prints them
in the CloudWatch logs:

```bash
aws logs tail /ecs/unshelvd --follow
# Search for the line starting with "Admin credentials:"
```

---

## Step 13 — First deploy

This is the full deploy sequence. Run these same commands for every
subsequent release.

### 13a. Log in to Amazon ECR

```bash
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin \
    "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
```

### 13b. Build and push the Docker image

```bash
REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
GIT_SHA="$(git rev-parse --short HEAD)"
IMAGE="${REGISTRY}/${ECR_REPO}:${GIT_SHA}"

docker build \
  --build-arg VITE_API_URL="" \
  --build-arg VITE_THRIFTBOOKS_AFF_ID="${VITE_THRIFTBOOKS_AFF_ID:-}" \
  --build-arg VITE_ADSENSE_CLIENT="${VITE_ADSENSE_CLIENT:-}" \
  --build-arg VITE_STRIPE_PUBLISHABLE_KEY="${VITE_STRIPE_PUBLISHABLE_KEY:-}" \
  -t "$IMAGE" \
  -t "${REGISTRY}/${ECR_REPO}:latest" \
  .

docker push "$IMAGE"
docker push "${REGISTRY}/${ECR_REPO}:latest"

echo "Pushed: $IMAGE"
```

### 13c. Run database migrations

```bash
# Fetch the DATABASE_URL from Secrets Manager
export DATABASE_URL="$(aws secretsmanager get-secret-value \
  --secret-id unshelvd/DATABASE_URL \
  --region "$AWS_REGION" \
  --query SecretString --output text)"

node script/migrate.js
# Expected: "✅  Migrations applied successfully"
```

### 13d. Register an updated task definition and deploy to ECS

```bash
# Update the image URI in the task definition
UPDATED="$(jq \
  --arg image "$IMAGE" \
  '.containerDefinitions |= map(if .name == "unshelvd" then .image = $image else . end)' \
  ecs-task-def.json)"

TASK_DEF_ARN="$(echo "$UPDATED" \
  | aws ecs register-task-definition \
      --cli-input-json file:///dev/stdin \
      --region "$AWS_REGION" \
      --query 'taskDefinition.taskDefinitionArn' --output text)"

echo "Registered: $TASK_DEF_ARN"

# Trigger the rolling deploy
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --task-definition "$TASK_DEF_ARN" \
  --force-new-deployment \
  --region "$AWS_REGION" \
  --output text --query 'service.serviceArn' > /dev/null

# Wait for the new task to become healthy (~5–10 min)
aws ecs wait services-stable \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --region "$AWS_REGION"

echo "Deploy complete: $IMAGE"
echo "Verify: curl https://$DOMAIN/api/health"
```

---

## Step 14 — Post-deploy verification

Run these checks from top to bottom after every deploy.

### 14a. API health

```bash
curl -fsS "https://$DOMAIN/api/health" | jq .
# Expected: { "status": "ok", ... }
```

### 14b. SPA loads

```bash
curl -fsS "https://$DOMAIN/" | grep -c "<html"
# Expected: 1
```

### 14c. Admin login

1. Open `https://$DOMAIN/#/login` in a browser
2. Sign in with the admin credentials from Step 12
3. Open `https://$DOMAIN/#/admin` — the dashboard must load

### 14d. Real-time messaging (WebSocket)

1. Register two test accounts
2. Open a conversation in `/#/messages` on two browser tabs
3. Send a message — it must appear on the other tab **within ~1 second**
   (a 5-second delay means the `/ws/<*>` Amplify rewrite is missing)

### 14e. Image upload (S3)

1. Go to `/#/settings` and upload a profile avatar
2. The avatar URL must start with
   `https://unshelvd-uploads.s3.us-east-1.amazonaws.com/avatars/`
   (if it starts with `data:image/`, S3 is not configured correctly)

### 14f. Email delivery

1. Go to `/#/login → Forgot password` → enter the admin email
2. A password-reset email must arrive within 60 seconds
3. If it doesn't, check ECS logs for SMTP errors:
   ```bash
   aws logs tail /ecs/unshelvd --filter-pattern "SMTP" --follow
   ```

### 14g. CloudWatch logs (confirm ECS is healthy)

```bash
# Tail application logs
aws logs tail /ecs/unshelvd --follow

# List recent log streams (one per ECS task)
aws logs describe-log-streams \
  --log-group-name /ecs/unshelvd \
  --order-by LastEventTime --descending \
  --region "$AWS_REGION"
```

---

## Step 15 — Ongoing deploys (every release)

For every release after the first, run Steps 13a–13d in order:

```bash
# 1. Pull latest code
git pull origin main

# 2. ECR login (if session has expired — tokens last 12 h)
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin \
    "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# 3. Build + push
REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
GIT_SHA="$(git rev-parse --short HEAD)"
IMAGE="${REGISTRY}/${ECR_REPO}:${GIT_SHA}"
docker build --build-arg VITE_API_URL="" -t "$IMAGE" -t "${REGISTRY}/${ECR_REPO}:latest" .
docker push "$IMAGE"
docker push "${REGISTRY}/${ECR_REPO}:latest"

# 4. Migrate
export DATABASE_URL="$(aws secretsmanager get-secret-value \
  --secret-id unshelvd/DATABASE_URL --region "$AWS_REGION" \
  --query SecretString --output text)"
node script/migrate.js

# 5. Deploy
UPDATED="$(jq --arg image "$IMAGE" \
  '.containerDefinitions |= map(if .name == "unshelvd" then .image = $image else . end)' \
  ecs-task-def.json)"
TASK_DEF_ARN="$(echo "$UPDATED" | aws ecs register-task-definition \
  --cli-input-json file:///dev/stdin --region "$AWS_REGION" \
  --query 'taskDefinition.taskDefinitionArn' --output text)"
aws ecs update-service --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE" \
  --task-definition "$TASK_DEF_ARN" --force-new-deployment --region "$AWS_REGION" \
  --output text --query 'service.serviceArn' > /dev/null
aws ecs wait services-stable --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" --region "$AWS_REGION"
echo "Done: $IMAGE"
```

---

## Step 16 — CloudWatch alarms (recommended)

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

### 16b. ALB 5xx error rate alarm

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "unshelvd-alb-5xx-rate" \
  --alarm-description "More than 10 ALB 5xx responses in 2 minutes" \
  --namespace "AWS/ApplicationELB" \
  --metric-name "HTTPCode_Target_5XX_Count" \
  --dimensions Name=LoadBalancer,Value="$(aws elbv2 describe-load-balancers \
    --names "$ALB_NAME" --query 'LoadBalancers[0].LoadBalancerArn' \
    --output text | cut -d: -f6)" \
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

### 16d. ECS running task count alarm

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "unshelvd-ecs-no-tasks" \
  --alarm-description "ECS service has 0 running tasks" \
  --namespace "AWS/ECS" \
  --metric-name "RunningTaskCount" \
  --dimensions \
    Name=ClusterName,Value="$ECS_CLUSTER" \
    Name=ServiceName,Value="$ECS_SERVICE" \
  --statistic Average \
  --period 60 \
  --threshold 1 \
  --comparison-operator LessThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions "$ALERT_TOPIC_ARN" \
  --region "$AWS_REGION"
```

---

## Step 17 — Mobile app production builds

See [MOBILE.md](./MOBILE.md) for the full Android and iOS build guide.

### Android release AAB (Play Store)

```bash
VITE_API_URL=https://unshelvd.koshkikode.com npm run build
npx cap sync android

cd android
./gradlew bundleRelease   # .aab for Play Store upload
# or:
./gradlew assembleRelease # .apk for direct install / testers
```

### iOS release IPA (App Store / TestFlight)

```bash
VITE_API_URL=https://unshelvd.koshkikode.com npm run build
npx cap sync ios
npx cap open ios
# In Xcode: set team + signing certificate → Product → Archive
```

The GitHub Actions `build.yml` workflow can build and sign these automatically
when you push a version tag (see `MOBILE.md`).

---

## Step 18 — Going live with real payments

When you're ready to accept real money:

1. **Stripe** — replace test keys with live keys in Secrets Manager:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id unshelvd/STRIPE_SECRET_KEY \
     --secret-string "sk_live_..."
   aws secretsmanager put-secret-value \
     --secret-id unshelvd/STRIPE_WEBHOOK_SECRET \
     --secret-string "whsec_..."
   ```
2. **Amplify** — update `VITE_STRIPE_PUBLISHABLE_KEY` to `pk_live_…` in
   **App settings → Environment variables** and trigger a new Amplify build.
3. **PayPal** — in the admin panel (`/#/admin → Settings → Payments`), flip
   mode from `sandbox` to `live` and update the live client ID and secret.

---

## Rollbacks

### ECS rollback

ECS keeps all previous task definition revisions. To roll back without a
code change:

```bash
# List recent revisions
aws ecs list-task-definitions \
  --family-prefix "$ECS_TASK_DEF" \
  --sort DESC \
  --region "$AWS_REGION"

# Roll back to a specific revision (e.g. revision 5)
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --task-definition "${ECS_TASK_DEF}:5" \
  --region "$AWS_REGION"

aws ecs wait services-stable \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --region "$AWS_REGION"
```

Alternatively, re-tag an old image as `:latest` in ECR and run a new deploy:

```bash
REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
docker pull "$REGISTRY/$ECR_REPO:<OLD_SHA>"
docker tag  "$REGISTRY/$ECR_REPO:<OLD_SHA>" "$REGISTRY/$ECR_REPO:latest"
docker push "$REGISTRY/$ECR_REPO:latest"
# Then re-run Steps 13c and 13d
```

### Database rollback

Drizzle migrations are forward-only. To undo a schema change, write a new
migration that reverses it and deploy normally.

---

## Local dev

Local development uses Docker Compose for Postgres and data-URI fallback for
image uploads (no S3 needed).

```bash
docker compose up -d db   # starts local PostgreSQL
cp .env.example .env      # copy and fill in local values
npm run db:setup          # run migrations + seed
npm run dev               # start the dev server at http://localhost:5000
```

---

## Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Amplify build fails on `npm run build` | Missing `VITE_*` env var | Add it under **App settings → Environment variables** and redeploy |
| `https://$DOMAIN/` loads but `/api/health` returns the SPA HTML | Amplify rewrites in wrong order | Ensure `/api/<*>` rule is **above** the `/<*>` → `/index.html` rule |
| `/api/health` returns 502 or "Service Unavailable" | ECS task not running or failing health checks | Check ECS service events and CloudWatch logs at `/ecs/unshelvd`; confirm execution role can read all `unshelvd/*` secrets |
| ECS task immediately stops with non-zero exit code | Missing required secret or env var | Tail CloudWatch logs; confirm all Secrets Manager names in task definition are correct |
| ECS health check stuck on "IN_PROGRESS" | Health check path or port mismatch | Set health check to HTTP, path `/api/health`, port `8080` |
| ECS task logs: `ECONNREFUSED` to RDS | RDS security group doesn't allow ECS task SG | Add inbound rule on RDS SG allowing port 5432 from `ECS_SG_ID` |
| `CannotPullContainerError` on ECS | No image pushed yet, or execution role missing ECR permissions | Confirm execution role has `AmazonECSTaskExecutionRolePolicy`; ensure image was pushed in Step 13b |
| Login works on web but not mobile app | CORS rejected Capacitor origin, or session cookie issue | Confirm `NODE_ENV=production` so cookies are `SameSite=None; Secure` |
| Images upload but show broken | `S3_BUCKET_NAME` not set in ECS, or bucket policy blocks public reads | Confirm `S3_BUCKET_NAME=unshelvd-uploads` is in task definition; verify bucket policy allows GET on `avatars/*` and `covers/*` |
| Messages take 5 s instead of instant | WebSocket not connecting — Amplify `/ws/<*>` rewrite missing | Add the `/ws/<*>` rewrite rule pointing to the ALB (Step 11c) |
| Password-reset emails not delivered | SMTP not configured or sending domain not verified | Set SMTP env vars in task definition; check CloudWatch logs for SMTP errors; verify SPF/DKIM in Route 53 |
| Stripe webhooks rejected: "signature verification failed" | Webhook signing secret mismatch | Re-copy the signing secret from Stripe dashboard for the specific endpoint and update `unshelvd/STRIPE_WEBHOOK_SECRET` |

For any other issue, the fastest signal is always:

```bash
aws logs tail /ecs/unshelvd --follow
```

---

## Launch-day go/no-go checklist

Walk top-to-bottom on launch day. Every box must be checked before
making DNS live.

### Infrastructure (one-time)
- [ ] `aws sts get-caller-identity` succeeds with your IAM user (Step 2)
- [ ] Amazon ECR repository `unshelvd` created with `scanOnPush=true` (Step 5)
- [ ] Amazon RDS PostgreSQL `unshelvd-db` available; master password saved; `unshelvd` database created; security group locked to your IP + ECS SG (Step 6)
- [ ] Secrets Manager entries created: `unshelvd/DATABASE_URL`, `unshelvd/SESSION_SECRET`, `unshelvd/SMTP_PASS`, and any optional payment secrets (Step 7)
- [ ] S3 bucket `unshelvd-uploads` created with versioning and bucket policy for public GET on `avatars/*` + `covers/*` (Step 8)
- [ ] ECS execution role `unshelvd-ecs-execution` and task role `unshelvd-ecs-task` created (Step 9a)
- [ ] ECS cluster `unshelvd` active (Step 9b)
- [ ] CloudWatch log group `/ecs/unshelvd` created with 30-day retention (Step 9c)
- [ ] Task definition `unshelvd` registered with correct account ID substituted (Step 9d)
- [ ] VPC security groups created for ALB and ECS tasks (Step 9e)
- [ ] ALB `unshelvd-alb` created with target group, health check on `/api/health`, and HTTPS listener (Step 9f–9g)
- [ ] ECS Fargate service `unshelvd` created and reached steady state (Step 9h)

### Frontend and DNS
- [ ] Amplify Hosting connected to `KoshkiKode/unshelvd` `main` branch (Step 11a)
- [ ] Amplify build env vars set; `VITE_API_URL` left **unset** (Step 11b)
- [ ] Amplify rewrites configured in order: `/api/<*>` → ALB, `/ws/<*>` → ALB, `/<*>` → `/index.html` (Step 11c)
- [ ] Custom domain `unshelvd.koshkikode.com` added in Amplify; ACM cert validated (Step 11d)
- [ ] Route 53 alias record for `unshelvd.koshkikode.com` → ALB (Step 11e)
- [ ] Sender domain SPF / DKIM / DMARC records in Route 53 (Step 10d)

### First deploy
- [ ] ECR login succeeded (Step 13a)
- [ ] Docker image built and pushed to ECR (Step 13b)
- [ ] `node script/migrate.js` completed successfully (Step 13c)
- [ ] ECS service reached steady state with new task definition (Step 13d)

### Functional verification (Step 14)
- [ ] `curl https://unshelvd.koshkikode.com/api/health` returns `{ "status": "ok" }` (14a)
- [ ] SPA loads at `https://unshelvd.koshkikode.com/` (14b)
- [ ] Admin login and `/#/admin` dashboard work (14c)
- [ ] Real-time message round-trips in under 1 second (14d)
- [ ] Avatar upload returns an `https://unshelvd-uploads.s3.…` URL (14e)
- [ ] Password-reset email arrives within 60 seconds (14f)

### Observability
- [ ] SNS topic `unshelvd-alerts` exists and email subscription confirmed (Step 16a)
- [ ] CloudWatch alarms armed for ALB 5xx, RDS low storage, and ECS task count (Steps 16b–16d)
- [ ] One-time manual RDS snapshot taken before launch

### Payments (when ready — not required for launch)
- [ ] `unshelvd/STRIPE_SECRET_KEY` rotated to `sk_live_…` in Secrets Manager
- [ ] `unshelvd/STRIPE_WEBHOOK_SECRET` rotated to live endpoint signing secret
- [ ] Amplify env `VITE_STRIPE_PUBLISHABLE_KEY` updated to `pk_live_…` and redeployed
- [ ] PayPal flipped from `sandbox` to `live` in `/#/admin → Settings → Payments`
