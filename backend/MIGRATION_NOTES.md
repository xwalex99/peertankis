# Notas de Migración - PeerJS a WebSocket Puro

## Cambios Realizados en el Frontend

### 1. Eliminación del Sistema Host-Cliente

**Antes:**
- Un jugador actuaba como "host" (autoridad del juego)
- Los demás jugadores eran "clientes" que enviaban inputs al host
- El host calculaba física, colisiones y sincronizaba estado

**Ahora:**
- El servidor WebSocket es la única autoridad
- Todos los jugadores envían sus acciones al servidor
- El servidor procesa y broadcasta a todos los jugadores

### 2. Simplificación de RoleMessageRouter

**Antes:**
```typescript
createRoleMessageRouter({
  isHostRef: currentIsHostRef,
  hostConnectionRef,
  broadcast
})
```

**Ahora:**
```typescript
createRoleMessageRouter({
  wsClient: wsClientRef.current
})
```

Todos los mensajes van directamente al servidor.

### 3. Eliminación de Funciones P2P

**Eliminadas:**
- `sendToPeer()` - Ya no hay comunicación directa entre jugadores
- `broadcast()` - Reemplazada por `sendToServer()`
- `sendToHost()` - Reemplazada por `sendToServer()`

**Nueva función:**
- `sendToServer()` - Envía todos los mensajes al servidor WebSocket

### 4. Cambios en GameContainer

**Variables eliminadas:**
- `currentIsHost` / `currentIsHostRef`
- `hostConnectionRef`
- `hostMigrating`
- `lastHostSeenRef`

**Funciones simplificadas:**
- `flushStateSync()` - Ya no hace nada (el servidor maneja la sincronización)
- `requestStateSync()` - Ya no hace nada
- `handleWsMessage()` - Simplificado para manejar mensajes del servidor

### 5. Manejo de Mensajes

**Antes:**
- Los mensajes se enrutaban según si eras host o cliente
- El host broadcastaba a los clientes
- Los clientes enviaban al host

**Ahora:**
- Todos los mensajes van al servidor
- El servidor broadcasta a todos los jugadores
- Los mensajes incluyen `meta.peerId` para identificar al emisor

### 6. Conexión WebSocket

**Cambios en la conexión:**
- Ya no se diferencia entre host y cliente al conectar
- Todos envían `JOIN` al conectarse
- El servidor responde con `PEER_LIST`

### 7. Referencias Pendientes

Hay algunas referencias a `currentIsHost` que aún existen en el código pero que ahora siempre serán `false` o se pueden ignorar. Estas se pueden limpiar gradualmente:

- Referencias en lógica de colisiones (ahora el servidor las maneja)
- Referencias en lógica de sincronización (ahora el servidor las maneja)
- Referencias en efectos visuales (pueden mantenerse para efectos locales)

## Cambios Necesarios en el Backend

Ver `README.md` en esta carpeta para la especificación completa del backend.

### Puntos Clave:

1. **Broadcast por defecto**: Casi todos los mensajes se envían a todos los jugadores en la sala
2. **Metadata obligatoria**: Siempre añadir `meta.peerId` al reenviar mensajes
3. **Rate limiting**: Implementar límite de 200 mensajes/segundo por cliente
4. **Validación**: Validar todos los mensajes antes de procesar
5. **Heartbeat**: Implementar PING/PONG correctamente

## Testing

### Casos de Prueba:

1. ✅ Conexión y desconexión
2. ✅ JOIN y PLAYER_JOINED
3. ✅ PLAYER_UPDATE broadcast
4. ✅ FIRE broadcast
5. ⏳ Rate limiting
6. ⏳ Reconexión después de desconexión
7. ⏳ Múltiples salas simultáneas

## Notas Adicionales

- El código mantiene compatibilidad con algunas funciones antiguas para facilitar la transición
- `PeerRegistry` se mantiene temporalmente para compatibilidad pero ya no se usa para P2P
- Las conexiones virtuales (`VirtualConnection`) se mantienen para compatibilidad con código existente pero todo va al servidor
