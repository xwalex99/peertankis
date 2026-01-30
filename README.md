# Tankis WebSocket Backend

This repo runs the Tankis WebSocket backend that replaces PeerJS/TURN. It keeps room presence and relays game messages. The host still simulates the game (not server-authoritative).

## Run locally

Requires Node 18+ (recommended 20+).

```bash
npm install
npm start
```

Default: `:8080/ws`

## Environment

See `env.example` for the full list.

Common settings:
- `PORT` (default `8080`)
- `WS_PATH` (default `/ws`)
- `ALLOWED_ORIGINS` (comma-separated list, optional)
- `MAX_ROOM_PLAYERS` (default `10`)
- `ROOM_IDLE_TTL_MS` (default `60000`)
- `MESSAGE_MAX_BYTES` (default `65536`)
- `RATE_LIMIT_PER_SEC` (default `50`)
- `PUBLIC_ROOMS_JSON` (optional)

## Health check

`GET /health` returns `{ "ok": true }` when enabled.

## Nginx (example)

```nginx
location /ws {
  proxy_pass http://127.0.0.1:8080/ws;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 86400;
}
```

## Notes

- If you scale horizontally, use sticky sessions or shared room storage.
- The frontend should connect to `VITE_TANKIS_WS_URL` or `ws(s)://<host>/ws`.
