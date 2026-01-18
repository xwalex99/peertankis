# Backend WebSocket Server - TankisBattle

## URL de Producción

```
wss://peertankis-1093381928939.europe-southwest1.run.app/ws
```

## Endpoint WebSocket

El servidor debe exponer un endpoint WebSocket en la ruta `/ws`:

```
wss://<host>/ws?roomId=<roomId>&playerId=<playerId>
```

### Parámetros de Conexión

- **roomId** (requerido): ID de la sala de juego (formato: `tankblitz-v4-<CODIGO>`)
- **playerId** (requerido): ID único del jugador

### Validación de Conexión

1. El servidor debe validar que ambos parámetros estén presentes
2. Si faltan parámetros, cerrar la conexión inmediatamente
3. Registrar el socket en la sala correspondiente
4. Enviar confirmación de conexión al cliente

## Arquitectura del Servidor

### Gestión de Salas

El servidor debe mantener un registro de salas activas:

```typescript
interface Room {
  roomId: string;
  clients: Set<WebSocket>;           // Todos los sockets conectados
  clientsById: Map<string, WebSocket>; // Mapa playerId -> socket
  gameState?: GameState;              // Estado del juego (opcional, para persistencia)
  createdAt: number;
  lastActivity: number;
}
```

### Gestión de Clientes

Cada socket debe tener asociado:
- `playerId`: ID del jugador
- `roomId`: ID de la sala
- `connectedAt`: Timestamp de conexión
- `lastPing`: Último ping recibido

## Protocolo de Mensajes

Todos los mensajes son JSON con la siguiente estructura base:

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

### Heartbeat

#### PING (Cliente → Servidor)
```json
{
  "type": "PING",
  "timestamp": 1234567890
}
```

**Respuesta del servidor:**
```json
{
  "type": "PONG",
  "timestamp": 1234567890
}
```

**Frecuencia:** Cada 3 segundos
**Timeout:** Si no se recibe PING en 10 segundos, cerrar conexión

### Conexión y Desconexión

#### JOIN (Cliente → Servidor)
Cuando un jugador se une a una sala:

```json
{
  "type": "JOIN",
  "payload": {
    "id": "player-123",
    "name": "Jugador1",
    "tankClass": "STRIKER",
    "team": "NONE",
    "color": "#4a9db8"
  }
}
```

**Acciones del servidor:**
1. Registrar el jugador en la sala
2. Broadcast a todos los demás jugadores en la sala:
```json
{
  "type": "PLAYER_JOINED",
  "payload": {
    "id": "player-123",
    "name": "Jugador1",
    "tankClass": "STRIKER",
    "team": "NONE",
    "color": "#4a9db8",
    "joinedAt": 1234567890
  },
  "meta": {
    "peerId": "player-123"
  }
}
```
3. Enviar al nuevo jugador la lista de jugadores existentes:
```json
{
  "type": "PEER_LIST",
  "payload": {
    "peers": [
      { "id": "player-456", "joinedAt": 1234567800 },
      { "id": "player-789", "joinedAt": 1234567850 }
    ]
  }
}
```

#### REJOIN (Cliente → Servidor)
Similar a JOIN, pero para reconexión:

```json
{
  "type": "REJOIN",
  "payload": {
    "id": "player-123",
    "name": "Jugador1",
    "tankClass": "STRIKER",
    "team": "NONE"
  }
}
```

#### LEAVE (Cliente → Servidor)
Cuando un jugador abandona la sala:

```json
{
  "type": "LEAVE",
  "payload": {
    "playerId": "player-123"
  }
}
```

**Acciones del servidor:**
1. Remover el socket de la sala
2. Broadcast a todos los demás jugadores:
```json
{
  "type": "PLAYER_LEFT",
  "payload": {
    "playerId": "player-123"
  },
  "meta": {
    "peerId": "player-123"
  }
}
```

### Gameplay - Actualizaciones de Jugador

#### PLAYER_UPDATE (Cliente → Servidor)
Actualización de posición, estado, etc. del jugador:

```json
{
  "type": "PLAYER_UPDATE",
  "payload": {
    "id": "player-123",
    "pos": { "x": 100, "y": 200 },
    "angle": 1.57,
    "turretAngle": 1.6,
    "health": 100,
    "ammo": 5,
    "velocity": { "x": 0, "y": 0 }
  }
}
```

