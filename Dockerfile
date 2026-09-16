FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && cp src/db/schema.sql dist/db/schema.sql && test -f dist/db/schema.sql

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY web ./web
EXPOSE 3000
# Railway: run two services from this image.
#   api:     default CMD below — runs migration (idempotent) then starts the server.
#   indexer: override start command -> node dist/indexer/index.js
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/api/server.js"]
