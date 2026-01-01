# Configuración del Frontend para usar TURN Server

Este documento explica cómo configurar el frontend de Tankis para usar el servidor TURN desplegado.

## ⚠️ Importante: ¿Quién se comunica con TURN?

**El FRONTEND (navegador/cliente) se comunica DIRECTAMENTE con TURN**, NO PeerJS.

- **PeerJS** solo hace señalización (intercambia mensajes de control SDP/ICE)
- **TURN** relaya los datos reales (audio/video/juego)
- **El navegador** se conecta directamente al TURN para los datos

Por eso **DEBES configurar TURN en el frontend**, no en PeerJS.

Ver `docs/turn-architecture.md` para más detalles sobre la arquitectura.

## ⚠️ Problema Actual

Si los jugadores solo pueden conectarse cuando están en la misma red WiFi, significa que:
1. El frontend no está configurado para usar el servidor TURN, O
2. El servidor TURN no está funcionando correctamente (posible problema con Cloud Run y UDP)

## Configuración del Frontend

### Paso 1: Localizar el archivo de configuración de red

Busca el archivo donde se configura PeerJS en tu frontend. Probablemente esté en:
- `utils/network.ts`
- `src/utils/network.ts`
- `lib/network.ts`
- O cualquier archivo donde configures las opciones de PeerJS

### Paso 2: Configurar TURN en PeerJS

En el archivo donde configuras PeerJS, necesitas agregar la configuración de TURN. Aquí hay un ejemplo completo:

```typescript
import Peer from 'peerjs';

// Configuración del servidor TURN
const TURN_CONFIG = {
  host: 'peertankis-1093381928939.europe-southwest1.run.app',
  port: 3478,
  username: 'tankis-turn',
  credential: 'tankis-turn-secret',
};

// Configuración de PeerJS con TURN
const peerOptions = {
  host: 'peertankis-1093381928939.europe-southwest1.run.app',
  port: 443, // Cloud Run usa HTTPS en puerto 443
  path: '/peerjs',
  secure: true, // IMPORTANTE: usar WSS en producción
  key: 'tankis-peer',
  config: {
    iceServers: [
      // STUN server (gratis, para descubrir IP pública)
      {
        urls: 'stun:stun.l.google.com:19302'
      },
      // Tu servidor TURN (CRÍTICO para conexiones entre diferentes redes)
      {
        urls: `turn:${TURN_CONFIG.host}:${TURN_CONFIG.port}`,
        username: TURN_CONFIG.username,
        credential: TURN_CONFIG.credential,
      },
      // También puedes agregar el TURN con TCP (por si UDP no funciona)
      {
        urls: `turn:${TURN_CONFIG.host}:${TURN_CONFIG.port}?transport=tcp`,
        username: TURN_CONFIG.username,
        credential: TURN_CONFIG.credential,
      },
    ],
    iceCandidatePoolSize: 10, // Pre-generar candidatos ICE
  },
};

// Crear el peer
const peer = new Peer(peerId, peerOptions);
```

### Paso 3: Ejemplo completo con manejo de errores

```typescript
import Peer from 'peerjs';

function createPeer(peerId: string): Peer {
  const turnHost = 'peertankis-1093381928939.europe-southwest1.run.app';
  const turnPort = 3478;
  const turnUser = 'tankis-turn';
  const turnPass = 'tankis-turn-secret';

  const peer = new Peer(peerId, {
    host: turnHost,
    port: 443,
    path: '/peerjs',
    secure: true,
    key: 'tankis-peer',
    config: {
      iceServers: [
        // STUN (descubrimiento de IP)
        { urls: 'stun:stun.l.google.com:19302' },
        // TURN UDP
        {
          urls: `turn:${turnHost}:${turnPort}`,
          username: turnUser,
          credential: turnPass,
        },
        // TURN TCP (fallback si UDP no funciona)
        {
          urls: `turn:${turnHost}:${turnPort}?transport=tcp`,
          username: turnUser,
          credential: turnPass,
        },
      ],
      iceCandidatePoolSize: 10,
    },
  });

  // Logs para debugging
  peer.on('error', (err) => {
    console.error('PeerJS error:', err);
  });

  peer.on('connection', (conn) => {
    console.log('Nueva conexión establecida');
  });

  return peer;
}
```

