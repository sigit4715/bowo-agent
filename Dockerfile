# ═══════════════════════════════════════════════════════════════════════
# BOWO Agent — Multi-stage Dockerfile
# Stage 1: Build   (node:22-alpine)
# Stage 2: Runtime (node:22-alpine)
# ═══════════════════════════════════════════════════════════════════════

# ── Stage 1: Build ─────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Stage 2: Runtime ───────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Add non-root user for security
RUN addgroup -S bowo && adduser -S bowo -G bowo

WORKDIR /app

# Copy production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled output from build stage
COPY --from=build /app/dist ./dist

# Create directories for volumes
RUN mkdir -p /app/output /app/config && \
    chown -R bowo:bowo /app

USER bowo

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
