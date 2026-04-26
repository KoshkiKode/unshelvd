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
| **ECS Cluster** | `unshelvd` |
| **ECS Service** | `unshelvd` |
| **ECS Task Definition** | `unshelvd` |
| **Application Load Balancer** | `unshelvd-alb` |
| **Amazon ECR repository** | `unshelvd` |
| **Amazon RDS instance** | `unshelvd-db` |
| **Amazon S3 uploads bucket** | `unshelvd-uploads` |
| **Sender email** | `noreply@koshkikode.com` |

These values appear throughout this guide, in `ecs-task-def.json`,
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
        ├── /api/**      → Amplify rewrite → ALB → ECS Fargate (Express API)
        └── /ws/**       → Amplify rewrite → ALB → ECS Fargate (WebSocket chat)

ECS Fargate service (behind Application Load Balancer)
  ├── reads secrets from AWS Secrets Manager on startup
  ├── connects to Amazon RDS for PostgreSQL (database)
  └── writes profile / cover images to Amazon S3

GitHub Actions
  ├── ci.yml         — type-check + build + test on every PR / push
  └── deploy.yml     — migrate DB → build Docker image → push ECR → ECS rolling deploy
```

| Service | Role |
|---------|------|
| **GitHub Actions** | CI/CD |
| **Amazon ECR** | Docker image registry |
| **AWS ECS Fargate** | Backend API + WebSocket server (serverless containers) |
| **Application Load Balancer** | Routes HTTP/WebSocket traffic to ECS tasks |
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
| Production domain | `unshelvd.koshkikode.com` | Amplify, ECS env, CORS |
| RDS master password | You generate (`openssl rand -base64 24`) | RDS, Secrets Manager |
| Admin email + password | You choose | First-login credentials |
| SMTP credentials | Your email provider | Transactional email |
| Stripe **test** keys (publishable + secret) | Stripe dashboard → Developers | Build args, Secrets Manager |
| Stripe webhook signing secret (test) | Stripe dashboard → Webhooks | Secrets Manager |
| PayPal sandbox credentials *(optional)* | PayPal developer portal | Secrets Manager |

---

## Step 0 — Pre-deploy code changes (already done in this branch)

The following items have already been applied in the current codebase.
Verify each before continuing with the infrastructure steps.

### 0a. Maintenance mode middleware removed ✓

The blocking 503 middleware has been removed from `server/routes.ts`.
The platform is ready to serve all API requests.

### 0b. CI workflow enabled ✓

`.github/workflows/ci.yml` — the `test` job has no `if: false` guard.
Type-checking, building, and testing run on every push and PR.

### 0c. Deploy workflow updated to ECS ✓

`.github/workflows/deploy.yml` has been updated to use ECS Fargate rolling
deploys instead of App Runner. Both the `migrate` and `build-and-deploy` jobs
are active with no `if: false` guard.

### 0d. ECS task definition template present ✓

`ecs-task-def.json` is the base task definition template. Before registering
it in AWS you must replace the `ACCOUNT_ID` and `REGION` placeholders.

### 0e. Commit and push

```bash
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

### Configure AWS credentials

You need an IAM user or role with permission to create IAM roles, ECR
repositories, ECS clusters/services, ALBs, RDS instances, S3 buckets, and
Secrets Manager secrets.

**Option A — IAM user with access keys (simplest for a solo deploy):**

```bash
# Create an IAM user in the AWS Console → IAM → Users → Create user
# Attach the policy "AdministratorAccess" (or a scoped policy — see below)
# Under the user → Security credentials → Create access key → Application running outside AWS
# Copy the Access Key ID and Secret Access Key

aws configure
# AWS Access Key ID:     AKIAIOSFODNN7EXAMPLE
# AWS Secret Access Key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
# Default region name:   us-east-1
# Default output format: json
```

**Option B — AWS SSO / Identity Center (recommended for teams):**

```bash
aws configure sso
# Follow the prompts — it will open a browser for you to sign in
aws sso login --profile your-profile-name
export AWS_PROFILE=your-profile-name
```

**Verify authentication works:**

```bash
aws sts get-caller-identity
# Should print your Account ID, UserId, and ARN
```

> ⚠️ **Security note**: Never commit AWS access keys to source control.
> Use environment variables, `~/.aws/credentials`, or IAM roles instead.
> Rotate keys regularly and apply least-privilege policies when possible.

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
You will use this URI in the ECS task definition (Step 8).

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
port 5432. Restrict it to your IP and the ECS task subnet:

1. **AWS Console → EC2 → Security Groups** — find the security group attached
   to the RDS instance (named something like `default` or `rds-launch-wizard`).
2. **Inbound rules → Edit → Add rule**:
   - Type: `PostgreSQL`  Port: `5432`  Source: **My IP** (your workstation)
3. After creating the ECS service (Step 8), add a second inbound rule
   allowing port 5432 from the ECS task security group.
4. For a fully private setup, create a VPC with private subnets, place both
   ECS (via a VPC Connector) and RDS in it, and remove public accessibility
   from RDS altogether.

---

## Step 6 — AWS Secrets Manager — runtime secrets (one time)

Create one secret per sensitive value. The deploy workflow reads
`DATABASE_URL` from Secrets Manager during migrations; ECS reads all
of them at container startup as environment variable references.

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

## Step 8 — ECS Fargate — backend service (one time)

### 8a. Create IAM roles for ECS

ECS needs two IAM roles:

- **Execution role** — used by ECS to pull the Docker image from ECR and
  fetch secrets from Secrets Manager. Think of it as ECS's own credentials.
- **Task role** — assumed by the running container to call AWS APIs (S3 writes,
  Secrets Manager reads). Think of it as the app's credentials.

```bash
# ── Execution role trust policy ──────────────────────────────────────────────
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

# Execution role — attach the AWS-managed policy for ECR + CloudWatch Logs
aws iam create-role \
  --role-name unshelvd-ecs-execution \
  --assume-role-policy-document file:///tmp/ecs-trust.json

aws iam attach-role-policy \
  --role-name unshelvd-ecs-execution \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Also allow the execution role to read secrets (for container secrets injection)
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

# ── Task role — what the app container can do ─────────────────────────────────
aws iam create-role \
  --role-name unshelvd-ecs-task \
  --assume-role-policy-document file:///tmp/ecs-trust.json

cat > /tmp/ecs-task-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "WriteS3",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::${S3_BUCKET}/*"
    },
    {
      "Sid": "ReadS3",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
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

### 8b. Create the ECS cluster

```bash
aws ecs create-cluster \
  --cluster-name "$ECS_CLUSTER" \
  --region "$AWS_REGION" \
  --capacity-providers FARGATE \
  --default-capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1

# Verify it exists
aws ecs describe-clusters \
  --clusters "$ECS_CLUSTER" \
  --query 'clusters[0].status' --output text
# Expected: ACTIVE
```

### 8c. Create a CloudWatch log group

```bash
aws logs create-log-group \
  --log-group-name /ecs/unshelvd \
  --region "$AWS_REGION"

aws logs put-retention-policy \
  --log-group-name /ecs/unshelvd \
  --retention-in-days 30 \
  --region "$AWS_REGION"
```

### 8d. Register the ECS task definition

The template is in `ecs-task-def.json`. The `secrets` array uses secret names
(e.g. `unshelvd/DATABASE_URL`) which work when ECS runs in the same account
and region as the secrets. If you prefer to use full ARNs, get them from:

```bash
aws secretsmanager describe-secret --secret-id unshelvd/DATABASE_URL \
  --query ARN --output text
# e.g. arn:aws:secretsmanager:us-east-1:123456789012:secret:unshelvd/DATABASE_URL-AbCdEf
```

Fill in the remaining placeholders and register:

```bash
# Substitute ACCOUNT_ID and REGION placeholders in role ARNs and log config
sed -e "s/ACCOUNT_ID/${AWS_ACCOUNT_ID}/g" \
    -e "s|\"awslogs-region\": \"us-east-1\"|\"awslogs-region\": \"${AWS_REGION}\"|g" \
    ecs-task-def.json > /tmp/task-def-filled.json

# Register the task definition
aws ecs register-task-definition \
  --cli-input-json file:///tmp/task-def-filled.json \
  --region "$AWS_REGION"

# Verify registration
aws ecs describe-task-definition \
  --task-definition "$ECS_TASK_DEF" \
  --query 'taskDefinition.taskDefinitionArn' --output text
```

To add or change environment variables later, update `ecs-task-def.json`,
commit it, and re-register — or edit them directly via
`aws ecs register-task-definition`.

Plain (non-secret) environment variables are in the `environment` array.
Secrets Manager references are in the `secrets` array and are injected as
environment variables at container startup.

| Variable | Type | Value |
|---|---|---|
| `NODE_ENV` | plain | `production` |
| `PORT` | plain | `8080` |
| `APP_URL` | plain | `https://unshelvd.koshkikode.com` |
| `PUBLIC_APP_URL` | plain | `https://unshelvd.koshkikode.com` |
| `WEB_BASE_URL` | plain | `https://unshelvd.koshkikode.com` |
| `CORS_ALLOWED_ORIGINS` | plain | `https://unshelvd.koshkikode.com` |
| `S3_BUCKET_NAME` | plain | `unshelvd-uploads` |
| `AWS_REGION` | plain | `us-east-1` |
| `SMTP_HOST` | plain | `smtp.your-provider.com` |
| `SMTP_PORT` | plain | `587` |
| `SMTP_USER` | plain | `your-smtp-user` |
| `EMAIL_FROM` | plain | `Unshelv'd <noreply@koshkikode.com>` |
| `PAYPAL_CLIENT_ID` | plain | `Aabc...` *(only if PayPal is enabled)* |
| `PAYPAL_WEBHOOK_ID` | plain | `xxxxx` *(only if PayPal is enabled)* |
| `DATABASE_URL` | secret | `unshelvd/DATABASE_URL` |
| `SESSION_SECRET` | secret | `unshelvd/SESSION_SECRET` |
| `STRIPE_SECRET_KEY` | secret | `unshelvd/STRIPE_SECRET_KEY` |
| `STRIPE_WEBHOOK_SECRET` | secret | `unshelvd/STRIPE_WEBHOOK_SECRET` |
| `PAYPAL_CLIENT_SECRET` | secret | `unshelvd/PAYPAL_CLIENT_SECRET` |
| `SMTP_PASS` | secret | `unshelvd/SMTP_PASS` |

> Add plain values to the `environment` array in `ecs-task-def.json`.
> All `ADMIN_*` variables can also be added here for predictable first-run
> admin credentials (see Step 13).

### 8e. Create the VPC security groups and networking

For simplicity this guide uses the **default VPC**. For production hardening
see Appendix B.

```bash
# Get the default VPC ID
export VPC_ID="$(aws ec2 describe-vpcs \
  --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text)"

# Get two subnets in different AZs (required for the ALB)
export SUBNET_IDS="$(aws ec2 describe-subnets \
  --filters Name=vpc-id,Values="$VPC_ID" \
  --query 'Subnets[0:2].SubnetId' --output text | tr '\t' ',')"

echo "VPC: $VPC_ID  Subnets: $SUBNET_IDS"

# Security group for the ALB — allow inbound 80 and 443 from anywhere
export ALB_SG_ID="$(aws ec2 create-security-group \
  --group-name unshelvd-alb-sg \
  --description "Unshelv'd ALB — allow HTTP/HTTPS from internet" \
  --vpc-id "$VPC_ID" \
  --query GroupId --output text)"

aws ec2 authorize-security-group-ingress \
  --group-id "$ALB_SG_ID" \
  --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress \
  --group-id "$ALB_SG_ID" \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

# Security group for ECS tasks — allow inbound 8080 from the ALB only
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

### 8f. Create the Application Load Balancer

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

echo "ALB ARN: $ALB_ARN"
echo "ALB DNS: $ALB_DNS"
# Save ALB_DNS — you will use it in the Amplify rewrites (Step 12c)

# Create the target group — forwards to ECS tasks on port 8080
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

# HTTPS listener — requires an ACM certificate (create one in Step 8g first)
# Come back and run this after Step 8g:
# aws elbv2 create-listener \
#   --load-balancer-arn "$ALB_ARN" \
#   --protocol HTTPS \
#   --port 443 \
#   --certificates CertificateArn="$CERT_ARN" \
#   --default-actions Type=forward,TargetGroupArn="$TG_ARN" \
#   --region "$AWS_REGION"
```

### 8g. Request an ACM certificate for the ALB

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

Add the CNAME record to Route 53, wait a few minutes for validation
(`aws acm describe-certificate ... --query Certificate.Status`), then
create the HTTPS listener:

```bash
aws elbv2 create-listener \
  --load-balancer-arn "$ALB_ARN" \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn="$CERT_ARN" \
  --default-actions Type=forward,TargetGroupArn="$TG_ARN" \
  --region "$AWS_REGION"
```

### 8h. Create the ECS Fargate service

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

> **Note:** `assignPublicIp=ENABLED` is required when using the default VPC's
> public subnets, so the tasks can pull the Docker image from ECR.
> In a private-subnet setup, use `DISABLED` and route through a NAT Gateway.

Wait for the service to reach a steady state:

```bash
aws ecs wait services-stable \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --region "$AWS_REGION"
```

---

## Step 9 — Configure email (SMTP)

Unshelv'd sends transactional email for password resets, offer
notifications, shipping updates, delivery confirmations, and new messages.

### 9a. Choose an SMTP provider

Recommended options (all have free tiers that cover a new marketplace):

| Provider | Free tier | Notes |
|---|---|---|
| **Amazon SES** | 62,000/month from ECS | Best cost; requires domain verification |
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

Alternatively, add them as plain environment variables in `ecs-task-def.json`:
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `EMAIL_FROM`, and store `SMTP_PASS`
in Secrets Manager (already included in the template).

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
      "Sid": "ECSDescribe",
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeTaskDefinition",
        "ecs:DescribeServices",
        "ecs:DescribeClusters"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ECSRegisterAndDeploy",
      "Effect": "Allow",
      "Action": [
        "ecs:RegisterTaskDefinition",
        "ecs:UpdateService"
      ],
      "Resource": [
        "arn:aws:ecs:${AWS_REGION}:${AWS_ACCOUNT_ID}:task-definition/${ECS_TASK_DEF}:*",
        "arn:aws:ecs:${AWS_REGION}:${AWS_ACCOUNT_ID}:service/${ECS_CLUSTER}/${ECS_SERVICE}"
      ]
    },
    {
      "Sid": "PassIAMRolesToECS",
      "Effect": "Allow",
      "Action": ["iam:PassRole"],
      "Resource": [
        "arn:aws:iam::${AWS_ACCOUNT_ID}:role/unshelvd-ecs-execution",
        "arn:aws:iam::${AWS_ACCOUNT_ID}:role/unshelvd-ecs-task"
      ]
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

### 11b. Repository variables

Go to **GitHub → Settings → Secrets and variables → Actions → Variables** and
add:

| Variable name | Value |
|---|---|
| `AWS_REGION` | `us-east-1` (or your region) |
| `ECR_REPOSITORY` | `unshelvd` |
| `ECS_CLUSTER` | `unshelvd` |
| `ECS_SERVICE` | `unshelvd` |
| `ECS_TASK_DEFINITION` | `unshelvd` |
| `ECS_CONTAINER_NAME` | `unshelvd` |
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
Amplify's rewrite rule proxies them to ECS via the ALB.

### 12c. Configure rewrites and redirects

In **App settings → Rewrites and redirects** add the following rules **in
this exact order** (order matters — the SPA fallback must be last):

| # | Source pattern | Target | Rewrite type |
|---|---|---|---|
| 1 | `/api/<*>` | `https://<ALB_DNS_NAME>/api/<*>` | `200 (Rewrite)` |
| 2 | `/ws/<*>` | `https://<ALB_DNS_NAME>/ws/<*>` | `200 (Rewrite)` |
| 3 | `/<*>` | `/index.html` | `200 (Rewrite)` |

Replace `<ALB_DNS_NAME>` with the ALB DNS name from Step 8f (e.g.
`unshelvd-alb-1234567890.us-east-1.elb.amazonaws.com`).

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
the ECS task definition **before** the first successful deploy.

Add these to the `environment` array in `ecs-task-def.json` and
re-register the task definition:

| Key | Value |
|---|---|
| `ADMIN_USERNAME` | `admin` (or your preferred username) |
| `ADMIN_EMAIL` | `your-email@koshkikode.com` |
| `ADMIN_PASSWORD` | A strong password (12+ chars, upper/lower/number/symbol) |

If these are not set, `auto-seed` generates random credentials and prints
them in the CloudWatch logs for the ECS task:

```bash
aws logs tail /ecs/unshelvd --follow
# Search for the line starting with "Admin credentials:"
```

---

## Step 14 — First deploy

Now trigger the first deploy by pushing to `main`. The CI + Deploy workflows
run automatically.

```bash
git push origin main
# Or, if you haven't changed any code:
git commit --allow-empty -m "ci: trigger first AWS ECS deploy"
git push origin main
```

Watch progress in **GitHub → Actions**. The workflow:

1. **`migrate` job** — checks out the code, installs Node 24, fetches
   `DATABASE_URL` from Secrets Manager, and runs `node script/migrate.js`.
   This creates all database tables. Migrations are idempotent — safe to
   re-run on subsequent deploys.
2. **`build-and-deploy` job** (runs after `migrate` succeeds) — builds the
   Docker image with the Vite client baked in, pushes `:<sha>` and `:latest`
   tags to ECR, then registers a new ECS task definition revision and
   triggers a rolling deploy on the ECS service.
3. ECS pulls the new image, runs the health-check against `/api/health` via
   the ALB target group, and drains the old task when the new one is healthy.

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
4. *(Confirms the session cookie is crossing the Amplify → ALB → ECS origin
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
   `S3_BUCKET_NAME` is set in the ECS task environment variables.)

### 15f. Email delivery

1. Go to `/#/login` → **Forgot password** → enter the admin email.
2. A password-reset email must arrive within 60 seconds.
3. If it doesn't arrive, check the ECS task logs for SMTP errors:
   ```bash
   aws logs tail /ecs/unshelvd --filter-pattern "SMTP" --follow
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
3. Use the **Send test event** button in the Stripe dashboard. The ECS task
   logs should show `200` for the webhook delivery.

### 15h. CloudWatch logs (confirm ECS is healthy)

```bash
# Tail application logs (stdout/stderr from the Node.js process)
aws logs tail /ecs/unshelvd --follow

# List recent log streams (one per ECS task)
aws logs describe-log-streams \
  --log-group-name /ecs/unshelvd \
  --order-by LastEventTime --descending \
  --region "$AWS_REGION"
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

### 16b. ALB 5xx error rate alarm

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "unshelvd-alb-5xx-rate" \
  --alarm-description "More than 5% of ALB responses are 5xx" \
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

### ECS rollback

ECS keeps all previous task definition revisions. To roll back without a
code change:

```bash
# List recent task definition revisions
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

Alternatively, re-tag an old Docker image as `:latest` in ECR and push,
then update the service:

```bash
REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
docker pull "$REGISTRY/$ECR_REPO:<OLD_SHA>"
docker tag  "$REGISTRY/$ECR_REPO:<OLD_SHA>" "$REGISTRY/$ECR_REPO:latest"
docker push "$REGISTRY/$ECR_REPO:latest"
# Then trigger a new deploy via git push or workflow_dispatch
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
| GitHub Actions deploy workflow does nothing (jobs show as skipped) | `if: false` is still on a job definition in `deploy.yml` | Remove `if: false` from the affected job |
| Amplify build fails on `npm run build` | Missing `VITE_*` env var in Amplify console | Add `VITE_STRIPE_PUBLISHABLE_KEY` under **App settings → Environment variables** and redeploy |
| `https://$DOMAIN/` loads, but `/api/health` returns the SPA HTML | Amplify rewrites are in the wrong order | Ensure `/api/<*>` rewrite rule is **above** the `/<*>` → `/index.html` rule |
| `/api/health` returns 502 or "Service Unavailable" | ECS task is not running or failing health checks | Check ECS service events and CloudWatch logs at `/ecs/unshelvd`; confirm the execution role can read all `unshelvd/*` secrets |
| ECS task immediately stops with exit code non-zero | Missing required secret or env var | Tail CloudWatch logs; confirm all Secrets Manager ARNs in the task definition are correct |
| ECS health check stuck on "IN_PROGRESS" | Health check path or port mismatch in target group | Set health check to HTTP, path `/api/health`, port `8080` |
| ECS task logs: `ECONNREFUSED` connecting to RDS | RDS security group doesn't allow the ECS task security group | Add an inbound rule on the RDS security group allowing port 5432 from `ECS_SG_ID` |
| Login works on web but not in the mobile app | CORS rejected the Capacitor origin, or session cookie not crossing origins | Confirm `NODE_ENV=production` so cookies are `SameSite=None; Secure`; Capacitor origins are allowed by default |
| Images upload but show broken in the browser | `S3_BUCKET_NAME` env var not set in ECS, or bucket policy blocks public reads | Confirm `S3_BUCKET_NAME=unshelvd-uploads` is set; verify the bucket policy allows anonymous GET on `avatars/*` and `covers/*` |
| Messages take 5s to arrive instead of instant | WebSocket not connecting — Amplify `/ws/<*>` rewrite is missing (web) | Add the `/ws/<*>` rewrite rule pointing to the ALB (see Step 12c) |
| Password-reset emails not delivered | SMTP not configured, or sending domain not verified | Set SMTP env vars in the ECS task definition; check CloudWatch logs for SMTP errors; verify SPF/DKIM records in Route 53 |
| Stripe webhooks rejected with `signature verification failed` | Webhook signing secret mismatch | Re-copy the signing secret from the Stripe dashboard for the **specific endpoint** and update `unshelvd/STRIPE_WEBHOOK_SECRET` in Secrets Manager |
| `npm run check` fails in CI but passes locally | Node version drift | CI uses Node 24; keep your local Node 20+ and ensure `.nvmrc` is consistent |
| GitHub Actions OIDC fails: `not authorized to perform sts:AssumeRoleWithWebIdentity` | Trust policy `sub` condition doesn't match the repo | Update the trust policy `StringLike` to `repo:KoshkiKode/unshelvd:*` |
| ECS shows `CannotPullContainerError` | No image has been pushed to ECR yet, or execution role lacks ECR pull permissions | Let the GitHub Actions deploy workflow run first; confirm execution role has `AmazonECSTaskExecutionRolePolicy` attached |

For any other issue, the fastest signal is:

```bash
aws logs tail /ecs/unshelvd --follow
```

---

## Appendix A — Launch-day go/no-go checklist

A single signoff list to walk top-to-bottom on launch day. Every box must
be checked before flipping public DNS to the production CDN. Each item
links back to the section that explains how to satisfy it.

### Identifiers and references
- [ ] Production URL is `https://unshelvd.koshkikode.com` everywhere
      (`ecs-task-def.json`, `server/index.ts` CORS allow-list,
      `client/index.html` canonical + OG tags, `.env.example`,
      `README.md`, `MOBILE.md`, `CONNECTIVITY.md`).
- [ ] Mobile bundle / application ID is `com.koshkikode.unshelvd` in
      `capacitor.config.ts`, `android/app/build.gradle`,
      `android/app/src/main/res/values/strings.xml`, and the iOS Xcode
      project (`PRODUCT_BUNDLE_IDENTIFIER`).
- [ ] Sender email is `noreply@koshkikode.com` and SPF / DKIM / DMARC
      records exist in Route 53 (Step 9d).

### Phase 1 — Pre-deploy code changes (Step 0)
- [x] Maintenance-mode 503 middleware removed from `server/routes.ts` (0a).
- [x] `.github/workflows/ci.yml` `test` job is enabled (no `if: false`) (0b).
- [x] `.github/workflows/deploy.yml` jobs updated for ECS — no `if: false` (0c).
- [x] `ecs-task-def.json` is present with `ACCOUNT_ID`/`REGION` placeholders (0d).
- [ ] `ACCOUNT_ID` and `REGION` placeholders replaced in `ecs-task-def.json` and registered (Step 8d).
- [ ] Changes merged to `main` (0e).

### Phase 2 — AWS infrastructure (one-time)
- [ ] AWS credentials configured (`aws sts get-caller-identity` succeeds) (Step 1).
- [ ] Amazon ECR repository `unshelvd` created with `scanOnPush=true` (Step 4).
- [ ] Amazon RDS PostgreSQL `unshelvd-db` available, master password stored,
      `unshelvd` database created, security group locked down (Step 5).
- [ ] AWS Secrets Manager entries created for `DATABASE_URL`,
      `SESSION_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
      `PAYPAL_CLIENT_SECRET` (if used), `SMTP_PASS` (Step 6).
- [ ] Amazon S3 bucket `unshelvd-uploads` created with versioning enabled
      and bucket policy allowing public GET on `avatars/*` and `covers/*`
      only (Step 7).
- [ ] ECS execution role `unshelvd-ecs-execution` and task role
      `unshelvd-ecs-task` created (Step 8a).
- [ ] ECS cluster `unshelvd` created (Step 8b).
- [ ] CloudWatch log group `/ecs/unshelvd` created with 30-day retention (Step 8c).
- [ ] Task definition `unshelvd` registered in ECS with correct ARNs (Step 8d).
- [ ] VPC security groups created for ALB and ECS tasks (Step 8e).
- [ ] Application Load Balancer `unshelvd-alb` created with target group,
      health check, and HTTPS listener (Step 8f–8g).
- [ ] ECS Fargate service `unshelvd` created and reached steady state (Step 8h).

### Phase 3 — CI / CD and frontend
- [ ] GitHub OIDC provider registered and `unshelvd-github-deploy` role
      scoped to `repo:KoshkiKode/unshelvd:*` (Step 10).
- [ ] GitHub repo secret `AWS_DEPLOY_ROLE_ARN` set (Step 11a).
- [ ] GitHub repo variables `AWS_REGION`, `ECR_REPOSITORY`, `ECS_CLUSTER`,
      `ECS_SERVICE`, `ECS_TASK_DEFINITION`, `ECS_CONTAINER_NAME`,
      `DATABASE_URL_SECRET_ID`, `STRIPE_PUBLISHABLE_KEY` set (Step 11b).
- [ ] Amplify Hosting connected to `KoshkiKode/unshelvd` `main` branch and
      detects `amplify.yml` (Step 12a).
- [ ] Amplify build env `VITE_STRIPE_PUBLISHABLE_KEY` set;
      `VITE_API_URL` left **unset** so SPA uses same-origin (Step 12b).
- [ ] Amplify rewrites configured **in this exact order**:
      `/api/<*>` → ALB, `/ws/<*>` → ALB,
      `/<*>` → `/index.html` (Step 12c).
- [ ] Custom domain `unshelvd.koshkikode.com` added in Amplify, ACM
      certificate validated, Route 53 CNAME records live (Step 12d).
- [ ] First deploy succeeded — most recent GitHub Actions run on `main` is
      green and ECS shows the new task as `RUNNING` (Step 14).

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
- [ ] Stripe **test** webhook from the dashboard returns 200 in ECS
      logs (15g).

### Phase 5 — Observability and safety nets (Step 16)
- [ ] SNS topic `unshelvd-alerts` exists and the operator email
      subscription is **confirmed** (16a).
- [ ] CloudWatch alarm `unshelvd-alb-5xx-rate` armed against the ALB
      `HTTPCode_Target_5XX_Count` metric (16b).
- [ ] CloudWatch alarm `unshelvd-rds-low-storage` armed against
      `FreeStorageSpace` (16c).
- [ ] CloudWatch alarm `unshelvd-ecs-no-tasks` armed against
      `RunningTaskCount` (16d).
- [ ] CloudWatch log retention set on `/ecs/unshelvd` (30 days).
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
      ECS service to private subnets via a VPC Connector.
- [ ] Switch S3 to a private bucket fronted by CloudFront with Origin
      Access Control; update `server/s3.ts` `publicUrl()` accordingly.
- [ ] Add AWS WAF in front of the ALB with
      `AWSManagedRulesCommonRuleSet` and
      `AWSManagedRulesAmazonIpReputationList`.
- [ ] Enable Amazon GuardDuty and AWS Security Hub.
- [ ] Add a CloudWatch Synthetics canary that hits `/api/health` and `/`
      every 5 minutes from at least two regions.
- [ ] Enable ECS Service Auto Scaling to scale task count based on
      ALB `RequestCountPerTarget` or CPU utilization.
- [ ] Stand up a separate ECS service from a `staging` branch for
      pre-production testing.
