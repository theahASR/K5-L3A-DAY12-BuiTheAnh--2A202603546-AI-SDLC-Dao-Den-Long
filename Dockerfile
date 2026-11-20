FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/game.contract.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-headless ./dist-headless
COPY --from=builder /app/scripts/run-game.mjs ./scripts/run-game.mjs
EXPOSE 4173
CMD ["node", "scripts/run-game.mjs", "--port", "4173"]
