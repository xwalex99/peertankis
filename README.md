# PeerJS Server propio (Node.js) — para Tankis

Este repo levanta un **servidor de señalización PeerJS** (no es un “servidor de juego”). Sirve para que tus clientes WebRTC intercambien SDP/ICE sin depender del cloud gratuito (`0.peerjs.com`).

## Ejecutar local

Requisitos: **Node 18+** (recomendado 20+).

```bash
npm install
npm start
```

Por defecto escucha en `:9000/peerjs`.

Variables de entorno (ver `env.example`):
- `PORT` (default `9000`)
- `PEER_PATH` (default `"/peerjs"`)
- `PEER_PROXIED` (default `true`)
- `PEER_ALLOW_DISCOVERY` (default `false`)
- `PEER_KEY` (default `"tankis-peer"`; si lo usas, el cliente debe usar la misma `key`)

## Producción con HTTPS/WSS (Nginx)

Lo más estable:
- PeerJS escuchando en **HTTP interno** (ej: `127.0.0.1:9000`)
- Nginx sirviendo `https://peer.tudominio.com/peerjs` con soporte WebSocket

Ejemplo de config:

```nginx
server {
  listen 80;
  server_name peer.tudominio.com;

  location / {
    return 301 https://$host$request_uri;
  }
}

server {
  listen 443 ssl http2;
  server_name peer.tudominio.com;

  ssl_certificate     /etc/letsencrypt/live/peer.tudominio.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/peer.tudominio.com/privkey.pem;

  location /peerjs {
    proxy_pass http://127.0.0.1:9000/peerjs;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
  }
}
```

Checklist rápida:
- El **path** debe coincidir: Nginx (`/peerjs`) = server (`PEER_PATH`) = cliente (`options.path`)
- Si usas **key**: server (`PEER_KEY`) = cliente (`options.key`)
- Sin `Upgrade/Connection`, **WebSocket falla**
- Para HTTPS detrás de proxy: deja `PEER_PROXIED=true`

## Nota sobre NAT estricta

PeerJS Server solo hace señalización. Si hay NAT estricta, puede hacer falta **TURN** además de STUN.


