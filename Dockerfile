# =============================================================================
# Nemesis Bot - Docker Image
# =============================================================================
# Multi-stage build for minimal production image
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# Stage 2: Production image
# ---------------------------------------------------------------------------
FROM node:20-alpine

LABEL maintainer="Nemesis Esports"
LABEL description="Discord bot for tracking and announcing esports matches"

# Install tini for proper PID 1 signal handling
RUN apk add --no-cache tini

WORKDIR /app

# Copy dependencies from build stage
COPY --from=deps /app/node_modules ./node_modules

# Copy package files
COPY package.json ./

# Copy application source
COPY src/ ./src/

# Create data directory for persistent match storage
RUN mkdir -p data \
    && chown -R node:node /app

# Run as non-root user
USER node

# Use tini as entrypoint for proper signal handling (graceful shutdown)
ENTRYPOINT ["/sbin/tini", "--"]

# Health check - verify the node process is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD pgrep -f "node src/index.js" || exit 1

CMD ["node", "src/index.js"]
