FROM node:20-slim

WORKDIR /app

# Instalar Coturn y dependencias
# Nota: Coturn requiere algunas dependencias adicionales en Debian slim
RUN apt-get update && \
    apt-get install -y \
    coturn \
    curl \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install deps first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application files
COPY server.js ./
COPY turnserver.conf ./
COPY start.sh ./

# Hacer el script ejecutable
RUN chmod +x start.sh

# Crear directorio de logs
RUN mkdir -p /var/log

# Variables de entorno
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV PEER_PATH=/peerjs
ENV PEER_PROXIED=true
ENV PEER_ALLOW_DISCOVERY=false
ENV PEER_KEY=tankis-peer

# Variables de entorno para TURN
ENV ENABLE_TURN=true
ENV TURN_REALM=peertankis-1093381928939.europe-southwest1.run.app
ENV TURN_USER=tankis-turn
ENV TURN_PASSWORD=tankis-turn-secret

# Exponer puertos: PeerJS (8080) y TURN (3478 UDP/TCP, 5349 TLS, rango 49152-65535)
EXPOSE 8080 3478/udp 3478/tcp 5349/tcp

# Usar el script de inicio que ejecuta ambos servicios
CMD ["./start.sh"]


