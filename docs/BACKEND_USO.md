# Uso del backend WebSocket (peertankis)

Documentación detallada del servidor WebSocket que gestiona salas y reenvía mensajes entre jugadores.

---

## 1. Descripción general

- **Qué hace**: Mantiene salas por código (`roomCode`), asocia cada conexión WebSocket a un jugador en una sala, reenvía mensajes entre jugadores (al host, a todos o a un peer concreto) y expone endpoints HTTP para comprobar que el servicio está vivo.
- **Qué no hace**: No simula el juego; la lógica de partida sigue en el host/cliente. El backend solo hace de “relé” y presencia.
- **Protocolo**: Mensajes JSON por WebSocket con `type` y opcionalmente `payload`. Todas las respuestas del servidor usan el mismo formato.

---

## 2. Requisitos

- **Node.js** 18+ (recomendado 20+).
- Dependencia: `ws`.

```bash
npm install
```

---

## 3. Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Interfaz donde escucha el servidor HTTP/WS. |
| `PORT` | `8080` | Puerto TCP. |
| `WS_PATH` | `/ws` | Ruta del WebSocket (ej. `http://host:8080/ws`). |
| `ALLOWED_ORIGINS` | *(vacío)* | Lista separada por comas de orígenes permitidos. Si está vacía, se acepta cualquier origen. |
| `MAX_ROOM_PLAYERS` | `10` | Máximo de jugadores por sala (límite global). |
| `ROOM_IDLE_TTL_MS` | `60000` | Tiempo en ms sin jugadores tras el cual se borra la sala (60 s). |
| `MESSAGE_MAX_BYTES` | `65536` | Tamaño máximo de un mensaje (64 KB). |
| `RATE_LIMIT_PER_SEC` | `50` | Máximo de mensajes por segundo por conexión. |
| `PUBLIC_ROOMS_JSON` | `{}` | JSON con modos y listas de códigos de sala (ej. `{"DEATHMATCH":["DM-1","DM-2"]}`). Usado en `ROOMS_STATUS_REQUEST` si no se envían `rooms`. |
| `HEALTH_ENABLED` | `true` | Si `true`, responde en `GET /health`. |

Copia `env.example` y ajusta valores según entorno.

---

## 4. Ejecución local

```bash
# Desarrollo (sin compilar)
node server.js
```

Deberías ver:

```text
[ws] listening on 0.0.0.0:8080/ws
```

- **HTTP**: `http://127.0.0.1:8080` (o el `HOST`/`PORT` que uses).
- **WebSocket**: `ws://127.0.0.1:8080/ws` (o la ruta definida en `WS_PATH`).

---

## 5. Endpoints HTTP

### 5.1 GET `/`

- **Uso**: Comprobar que el servicio está arriba y saber la ruta del WS.
- **Respuesta**: `200`, JSON:
  - `service`: `"peertankis-ws"`
  - `ok`: `true`
  - `ws`: valor de `WS_PATH` (ej. `"/ws"`)

### 5.2 GET `/health`

- **Uso**: Health check (load balancers, Cloud Run, etc.).
- **Condición**: Solo si `HEALTH_ENABLED=true`.
- **Respuesta**: `200`, JSON: `{ "ok": true }`.

### 5.3 Cualquier otra ruta

- **Respuesta**: `404`, JSON: `{ "error": "not_found" }`.

---

## 6. WebSocket

### 6.1 URL y conexión

- **URL**: `ws(s)://<host>:<port><WS_PATH>` (por defecto `ws://host:8080/ws`).
- No se usan query params para identificar sala/jugador; eso va en el primer mensaje (`ROOM_JOIN` o `ROOM_REJOIN`).
- Si `ALLOWED_ORIGINS` tiene valores, el servidor comprueba el header `Origin`; si no está en la lista, cierra la conexión.

### 6.2 Formato de mensajes

Todos los mensajes son **JSON** en texto (no binario).

