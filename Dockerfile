# Diffwise — long-lived Node server for Railway (no serverless duration cap).
FROM node:22-slim AS base
ENV NODE_ENV=production
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# ---- build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A valid-shaped placeholder so `next build` (which does not contact services)
# passes; real values are injected as Railway service variables at runtime.
ENV ENCRYPTION_MASTER_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
RUN npm run build

# ---- runtime ----
FROM base AS runtime
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
EXPOSE 3000
CMD ["npm", "run", "start"]