**Acciones del servidor:**
- **Broadcast a todos los demás jugadores** en la sala (excluyendo al emisor)
- Añadir `meta.peerId` con el ID del emisor

**Frecuencia:** Alta (múltiples veces por segundo)

### Gameplay - Disparos

#### FIRE (Cliente → Servidor)
Un jugador dispara un proyectil:

```json
{
  "type": "FIRE",
  "payload": {
    "id": "bullet-123",
    "playerId": "player-123",
    "pos": { "x": 100, "y": 200 },
    "velocity": { "x": 5, "y": 3 },
    "angle": 1.57,
    "damage": 30,
    "radius": 5,
    "lifespan": 60,
    "createdAt": 1234567890
  }
}
```

**Acciones del servidor:**
- **Broadcast a todos los jugadores** en la sala (incluyendo al emisor para confirmación)
- Añadir `meta.peerId`

#### FIRE_BURST (Cliente → Servidor)
Disparo múltiple (ej: Scout con 3 balas):

```json
{
  "type": "FIRE_BURST",
  "payload": {
    "bullets": [
      { /* bullet 1 */ },
      { /* bullet 2 */ },
      { /* bullet 3 */ }
    ],
    "timestamp": 1234567890
  }
}
```

**Acciones del servidor:**
- **Broadcast a todos los jugadores** en la sala
- Añadir `meta.peerId`

#### LASER_FIRE (Cliente → Servidor)
Disparo de láser (Tech Tank):

```json
{
  "type": "LASER_FIRE",
  "payload": {
    "id": "laser-123",
    "playerId": "player-123",
    "start": { "x": 100, "y": 200 },
    "end": { "x": 500, "y": 600 },
    "damage": 28,
    "width": 3,
    "createdAt": 1234567890
  }
}
```

**Acciones del servidor:**
- **Broadcast a todos los jugadores** en la sala
- Añadir `meta.peerId`

### Gameplay - Eventos

#### TANK_EXPLODED (Cliente → Servidor)
Un tanque explota:

```json
{
  "type": "TANK_EXPLODED",
  "payload": {
    "playerId": "player-123",
    "killerId": "player-456",
    "pos": { "x": 100, "y": 200 },
    "timestamp": 1234567890
  }
}
```

**Acciones del servidor:**
- **Broadcast a todos los jugadores** en la sala
- Añadir `meta.peerId`

#### PLAYER_RESPAWNED (Cliente → Servidor)
Un jugador reaparece:

```json
{
  "type": "PLAYER_RESPAWNED",
  "payload": {
    "playerId": "player-123",
    "pos": { "x": 150, "y": 250 },
    "health": 120,
    "timestamp": 1234567890
  }
}
```

**Acciones del servidor:**
- **Broadcast a todos los jugadores** en la sala
- Añadir `meta.peerId`

#### POWERUP_COLLECTED (Cliente → Servidor)
Un jugador recoge un power-up:

```json
{
  "type": "POWERUP_COLLECTED",
  "payload": {
    "playerId": "player-123",
    "powerupId": "powerup-456",
    "type": "HEALTH",
    "pos": { "x": 100, "y": 200 }
  }
}
```

**Acciones del servidor:**
- **Broadcast a todos los jugadores** en la sala
- Añadir `meta.peerId`

### Gameplay - Habilidades

#### ABILITY_USED (Cliente → Servidor)
Uso de habilidad básica:

```json
{
  "type": "ABILITY_USED",
  "payload": {
    "playerId": "player-123",
    "abilityType": "RAPID FIRE",
    "timestamp": 1234567890
  }
}
```

**Acciones del servidor:**
- **Broadcast a todos los jugadores** en la sala
- Añadir `meta.peerId`

#### SPECIAL_ABILITY_USED (Cliente → Servidor)
Uso de habilidad especial:

```json
{
  "type": "SPECIAL_ABILITY_USED",
  "payload": {
    "playerId": "player-123",
    "abilityType": "ULTRA SHOT",
    "timestamp": 1234567890
  }
}
```

**Acciones del servidor:**
- **Broadcast a todos los jugadores** en la sala
- Añadir `meta.peerId`

### Gameplay - Killstreaks

#### KILLSTREAK_USED (Cliente → Servidor)
Activación de killstreak:

```json
{
  "type": "KILLSTREAK_USED",
  "payload": {
    "playerId": "player-123",
    "killstreakId": "AIRSTRIKE",
    "targetPos": { "x": 100, "y": 200 },
    "timestamp": 1234567890
  }
}
```

