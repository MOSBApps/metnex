FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter api... --no-frozen-lockfile

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter api build
RUN test -f apps/api/dist/migrate.js

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build /app/apps/api/drizzle.config.ts ./apps/api/drizzle.config.ts
COPY --from=build /app/apps/api/package.json ./apps/api/package.json

EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
