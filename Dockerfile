# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
# better-sqlite3 needs build tools when no prebuilt binary matches
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runtime stage
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATA_DIR=/data \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# UID/GID 568 = the TrueNAS SCALE "apps" user, so a host dataset owned by
# 568:568 is writable without extra ACL work.
RUN addgroup -g 568 -S app && adduser -u 568 -S app -G app \
    && mkdir -p /data && chown app:app /data

COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public

USER app
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