**Acciones del servidor:**
- **Broadcast a todos los jugadores** en la sala
- Añadir `meta.peerId`

#### KILLSTREAK_TRIGGERED (Servidor → Clientes)
El servidor puede generar eventos de killstreak:

```json
{
  "type": "KILLSTREAK_TRIGGERED",
  "payload": {
    "killstreakId": "AIRSTRIKE",
    "targetPos": { "x": 100, "y": 200 },
    "playerId": "player-123"
  },
  "meta": {
    "peerId": "player-123"
  }
}
```

#### KILLSTREAK_EXPLOSION (Servidor → Clientes)
Explosión de killstreak:

```json
{
  "type": "KILLSTREAK_EXPLOSION",
  "payload": {
    "pos": { "x": 100, "y": 200 },
    "radius": 50,
    "damage": 100,
    "killstreakId": "AIRSTRIKE"
  }
}
```

### Sincronización de Estado

#### SYNC_STATE (Cliente → Servidor)
Sincronización completa del estado del juego:

```json
{
  "type": "SYNC_STATE",
  "payload": {
    "players": { /* objeto de jugadores */ },
    "bullets": [ /* array de balas */ ],
    "lasers": [ /* array de láseres */ ],
    "turrets": [ /* array de torretas */ ],
    "powerups": [ /* array de powerups */ ],
    "obstacles": [ /* array de obstáculos */ ],
    "zoneRadius": 500,
    "teamScores": { "RED": 5, "BLUE": 3 },
    "timestamp": 1234567890,
    "full": true
  }
}
```

**Acciones del servidor:**
- **Broadcast a todos los demás jugadores** en la sala
- Añadir `meta.peerId`

**Nota:** Este mensaje es pesado, debe usarse con moderación (solo cuando sea necesario)

### Chat y Comunicación

#### CHAT_MESSAGE (Cliente → Servidor)
Mensaje de chat:

```json
{
  "type": "CHAT_MESSAGE",
  "payload": {
    "playerId": "player-123",
    "message": "¡Hola equipo!",
    "timestamp": 1234567890
  }
}
```

**Acciones del servidor:**
- **Broadcast a todos los jugadores** en la sala
- Añadir `meta.peerId`

### Cambio de Tanque

#### QUEUE_TANK_CHANGE (Cliente → Servidor)
Solicitud de cambio de tanque:

```json
{
  "type": "QUEUE_TANK_CHANGE",
  "payload": {
    "playerId": "player-123",
    "newTankClass": "TITAN"
  }
}
```

**Acciones del servidor:**
- **Broadcast a todos los jugadores** en la sala
- Añadir `meta.peerId`

#### TANK_CHANGE (Servidor → Clientes)
Confirmación de cambio de tanque:

```json
{
  "type": "TANK_CHANGE",
  "payload": {
    "playerId": "player-123",
    "newTankClass": "TITAN"
  },
  "meta": {
    "peerId": "player-123"
  }
}
```

### Efectos Visuales

#### FLOATING_TEXT (Cliente → Servidor)
Texto flotante (daño, kills, etc.):

```json
{
  "type": "FLOATING_TEXT",
  "payload": {
    "text": "+30",
    "pos": { "x": 100, "y": 200 },
    "color": "#ef4444",
    "duration": 1000
  }
}
```

**Acciones del servidor:**
- **Broadcast a todos los jugadores** en la sala
- Añadir `meta.peerId`

#### HIT_SPARKS (Cliente → Servidor)
Efectos de impacto:

```json
{
  "type": "HIT_SPARKS",
  "payload": {
    "pos": { "x": 100, "y": 200 },
    "angle": 1.57,
    "color": "#ffaa00"
  }
}
```

**Acciones del servidor:**
- **Broadcast a todos los jugadores** en la sala
- Añadir `meta.peerId`

## Reglas de Routing

### Broadcast por Defecto

**Todos los mensajes de gameplay se broadcastan a todos los jugadores en la sala**, excepto:
- El emisor (si el mensaje no requiere confirmación)
- Jugadores desconectados

### Añadir Metadata

El servidor **SIEMPRE** debe añadir `meta.peerId` a los mensajes reenviados:

```typescript
const envelope = {
  ...message,
  meta: {
    peerId: senderPlayerId,
    timestamp: Date.now()
  }
};
```

