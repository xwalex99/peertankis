# Configuración del PeerJS Server **adaptada a Tankis** (frontend)

Este documento define **cómo debe estar configurado tu PeerJS Server** para que el frontend de Tankis conecte de forma estable (host por sala + clients).

> TL;DR: usa **HTTPS (wss)**, un **path fijo** (recomendado `/peerjs`) y (opcional pero recomendado) un **`key`** propio.

## 1) Requisitos que impone el frontend

### 1.1 Room ID (ID de la sala / host)

El frontend construye el ID del host/sala así:

- `buildRoomId(code) => tankblitz-v4-${normalizeRoomCode(code)}`
- Ejemplo: `DM-1` → `tankblitz-v4-DM1`

**Implicación para el servidor**:

- El PeerJS Server debe aceptar IDs con letras/números/guiones (ej: `tankblitz-v4-DM1`).
- No necesitas “rooms” en el servidor; PeerJS maneja peers por ID.

### 1.2 Conexión segura (producción)

En producción, el navegador casi siempre requiere contexto seguro:

- El **frontend** debe usar `secure: true` y **wss** (normalmente puerto 443).
- Si no, verás errores tipo “WebSocket failed” / “Lost connection to server”.

### 1.3 TURN/STUN

El frontend ya incluye STUN/TURN en `utils/network.ts`.

**El servidor PeerJS no reemplaza TURN**. Si hay NAT estricta, TURN es clave.

## 2) Config recomendada del PeerJS Server (Node)

### 2.1 Parámetros recomendados

- **port interno**: `9000` (ejemplo)
- **path**: `/peerjs` (fijo)
- **proxied**: `true` si hay reverse proxy (Nginx/Caddy/Traefik)
- **allow_discovery**: `false` (seguridad, no listar peers)
- **key**: recomendado (evita “key=peerjs” público)

### 2.2 Ejemplo `server.js` (recomendado para Tankis)

Este repo ya trae un `server.js` con defaults adecuados. Variables (ver `env.example`):

- `PORT=9000`
- `PEER_PATH=/peerjs`
- `PEER_PROXIED=true`
- `PEER_ALLOW_DISCOVERY=false`
- `PEER_KEY=tankis-peer`

## 3) Reverse proxy (HTTPS/WSS) — valores que deben coincidir

### 3.1 Recomendación

Haz que el server Node escuche en **HTTP interno**:

- `127.0.0.1:9000`

Y publica por HTTPS:

- `https://peer.tudominio.com/peerjs`

### 3.2 Nginx (fragmento)

```nginx
location /peerjs {
  proxy_pass http://127.0.0.1:9000/peerjs;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 86400;
}
```

**Debe coincidir**:

- Server: `PEER_PATH=/peerjs`
- Nginx: `location /peerjs` y `proxy_pass .../peerjs`
- Frontend: `options.path = '/peerjs'`

## 4) Configuración del frontend para apuntar a tu servidor

En `utils/network.ts` (función `getPeerOptions()`), el frontend debe usar:

### 4.1 Producción (recomendado)

- **host**: `peer.tudominio.com`
- **port**: `443`
- **secure**: `true`
- **path**: `'/peerjs'`
- **key**: el mismo que `PEER_KEY` del server (si usas una)

Ejemplo (conceptual):

```ts
options.host = "peer.tudominio.com";
options.port = 443;
options.secure = true;
options.path = "/peerjs";
options.key = "tankis-peer";
```

### 4.2 Local

- **host**: `localhost`
- **port**: `9000`
- **secure**: `false`
- **path**: `'/peerjs'`
- **key**: opcional (si lo pones en server, ponlo igual en cliente)

## 5) Buenas prácticas para estabilidad

### 5.1 Evitar rate-limit / saturación

Si usas el Cloud gratuito, puedes comerte **429**. Con servidor propio reduces esto.

Aun así:

- evita “escanear” salas creando muchos peers por minuto
- limita reintentos agresivos

### 5.2 Un solo servidor / sticky sessions (si escalas)

PeerJS Server mantiene estado en memoria. Si montas varios nodos detrás de LB:

- necesitas **sticky sessions** o una estrategia de estado compartido (más complejo)
- para empezar: **1 instancia** estable + monitorización

## 6) Checklist rápido (cuando “no conecta”)

- ¿Está el server vivo? (`pm2 status` / `systemctl status`)
- ¿El dominio tiene SSL válido? (LetsEncrypt)
- ¿WSS funciona? (sin `Upgrade` headers, muere)
- ¿El `path` coincide exacto? `/peerjs`
- ¿La `key` coincide? server y client deben ser iguales si la usas
- ¿Firewall/puertos? 80/443 abiertos + puerto interno accesible desde proxy

## Nota: producción con Vercel

- Vercel es perfecto para **subir el frontend** (Tankis).
- Pero **no** es un buen sitio para correr el **PeerJS Server** (signaling) porque requiere **WebSockets persistentes**; si despliegas este repo como “web” en Vercel, normalmente verás `404: NOT_FOUND`.

Arquitectura recomendada:
- **Frontend (Vercel)** → `https://tu-app.vercel.app`
- **PeerJS Server (VPS/host con WSS)** → `https://peer.tudominio.com/peerjs`


