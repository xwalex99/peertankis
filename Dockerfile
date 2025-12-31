FROM node:20-alpine

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the rest
COPY server.js README.md env.example ./ 
COPY docs ./docs

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV PEER_PATH=/peerjs
ENV PEER_PROXIED=true
ENV PEER_ALLOW_DISCOVERY=false
ENV PEER_KEY=tankis-peer

EXPOSE 8080

CMD ["node", "server.js"]