### Excepciones

- **PING/PONG**: No se reenvían, son solo entre cliente y servidor
- **PEER_LIST**: Solo se envía al nuevo jugador que se conecta

## Manejo de Errores

### Conexión Cerrada Inesperadamente

Si un socket se cierra sin enviar `LEAVE`:
1. Detectar la desconexión
2. Broadcast `PLAYER_LEFT` a los demás jugadores
3. Limpiar el socket de la sala
4. Si la sala queda vacía, eliminarla después de un timeout (ej: 5 minutos)

### Mensajes Inválidos

Si un mensaje no es válido:
1. Registrar el error
2. Ignorar el mensaje (no reenviar)
3. Opcionalmente enviar un mensaje de error al cliente

### Rate Limiting

El servidor debe implementar rate limiting para prevenir spam:
- **Máximo 200 mensajes por segundo por cliente**
- Si se excede, bloquear mensajes por 4 segundos
- Registrar intentos de spam para análisis

## Validación de Mensajes

### Tipos de Mensajes Válidos

```typescript
const ALLOWED_MESSAGE_TYPES = [
  'PING',
  'PONG',
  'SYNC_STATE',
  'TANK_EXPLODED',
  'FIRE',
  'FIRE_BURST',
  'ABILITY_USED',
  'POWERUP_COLLECTED',
  'PLAYER_RESPAWNED',
  'JOIN',
  'REJOIN',
  'SPECIAL_ABILITY_USED',
  'KILLSTREAK_USED',
  'KILLSTREAK_TRIGGERED',
  'KILLSTREAK_EXPLOSION',
  'PLAYER_JOINED',
  'LASER_FIRE',
  'FLOATING_TEXT',
  'HIT_SPARKS',
  'PLAYER_UPDATE',
  'LEAVE',
  'PLAYER_LEFT',
  'CHAT_MESSAGE',
  'QUEUE_TANK_CHANGE',
  'TANK_CHANGE'
];
```

### Validación de Payload

El servidor debe validar:
- Que `type` esté en la lista de tipos permitidos
- Que `payload` tenga la estructura esperada (según el tipo)
- Que los IDs de jugadores existan en la sala
- Que los datos numéricos estén en rangos válidos

## Implementación Recomendada

### Estructura de Proyecto

```
backend/
├── src/
│   ├── server.ts          # Servidor principal
│   ├── room.ts            # Gestión de salas
│   ├── client.ts          # Gestión de clientes
│   ├── messageHandler.ts  # Manejo de mensajes
│   ├── validators.ts       # Validación de mensajes
│   └── types.ts           # Tipos TypeScript
├── package.json
└── README.md
```

### Dependencias Sugeridas

```json
{
  "dependencies": {
    "ws": "^8.14.0",
    "express": "^4.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

### Ejemplo de Implementación Mínima

Ver `server-example.ts` para un ejemplo completo de implementación.

## Despliegue

### Cloud Run (Google Cloud)

El servidor debe estar configurado para:
- Escuchar en el puerto definido por `PORT` (default: 8080)
- Aceptar conexiones WebSocket en la ruta `/ws`
- Manejar múltiples conexiones concurrentes
- Escalar automáticamente según la carga

### Variables de Entorno

```bash
PORT=8080
NODE_ENV=production
LOG_LEVEL=info
MAX_ROOMS=1000
ROOM_TIMEOUT_MS=300000  # 5 minutos
```

### Health Check

El servidor debe exponer un endpoint HTTP para health checks:

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

## Testing

### Cliente de Prueba

Ver `client-test.ts` para un cliente de prueba que valida el protocolo.

### Casos de Prueba

1. Conexión y desconexión
2. JOIN y PLAYER_JOINED
3. PLAYER_UPDATE broadcast
4. FIRE broadcast
5. Rate limiting
6. Reconexión después de desconexión
7. Múltiples salas simultáneas

## Notas Importantes

1. **No hay concepto de "host"**: Todos los jugadores son iguales, el servidor es la autoridad
2. **Broadcast por defecto**: Casi todos los mensajes se envían a todos los jugadores
3. **Metadata obligatoria**: Siempre añadir `meta.peerId` al reenviar
4. **Heartbeat crítico**: Implementar PING/PONG correctamente para detectar desconexiones
5. **Rate limiting**: Esencial para prevenir abusos
6. **Validación**: Validar todos los mensajes antes de procesar