- **Cliente → Servidor**: `{ "type": "<TIPO>", "payload": { ... } }`.  
  `payload` es opcional según el tipo.
- **Servidor → Cliente**: mismo formato: `{ "type": "<TIPO>", "payload": { ... } }`.

Si el JSON es inválido o falta `type`, el servidor responde con `ROOM_ERROR` (ver sección de errores).

---

## 7. Mensajes cliente → servidor

Solo estos `type` están aceptados; cualquier otro devuelve `ROOM_ERROR` con código `UNKNOWN_TYPE`.

### 7.1 `ROOM_JOIN`

Entrar a una sala (creándola si no existe y se permite).

**Payload:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `roomCode` | string | Sí | Código de sala: 1–32 caracteres `[A-Za-z0-9_-]`. |
| `create` | boolean | No | Si `true` y la sala no existe, se crea. Si `false` y no existe → `ROOM_NOT_FOUND`. |
| `player` | object | No | Datos del jugador. |
| `player.id` | string | No | ID único del jugador. Si no se envía, el servidor genera un UUID. |
| `player.name` | string | No | Nombre mostrado. |
| `player.team` | string | No | Equipo (ej. `"RED"`, `"BLUE"`). |
| `settings` | object | No | Solo se aplican al **crear** la sala o si la sala está vacía. |
| `settings.maxPlayers` | number | No | Máximo de jugadores (acotado por `MAX_ROOM_PLAYERS`). |
| `settings.mode` | string | No | Modo de juego (informativo). |

**Respuestas:**

- **Éxito**: `ROOM_JOINED` con `clientId`, `isHost`, `hostId`, `hostName`, `peers`.
- **Error**: `ROOM_ERROR` con códigos como `INVALID_ROOM_CODE`, `ROOM_NOT_FOUND`, `ROOM_FULL`.

Si el mismo `playerId` ya estaba en la sala con otra conexión, la anterior se cierra (reemplazo).

---

### 7.2 `ROOM_REJOIN`

Reconectar a una sala ya existente con un `playerId` que ya estaba dentro (por ejemplo tras refrescar la pestaña).

**Payload:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `roomCode` | string | Sí | Código de sala. |
| `playerId` | string | Sí | ID del jugador que ya estaba en la sala. |

**Respuestas:**

- **Éxito**: `ROOM_JOINED` (mismo formato que en `ROOM_JOIN`).
- **Error**: `ROOM_ERROR` (`INVALID_ROOM_CODE`, `ROOM_NOT_FOUND`, `INVALID_PLAYER_ID`, `PLAYER_NOT_FOUND`).

La conexión anterior de ese `playerId` se cierra si es distinta.

---

### 7.3 `ROOM_LEAVE`

Salir de la sala asociada a esta conexión.

**Payload (opcional):**

- `roomCode`, `playerId`: si no se envían, el servidor usa la sala/jugador asociados a la conexión actual.

Tras salir, el servidor notifica a los demás con `ROOM_PEER_LEFT` y puede cambiar el host (`ROOM_HOST_CHANGED`). Si la sala queda vacía, se programa borrado tras `ROOM_IDLE_TTL_MS`.

---

### 7.4 `ROOM_MESSAGE`

Enviar un mensaje a otro(s) jugadores de la misma sala. El contenido (`message`) es opaco para el backend; suele ser un objeto de juego (estado, eventos, etc.).

**Payload:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `roomCode` | string | Sí | Sala en la que estás. |
| `message` | any | Sí | Cuerpo del mensaje (objeto, array, etc.). |
| `to` | string | Sí | Destino: `"HOST"`, `"ALL"` o un `playerId` concreto. |
| `exclude` | string | No | Solo si `to === "ALL"`: un `playerId` a no incluir en el broadcast. |

**Comportamiento:**

- `to === "HOST"`: solo el host recibe `ROOM_MESSAGE` con `from` y `message`.
- `to === "ALL"`: todos los de la sala reciben el mensaje (menos el opcional `exclude`).
- `to === "<playerId>"`: solo ese jugador recibe el mensaje.

