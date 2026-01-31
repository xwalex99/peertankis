# Backend para tankisbattle.app: protocolo ROOM_* (server.js)
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV WS_PATH=/ws
ENV MAX_ROOM_PLAYERS=10
ENV ROOM_IDLE_TTL_MS=60000
ENV MESSAGE_MAX_BYTES=65536
ENV RATE_LIMIT_PER_SEC=50

EXPOSE 8080

CMD ["node", "server.js"]
