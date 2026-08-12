FROM node:24.17.0-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
FROM node:24.17.0-alpine
ENV NODE_ENV=production
USER node
WORKDIR /app
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .
EXPOSE 3000
CMD ["node", "src/index.js"]
