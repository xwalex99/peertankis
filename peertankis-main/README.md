# WebSocket Backend propio (Node.js) — para Tankis

Este repo levanta un **servidor WebSocket** compatible con el frontend de Tankis. El server actúa como relay entre jugadores (sala) y responde al heartbeat.

## Ejecutar local

Requisitos: **Node 18+** (recomendado 20+).

```bash
npm install
npm start
```

Por defecto escucha en `ws://localhost:9000/ws`.

Variables de entorno (ver `env.example`):
- `HOST` (default `0.0.0.0`)
- `PORT` (default `9000`)
- `WS_PATH` (default `"/ws"`)

## Endpoint esperado por el frontend

El frontend conecta a:

```
ws(s)://<host>/ws?roomId=<roomId>&playerId=<playerId>&isHost=0|1
```

Configurable con `VITE_WS_URL`.

## Mensajes base

Eventos soportados:
- `PING` → heartbeat del cliente.
- `PONG` → respuesta del servidor.
- `JOIN` / `REJOIN` → cuando un jugador entra.
- `PLAYER_LEFT` → cuando sale.
- `SYNC_STATE`, `PLAYER_UPDATE`, `FIRE`, etc → mensajes de gameplay.

El servidor agrega `meta.peerId` e `meta.isHost` a los mensajes reenviados.

## Routing (envelope)

El frontend puede enviar un JSON con opciones de routing:

```json
{
  "type": "PLAYER_UPDATE",
  "payload": { "...": "..." },
  "targetPeerId": "abc123",
  "targetRole": "HOST",
  "broadcast": true,
  "excludePeerId": "abc123"
}
```

Reglas:
- `targetRole: "HOST"` → se envía solo al host de la sala.
- `targetPeerId` → se envía solo al peer indicado.
- `broadcast: true` → se envía a todos, excepto `excludePeerId` si aplica.
- Si no hay routing explícito, se envía al host por defecto.

Ejemplo de mensaje reenviado:

```json
{
  "type": "PLAYER_UPDATE",
  "payload": { "...": "..." },
  "meta": { "peerId": "abc123", "isHost": false }
}
```

## Producción con HTTPS/WSS (Nginx)

Lo más estable:
- WS escuchando en **HTTP interno** (ej: `127.0.0.1:9000`)
- Nginx sirviendo `https://ws.tudominio.com/ws` con soporte WebSocket

Ejemplo de config:

```nginx
server {
  listen 80;
  server_name ws.tudominio.com;

  location / {
    return 301 https://$host$request_uri;
  }
}

server {
  listen 443 ssl http2;
  server_name ws.tudominio.com;

  ssl_certificate     /etc/letsencrypt/live/ws.tudominio.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/ws.tudominio.com/privkey.pem;

  location /ws {
    proxy_pass http://127.0.0.1:9000/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
  }
}
```

Checklist rápida:
- El **path** debe coincidir: Nginx (`/ws`) = server (`WS_PATH`) = cliente (`VITE_WS_URL`)
- Sin `Upgrade/Connection`, **WebSocket falla**

## Importante: Vercel (serverless)

- Este repo es un **servidor**, por eso en Vercel verás `404: NOT_FOUND` si lo despliegas tal cual.
- WebSockets necesitan conexiones **persistentes**; el modelo serverless de Vercel no es ideal.

**Recomendación**: despliega el **frontend** en Vercel y este **WS Server** en un VPS/host con soporte de WebSockets (Nginx/Caddy delante con TLS).

## Cloud Run

Cloud Run funciona bien para este server **si lo mantienes en 1 instancia** (el estado es in-memory).

- **max instances**: `1`
- **min instances**: `1` (evita cold starts)
- **timeout**: alto (ej: `3600s`) para WebSockets

Guía: ver `docs/cloud-run.md`.
