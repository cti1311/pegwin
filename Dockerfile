# ---- backend image ----
FROM node:20.18.1-alpine AS base
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev --no-audit --no-fund
COPY backend/src ./src
COPY backend/migrations ./migrations
COPY backend/scripts ./scripts
COPY backend/package.json ./

# ---- development: full deps, bind-mounted source ----
FROM base AS dev
RUN npm install --no-audit --no-fund
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["sh", "-c", "node scripts/migrate.js && node src/app.js"]

# ---- production: non-root, prod deps only ----
FROM base AS production
RUN addgroup -g 1001 -S app && adduser -S app -u 1001
USER app
EXPOSE 3000
ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["sh", "-c", "node scripts/migrate.js && node src/app.js"]
