# Changelog - Migración a WebSocket Puro

## Resumen

Se ha completado la migración del sistema de red de PeerJS (P2P) a WebSocket puro con servidor centralizado.

## Cambios Principales

### Frontend

1. **Eliminado sistema host-cliente**
   - Ya no hay un jugador que actúa como "host"
   - Todos los jugadores son iguales
   - El servidor es la única autoridad

2. **Simplificado RoleMessageRouter**
   - Eliminadas funciones `sendToHost()` y `broadcast()`
   - Nueva función `sendToServer()` que envía todo al servidor
   - Router simplificado que solo necesita el cliente WebSocket

3. **Eliminadas conexiones P2P**
   - Ya no se usan conexiones directas entre jugadores
   - Todo pasa por el servidor WebSocket
   - `PeerRegistry` se mantiene temporalmente para compatibilidad

4. **Actualizado manejo de mensajes**
   - `handleWsMessage()` simplificado
   - Todos los mensajes vienen del servidor con `meta.peerId`
   - Eliminada lógica de diferenciación host/cliente

5. **Conexión WebSocket**
   - Todos los jugadores envían `JOIN` al conectarse
   - El servidor responde con `PEER_LIST`
   - Eliminada lógica de migración de host

### Backend

Ver `README.md` para la especificación completa.

## Archivos Modificados

### Frontend
- `services/RoleMessageRouter.ts` - Simplificado
- `components/GameContainer.tsx` - Eliminada lógica host-cliente
- `utils/network.ts` - Sin cambios (ya estaba configurado)

### Backend (Nuevo)
- `backend/README.md` - Especificación completa del servidor
- `backend/server-example.ts` - Ejemplo de implementación
- `backend/MIGRATION_NOTES.md` - Notas de migración

## Próximos Pasos

1. **Implementar el backend** según la especificación en `backend/README.md`
2. **Probar la conexión** con el nuevo servidor
3. **Limpiar código obsoleto** (referencias a `currentIsHost` que ya no se usan)
4. **Testing completo** de todas las funcionalidades

## Notas

- El código mantiene compatibilidad temporal con algunas funciones antiguas
- Algunas referencias a `currentIsHost` pueden quedar pero ya no tienen efecto
- `PeerRegistry` se mantiene pero ya no se usa para P2P
- Las conexiones virtuales se mantienen para compatibilidad
