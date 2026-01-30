<<<<<<< HEAD
# Tankis WebSocket Backend

This repo runs the Tankis WebSocket backend that replaces PeerJS/TURN. It keeps room presence and relays game messages. The host still simulates the game (not server-authoritative).

## Run locally

Requires Node 18+ (recommended 20+).
=======
# WebSocket Backend para TankisBattle

Este repositorio contiene el **servidor WebSocket** que actúa como autoridad central para el juego TankisBattle. Todos los clientes se conectan al servidor y el servidor reenvía los mensajes a los demás jugadores.

## 🚀 Características

- ✅ Servidor WebSocket completo (ya no usa PeerJS)
- ✅ Gestión de salas de juego
- ✅ Rate limiting (200 mensajes/segundo por cliente)
- ✅ Heartbeat (PING/PONG) para detectar desconexiones
- ✅ Validación de mensajes
- ✅ Health check endpoint
- ✅ Soporte para múltiples salas simultáneas
- ✅ Limpieza automática de salas vacías

## 📋 Requisitos

- **Node.js 18+** (recomendado 20+)
- **TypeScript 5.0+**

## 🏃 Ejecutar Localmente

### Desarrollo
>>>>>>> aa737854ad604761e08b2bd2bebb052c8d28a753

```bash
# Instalar dependencias
npm install

# Ejecutar en modo desarrollo (con hot reload)
npm run dev
```

### Producción

```bash
# Compilar TypeScript
npm run build

# Ejecutar servidor
npm start
```

<<<<<<< HEAD
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
=======
Por defecto escucha en `ws://localhost:8080/ws`.

## ⚙️ Variables de Entorno

Ver `env.example` para todas las opciones:

- `HOST` (default `0.0.0.0`) - Dirección IP donde escucha el servidor
- `PORT` (default `8080`) - Puerto del servidor
- `WS_PATH` (default `"/ws"`) - Ruta del endpoint WebSocket
- `NODE_ENV` (default `production`) - Entorno de ejecución
- `LOG_LEVEL` (default `info`) - Nivel de logging
- `MAX_ROOMS` (default `1000`) - Máximo de salas simultáneas
- `ROOM_TIMEOUT_MS` (default `300000`) - Tiempo antes de eliminar salas vacías (5 minutos)

## 🔌 Endpoint WebSocket

El servidor expone un endpoint WebSocket en la ruta configurada (por defecto `/ws`):

```
ws(s)://<host>/ws?roomId=<roomId>&playerId=<playerId>
```

### Parámetros de Conexión

- **roomId** (requerido): ID de la sala de juego (formato: `tankblitz-v4-<CODIGO>`)
- **playerId** (requerido): ID único del jugador

### Validación

1. El servidor valida que ambos parámetros estén presentes
2. Valida que el `roomId` tenga el formato correcto (`tankblitz-v4-*`)
3. Si faltan parámetros o el formato es inválido, cierra la conexión inmediatamente
4. Registra el socket en la sala correspondiente
5. Envía confirmación de conexión al cliente

## 📡 Protocolo de Mensajes

Todos los mensajes son JSON con la siguiente estructura:

```typescript
interface GameMessage {
  type: string;
  payload?: any;
  meta?: {
    peerId?: string;  // Añadido por el servidor al reenviar
    timestamp?: number;
  };
}
```

### Tipos de Mensajes Soportados

- **Heartbeat**: `PING`, `PONG`
- **Conexión**: `JOIN`, `REJOIN`, `LEAVE`, `PLAYER_JOINED`, `PLAYER_LEFT`, `PEER_LIST`
- **Gameplay**: `PLAYER_UPDATE`, `FIRE`, `FIRE_BURST`, `LASER_FIRE`
- **Eventos**: `TANK_EXPLODED`, `PLAYER_RESPAWNED`, `POWERUP_COLLECTED`
- **Habilidades**: `ABILITY_USED`, `SPECIAL_ABILITY_USED`
- **Killstreaks**: `KILLSTREAK_USED`, `KILLSTREAK_TRIGGERED`, `KILLSTREAK_EXPLOSION`
- **Sincronización**: `SYNC_STATE`
- **Chat**: `CHAT_MESSAGE`
- **Tanques**: `QUEUE_TANK_CHANGE`, `TANK_CHANGE`
- **Efectos**: `FLOATING_TEXT`, `HIT_SPARKS`

