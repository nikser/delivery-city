# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:26-alpine AS builder
WORKDIR /app

RUN npm i -g pnpm@12.21.0
# Copy manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/
COPY packages/tests/package.json ./packages/tests/

RUN pnpm install --frozen-lockfile

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/client/ ./packages/client/
COPY packages/server/ ./packages/server/

# Build shared → client → server
RUN pnpm build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:26-alpine AS production
WORKDIR /app

RUN npm i -g pnpm@12.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/
COPY packages/tests/package.json ./packages/tests/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/client/dist ./packages/client/dist

EXPOSE 3001
CMD ["node", "packages/server/dist/index.js"]
