# Guía de Implementación del Backend

## Resumen

Este backend debe implementar un servidor WebSocket que actúe como autoridad central para el juego TankisBattle. Todos los clientes se conectan al servidor y el servidor reenvía los mensajes a los demás jugadores.

## Estructura Recomendada

```
backend/
├── src/
│   ├── server.ts          # Servidor principal
│   ├── room.ts            # Gestión de salas
│   ├── client.ts         # Gestión de clientes
│   ├── messageHandler.ts  # Manejo de mensajes
│   ├── validators.ts      # Validación de mensajes
│   └── types.ts           # Tipos TypeScript
├── package.json
├── tsconfig.json
└── README.md
```

## Pasos de Implementación

### 1. Configurar Proyecto

```bash
npm init -y
npm install ws
npm install -D typescript @types/node @types/ws tsx
```

### 2. Implementar Servidor Base

Ver `server-example.ts` para un ejemplo completo.

### 3. Desplegar en Cloud Run

1. Crear Dockerfile
2. Configurar Cloud Run para WebSockets
3. Establecer variables de entorno
4. Desplegar

### 4. Testing

Usar el cliente de prueba para validar la implementación.

## Variables de Entorno

```bash
PORT=8080
NODE_ENV=production
LOG_LEVEL=info
MAX_ROOMS=1000
ROOM_TIMEOUT_MS=300000
```

## Endpoints Requeridos

- `GET /health` - Health check
- `WS /ws?roomId=<id>&playerId=<id>` - WebSocket principal

## Notas Importantes

1. El servidor debe manejar reconexiones
2. Implementar rate limiting por cliente
3. Validar todos los mensajes
4. Añadir `meta.peerId` a todos los mensajes reenviados
5. Limpiar salas vacías después de un timeout