Ver `backend/README.md` para la documentación completa del protocolo.

## 🏗️ Arquitectura

### Gestión de Salas

El servidor mantiene un registro de salas activas:

```typescript
interface Room {
  roomId: string;
  clients: Set<WebSocket>;           // Todos los sockets conectados
  clientsById: Map<string, WebSocket>; // Mapa playerId -> socket
  gameState?: GameState;              // Estado del juego (opcional)
  createdAt: number;
  lastActivity: number;
}
```

### Reglas de Routing

- **Broadcast por defecto**: Todos los mensajes de gameplay se broadcastan a todos los jugadores en la sala
- **Metadata obligatoria**: El servidor siempre añade `meta.peerId` a los mensajes reenviados
- **Excepciones**: `PING/PONG` no se reenvían, `PEER_LIST` solo se envía al nuevo jugador

## 🛡️ Seguridad

- **Rate Limiting**: Máximo 200 mensajes por segundo por cliente
- **Validación**: Todos los mensajes se validan antes de procesar
- **Heartbeat**: Timeout de 10 segundos sin PING = desconexión
- **Limpieza**: Salas vacías se eliminan después de 5 minutos

## 🏥 Health Check

El servidor expone un endpoint HTTP para health checks:

```
GET /health
```

Respuesta:
```json
{
  "status": "ok",
  "rooms": 42,
  "clients": 156,
  "uptime": 3600
}
```

## 🐳 Despliegue

### Docker

```bash
docker build -t tankisbattle-backend .
docker run -p 8080:8080 tankisbattle-backend
```

### Google Cloud Run

El proyecto incluye configuración para Cloud Run:

- `Dockerfile` - Imagen Docker optimizada
- `cloudbuild.yaml` - Configuración de Cloud Build
- `app.yaml` - Configuración de App Engine (opcional)

**Importante**: WebSocket requiere conexiones persistentes. Cloud Run funciona bien si mantienes 1 instancia:

- **min_num_instances**: `1`
- **max_num_instances**: `1`
- **timeout**: Alto (ej: `3600s`) para WebSockets

Ver `docs/cloud-run.md` para más detalles.

## 📁 Estructura del Proyecto

```
.
├── src/
│   ├── server.ts          # Servidor principal
│   ├── room.ts            # Gestión de salas
│   ├── client.ts          # Gestión de clientes
│   ├── messageHandler.ts  # Manejo de mensajes
│   ├── validators.ts      # Validación de mensajes
│   └── types.ts           # Tipos TypeScript
├── backend/              # Documentación y ejemplos
├── docs/                  # Documentación adicional
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

## 📚 Documentación Adicional

- `backend/README.md` - Especificación completa del protocolo
- `backend/README_IMPLEMENTACION.md` - Guía de implementación
- `backend/MIGRATION_NOTES.md` - Notas de migración desde PeerJS
- `backend/server-example.ts` - Ejemplo de implementación

## 🔄 Migración desde PeerJS

Este proyecto fue migrado desde PeerJS a WebSocket puro. Ver `backend/MIGRATION_NOTES.md` para detalles sobre los cambios.

## 📝 Notas Importantes

1. **No hay concepto de "host"**: Todos los jugadores son iguales, el servidor es la autoridad
2. **Broadcast por defecto**: Casi todos los mensajes se envían a todos los jugadores
3. **Metadata obligatoria**: Siempre añadir `meta.peerId` al reenviar
4. **Heartbeat crítico**: Implementar PING/PONG correctamente para detectar desconexiones
5. **Rate limiting**: Esencial para prevenir abusos
6. **Validación**: Validar todos los mensajes antes de procesar

## 🐛 Troubleshooting

### El servidor no inicia

- Verifica que el puerto no esté en uso
- Verifica las variables de entorno
- Revisa los logs para errores

### Los clientes no se conectan

- Verifica que la URL del WebSocket sea correcta
- Verifica que `roomId` tenga el formato `tankblitz-v4-*`
- Revisa los logs del servidor para ver errores de conexión

### Mensajes no se reenvían

- Verifica que los mensajes tengan el formato correcto
- Verifica que el `type` esté en la lista de tipos permitidos
- Revisa los logs para ver si hay errores de validación

## 📄 Licencia

Este proyecto es privado.
>>>>>>> aa737854ad604761e08b2bd2bebb052c8d28a753
