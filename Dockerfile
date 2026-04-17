# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Accept build-time env vars for the Vite client bundle
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_THRIFTBOOKS_AFF_ID
ENV VITE_THRIFTBOOKS_AFF_ID=$VITE_THRIFTBOOKS_AFF_ID
ARG VITE_ADSENSE_CLIENT
ENV VITE_ADSENSE_CLIENT=$VITE_ADSENSE_CLIENT
ARG VITE_STRIPE_PUBLISHABLE_KEY
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY

# Build frontend + backend
RUN SKIP_ENV_VERIFY=true npm run build

# ---- Production Stage ----
FROM node:20-alpine AS runner

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Run as non-root for security (Cloud Run also enforces this, but be explicit)
USER node

# Ensure production runtime behavior in Cloud Run
ENV NODE_ENV=production

# Copy built output
COPY --from=builder /app/dist ./dist

# Copy migrations so runMigrations() can apply them on startup
COPY --from=builder /app/migrations ./migrations

# Copy schema config (needed by drizzle at runtime)
COPY drizzle.config.ts ./
COPY shared ./shared
COPY script/bootstrap.js ./script/bootstrap.js
COPY script/migrate.js ./script/migrate.js
COPY script/seed.js ./script/seed.js

# Expose port
ENV PORT=8080
EXPOSE 8080

# Cloud Run uses its own TCP startup probe — no Docker HEALTHCHECK needed.
# Adding one causes unnecessary restarts during cold starts.

# Run
CMD ["node", "dist/index.cjs"]
