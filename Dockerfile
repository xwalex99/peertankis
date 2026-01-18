FROM node:20-alpine

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Remove dev dependencies and source files
RUN npm ci --omit=dev
RUN rm -rf src tsconfig.json

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV WS_PATH=/ws

EXPOSE 8080

CMD ["node", "dist/server.js"]
