FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @metnex/web... --no-frozen-lockfile

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN pnpm --filter @metnex/web build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/next.config.ts ./apps/web/next.config.ts

EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "apps/web", "-p", "3000"]
