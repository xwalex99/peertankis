# Frontend Integration Guide - Tennis Backend

## Endpoint
- WebSocket: `wss://<tu-dominio>/ws`
- Health: `GET https://<tu-dominio>/health` responde `200`.

## Flujo minimo esperado por frontend
1. Conectar a `wss://<tu-dominio>/ws`.
2. Enviar `session.hello`.
3. Crear sala con `lobby.create_private` o unirse con `lobby.join_by_code`.
4. Seleccionar personaje con `lobby.select_character`.
5. Marcar ready con `lobby.ready`.
6. Recibir `match.countdown` -> `match.started` -> `match.state_snapshot` a 20Hz.
7. Durante partida enviar `match.input` (hasta 30Hz) y `ability.activate` cuando aplique.
8. Si hay reconexion dentro de 20s, backend envia `match.resync_snapshot`.

## Mensajes cliente -> servidor
- `session.hello`
- `session.ping`
- `lobby.create_private`
- `lobby.join_by_code`
- `lobby.leave`
- `lobby.select_character`
- `lobby.ready`
- `lobby.rematch_vote`
- `match.input`
- `ability.activate`

## Mensajes servidor -> cliente
- `session.welcome`
- `session.pong`
- `lobby.room_created`
- `lobby.room_state`
- `lobby.error`
- `match.countdown`
- `match.started`
- `match.state_snapshot`
- `match.point_result`
- `match.score_update`
- `ability.result`
- `match.finished`
- `match.resync_snapshot`

## Payloads criticos
`lobby.room_state` incluye:
- `roomId`, `roomCode`, `status`
- `players[]` con `playerId`, `name`, `slot`, `ready`, `characterId`

`match.state_snapshot` incluye:
- `tick`
- `ball: { x, y, z, vx, vy, vz, spin }`
- `players[]`: `playerId`, `x`, `z`, `abilityCooldownMs`
- `score`: `sets`, `games`, `points`, `serverPlayerId`

## Errores normalizados
El backend responde errores asi:

```json
{
  "type": "lobby.error",
  "payload": {
    "code": "ROOM_NOT_FOUND",
    "message": "Codigo no valido"
  }
}
```

Codigos soportados:
- `ROOM_NOT_FOUND`
- `ROOM_FULL`
- `ALREADY_IN_ROOM`
- `INVALID_ROOM_CODE`
- `MATCH_ALREADY_STARTED`
- `CHARACTER_ALREADY_TAKEN`
- `NOT_READY`
- `COOLDOWN_ACTIVE`
- `INVALID_INPUT`
- `RATE_LIMITED`
- `UNAUTHORIZED`
- `VERSION_MISMATCH`
- `SERVER_ERROR`

## Comandos de ejecucion
```bash
cd backend-tennis
npm install
npm run build
npm start
```

## Recomendacion de despliegue
- Poner el servicio detras de HTTPS/TLS valido.
- Exponer solo `wss://.../ws`.
- Si usas proxy (Nginx/Cloud Run), habilitar upgrade WebSocket y timeouts > 20 min.