## Verificación

### 1. Verificar en el navegador

Abre las herramientas de desarrollador (F12) y ve a la consola. Deberías ver:
- Conexiones WebRTC establecidas
- Si hay errores relacionados con TURN, aparecerán aquí

### 2. Verificar candidatos ICE

En las herramientas de desarrollador, puedes ver los candidatos ICE que se están usando:

```javascript
// En la consola del navegador
peer.on('iceConnectionStateChange', (state) => {
  console.log('ICE Connection State:', state);
});
```

Si ves `relay` en los candidatos, significa que TURN está funcionando.

### 3. Test con herramienta online

1. Ve a: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
2. Haz clic en "Add Server"
3. Ingresa:
   - **Server URL**: `turn:peertankis-1093381928939.europe-southwest1.run.app:3478`
   - **Username**: `tankis-turn`
   - **Password**: `tankis-turn-secret`
4. Haz clic en "Add" y luego "Gather candidates"
5. Deberías ver candidatos tipo `relay` si TURN está funcionando

## Problemas Comunes

### Problema: Solo funciona en la misma red

**Causa**: El frontend no está usando TURN o TURN no está funcionando.

**Solución**:
1. Verifica que la configuración de `iceServers` incluya tu servidor TURN
2. Verifica que las credenciales coincidan con las del servidor
3. Verifica que el dominio del TURN sea correcto

### Problema: Cloud Run y UDP

**Causa**: Cloud Run tiene limitaciones con UDP, que TURN necesita.

**Solución temporal**: Usa TCP en lugar de UDP:
```typescript
{
  urls: `turn:${turnHost}:${turnPort}?transport=tcp`,
  username: turnUser,
  credential: turnPass,
}
```

**Solución permanente**: Despliega en un VPS o Google Compute Engine en lugar de Cloud Run.

### Problema: Errores de autenticación TURN

**Causa**: Las credenciales no coinciden.

**Solución**: Verifica que:
- `TURN_USER` en el servidor = `username` en el frontend
- `TURN_PASSWORD` en el servidor = `credential` en el frontend
- `TURN_REALM` en el servidor = dominio del servidor

## Configuración Recomendada para Producción

```typescript
const iceServers = [
  // STUN público de Google (siempre funciona)
  { urls: 'stun:stun.l.google.com:19302' },
  
  // Tu servidor TURN (UDP)
  {
    urls: `turn:peertankis-1093381928939.europe-southwest1.run.app:3478`,
    username: 'tankis-turn',
    credential: 'tankis-turn-secret',
  },
  
  // Tu servidor TURN (TCP - fallback)
  {
    urls: `turn:peertankis-1093381928939.europe-southwest1.run.app:3478?transport=tcp`,
    username: 'tankis-turn',
    credential: 'tankis-turn-secret',
  },
  
  // Servicio TURN público como fallback (opcional)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];
```

## Notas Importantes

1. **HTTPS/WSS es obligatorio**: En producción, el navegador requiere conexiones seguras. Asegúrate de usar `secure: true` y puerto 443.

2. **Orden de los servidores ICE**: El navegador intentará usar los servidores en orden. Pon TURN después de STUN.

3. **Pool de candidatos**: `iceCandidatePoolSize: 10` ayuda a pre-generar candidatos y acelera la conexión.

4. **Cloud Run y UDP**: Si estás usando Cloud Run, considera desplegar TURN en un VPS separado o usar un servicio TURN público como fallback.

## Próximos Pasos

1. Actualiza el frontend con la configuración de TURN
2. Prueba la conexión entre dos dispositivos en diferentes redes WiFi
3. Si sigue sin funcionar, verifica los logs del servidor TURN
4. Considera desplegar TURN en un VPS si Cloud Run no funciona bien