**Errores**: `ROOM_ERROR` (`INVALID_ROOM_CODE`, `NOT_IN_ROOM`, `ROOM_NOT_FOUND`, `HOST_NOT_FOUND`, `PEER_NOT_FOUND`, `INVALID_TARGET`).

---

### 7.5 `ROOM_STATUS_REQUEST`

Pide el estado de **una** sala.

**Payload:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `roomCode` | string | Sí | Código de la sala. |

**Respuesta:** `ROOM_STATUS_RESPONSE` con `roomCode`, `status` (`"OPEN"` / `"FULL"` / `"OFFLINE"`), `players`, `max`, `teamPlayers`, `mode`.

---

### 7.6 `ROOMS_STATUS_REQUEST`

Pide el estado de **varias** salas.

**Payload:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `rooms` | string[] | No* | Lista de códigos de sala. |
| `mode` | string | No | Si no se envía `rooms`, el servidor usa `PUBLIC_ROOMS_JSON[mode]` como lista de códigos. |

\* Si no hay `rooms` ni `mode` con lista configurada, se devuelve array vacío.

**Respuesta:** `ROOMS_STATUS_RESPONSE` con `rooms`: array de objetos con el mismo formato que en `ROOM_STATUS_RESPONSE`.

---

## 8. Mensajes servidor → cliente

| type | Cuándo | payload (resumen) |
|------|--------|--------------------|
| `ROOM_JOINED` | Tras `ROOM_JOIN` o `ROOM_REJOIN` correcto | `clientId`, `isHost`, `hostId`, `hostName`, `peers` (lista de `{ id, joinedAt }`). |
| `ROOM_ERROR` | Cualquier error de validación o lógica | `message` (texto), `code` (ej. `ROOM_NOT_FOUND`, `ROOM_FULL`). |
| `ROOM_PEER_JOINED` | Alguien nuevo entra a tu sala | `peerId`. |
| `ROOM_PEER_LEFT` | Alguien sale de la sala | `peerId`. |
| `ROOM_HOST_CHANGED` | Cambia el host (p. ej. se fue el anterior) | `hostId`, `hostName`. |
| `ROOM_MESSAGE` | Mensaje dirigido a ti (del host, broadcast o directo) | `from` (playerId), `message` (cuerpo). |
| `ROOM_STATUS_RESPONSE` | Respuesta a `ROOM_STATUS_REQUEST` | `roomCode`, `status`, `players`, `max`, `teamPlayers`, `mode`. |
| `ROOMS_STATUS_RESPONSE` | Respuesta a `ROOMS_STATUS_REQUEST` | `rooms`: array de estados. |

---

## 9. Códigos de error (`ROOM_ERROR.code`)

| Código | Significado |
|--------|-------------|
| `INVALID_ROOM_CODE` | `roomCode` vacío, mal formato o > 32 caracteres. |
| `ROOM_NOT_FOUND` | La sala no existe (y no se creó). |
| `ROOM_FULL` | La sala tiene ya `maxPlayers` y no eres un peer que se reconecta. |
| `INVALID_PLAYER_ID` | Falta o inválido `playerId` (p. ej. en `ROOM_REJOIN`). |
| `PLAYER_NOT_FOUND` | Ese `playerId` no está en la sala. |
| `NOT_IN_ROOM` | Enviaste un `roomCode` distinto al de tu conexión. |
| `HOST_NOT_FOUND` | Pediste enviar al host pero no hay host. |
| `PEER_NOT_FOUND` | El `to` (playerId) no existe en la sala. |
| `INVALID_TARGET` | `to` no es `HOST`, `ALL` ni un playerId válido. |
| `INVALID_JSON` | El cuerpo del mensaje no es JSON válido. |
| `INVALID_FORMAT` | Falta `type` o no es string. |
| `INVALID_MESSAGE` | Mensaje binario (no permitido). |
| `MESSAGE_TOO_LARGE` | Supera `MESSAGE_MAX_BYTES`. |
| `RATE_LIMIT` | Más de `RATE_LIMIT_PER_SEC` mensajes en 1 s. |
| `UNKNOWN_TYPE` | `type` no es uno de los seis listados arriba. |

