FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
RUN pnpm install --filter backend --frozen-lockfile
COPY apps/backend ./apps/backend
RUN pnpm --filter backend build
EXPOSE 7777
CMD ["node", "apps/backend/dist/index.js"]
