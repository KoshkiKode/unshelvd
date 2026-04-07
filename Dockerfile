# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Accept affiliate ID at build time
ARG VITE_THRIFTBOOKS_AFF_ID
ENV VITE_THRIFTBOOKS_AFF_ID=$VITE_THRIFTBOOKS_AFF_ID

# Build frontend + backend
RUN SKIP_ENV_VERIFY=true npm run build

# Generate migrations (schema snapshot for auto-migrate on startup)
RUN npx drizzle-kit generate --config=drizzle.config.ts || true

# ---- Production Stage ----
FROM node:20-alpine AS runner

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built output
COPY --from=builder /app/dist ./dist

# Copy migrations so runMigrations() can apply them on startup
COPY --from=builder /app/migrations ./migrations

# Copy schema config (needed by drizzle at runtime)
COPY drizzle.config.ts ./
COPY shared ./shared
COPY script/bootstrap.js ./script/bootstrap.js
COPY script/seed.js ./script/seed.js

# Expose port
ENV PORT=8080
EXPOSE 8080

# Cloud Run uses its own TCP startup probe — no Docker HEALTHCHECK needed.
# Adding one causes unnecessary restarts during cold starts.

# Run
CMD ["node", "dist/index.cjs"]