---

## 10. Rate limit y heartbeat

- **Rate limit**: Por conexión, máximo `RATE_LIMIT_PER_SEC` mensajes por segundo (ventana 1 s). Si se supera, responde `ROOM_ERROR` con código `RATE_LIMIT`.
- **Heartbeat**: El servidor hace `ping` a cada cliente cada 30 s. Si no responde con `pong`, cierra la conexión. No tienes que enviar tú mensajes de ping/pong; el propio WebSocket lo gestiona.

---

## 11. Modelo de sala y peer

- **Sala**: identificada por `roomCode`. Tiene `hostId`, `hostName`, `maxPlayers`, `mode`, `peers` (mapa `playerId → peer`), y un temporizador para borrarla cuando esté vacía durante `ROOM_IDLE_TTL_MS`.
- **Peer**: `id`, `name`, `team`, `joinedAt`, `ws`. El host es el primer jugador que entró (o el siguiente más antiguo si el host se va).

Las salas y peers solo existen en memoria; no hay persistencia. Al reiniciar el servidor se pierde todo.

---

## 12. Despliegue (Cloud Run / Docker)

- El **Dockerfile** del repo compila TypeScript (`src/`) y ejecuta `node dist/server.js`. Si en producción usas ese Dockerfile, el código desplegado es el de `src/`, no el `server.js` de la raíz; el protocolo descrito aquí es el mismo que el de `server.js`.
- **Puerto**: el contenedor debe escuchar en el puerto que indique Cloud Run (normalmente `PORT=8080`).
- **Variables**: configura `HOST=0.0.0.0`, `PORT`, `WS_PATH` y las que necesites (`ALLOWED_ORIGINS`, `MAX_ROOM_PLAYERS`, etc.) en el despliegue.
- **Health**: Cloud Run puede usar `GET /` o `GET /health` para comprobar que la instancia responde.
- **WebSockets**: Cloud Run admite conexiones WebSocket; mantener una sola instancia (o sticky sessions si escalas) evita problemas con estado en memoria.

---

## 13. Ejemplo de flujo mínimo

1. **Conectar** a `ws://host:8080/ws`.
2. **Entrar a sala** (crear si no existe):
   ```json
   { "type": "ROOM_JOIN", "payload": { "roomCode": "ABC1", "create": true, "player": { "name": "Jugador1" }, "settings": { "maxPlayers": 4 } } }
   ```
3. Recibir **`ROOM_JOINED`** con `clientId`, `isHost`, `peers`, etc.
4. **Enviar mensaje a todos**:
   ```json
   { "type": "ROOM_MESSAGE", "payload": { "roomCode": "ABC1", "to": "ALL", "message": { "event": "move", "x": 10 } } }
   ```
5. Los demás reciben **`ROOM_MESSAGE`** con `from` y `message`.
6. **Salir** (opcional):
   ```json
   { "type": "ROOM_LEAVE", "payload": { "roomCode": "ABC1" } }
   ```
   O simplemente cerrar el WebSocket; el servidor detecta el cierre y emite `ROOM_PEER_LEFT` y limpia la sala si queda vacía.

---

## 14. Script de prueba local

En el repo hay un script que comprueba HTTP y WebSocket en local:

```bash
# Terminal 1
node server.js

# Terminal 2
node test-local.mjs
```

`test-local.mjs` hace GET a `/`, `/health`, una ruta inexistente y una conexión WebSocket con `ROOM_JOIN`; si todo va bien, verás "WebSocket JOIN OK" y las respuestas HTTP esperadas.
