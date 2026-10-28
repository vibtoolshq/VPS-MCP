# Non-root application. No Docker CLI or daemon socket in the runtime.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY public ./public
USER 10001:10001
EXPOSE 3000
CMD ["node","dist/index.js"]
