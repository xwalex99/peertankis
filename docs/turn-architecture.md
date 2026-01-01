# Arquitectura: ¿Quién se comunica con TURN?

Esta es una pregunta importante para entender cómo funciona WebRTC y TURN.

---

## Respuesta Corta

**El FRONTEND (cliente/navegador) se comunica directamente con TURN**, NO PeerJS.

PeerJS solo hace **señalización** (intercambio de mensajes de control), pero las conexiones de datos WebRTC (incluyendo TURN) son **directas entre los clientes y el servidor TURN**.

---

## Arquitectura Completa

```
┌─────────────┐                    ┌─────────────┐
│  Cliente A  │                    │  Cliente B  │
│  (Frontend) │                    │  (Frontend) │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │ 1. Señalización (SDP/ICE)       │
       │    vía PeerJS                   │
       ├─────────────────────────────────┤
       │                                  │
       │                                  │
       │ 2. Conexión WebRTC              │
       │    (directa o vía TURN)         │
       │                                  │
       │                                  │
       │                                  │
       ▼                                  ▼
┌─────────────────────────────────────────────┐
│         PeerJS Server (Cloud Run)           │
│  - Solo señalización                        │
│  - Intercambia SDP/ICE candidates          │
│  - NO maneja datos de audio/video           │
└─────────────────────────────────────────────┘

       │                                  │
       │ 3. Si hay NAT estricto,          │
       │    los clientes usan TURN        │
       │                                  │
       ▼                                  ▼
┌─────────────────────────────────────────────┐
│         TURN Server (GCE/VPS)               │
│  - Relaya datos de audio/video              │
│  - Los clientes se conectan DIRECTAMENTE    │
│  - NO pasa por PeerJS                       │
└─────────────────────────────────────────────┘
```

---

## Flujo Detallado

### Paso 1: Señalización (PeerJS)

```
Cliente A ──SDP Offer──> PeerJS ──SDP Offer──> Cliente B
Cliente A <──SDP Answer── PeerJS <──SDP Answer── Cliente B
Cliente A ──ICE Candidates──> PeerJS ──ICE Candidates──> Cliente B
```

**PeerJS solo intercambia mensajes de control**:
- SDP (Session Description Protocol)
- ICE candidates (direcciones IP/puertos posibles)

**PeerJS NO ve los datos**:
- ❌ No ve audio
- ❌ No ve video
- ❌ No ve datos del juego
- ✅ Solo ve mensajes de control

### Paso 2: Conexión WebRTC (Directa o vía TURN)

Una vez que los clientes intercambiaron SDP/ICE, intentan conectarse:

#### Escenario A: Conexión Directa (P2P)

```
Cliente A ────────────────> Cliente B
         (directo, sin TURN)
```

- Funciona si ambos están en la misma red
- O si los NATs permiten conexión directa

#### Escenario B: Conexión vía TURN (Relay)

```
Cliente A ──> TURN Server ──> Cliente B
         (relay, cuando P2P falla)
```

- **Los clientes se conectan DIRECTAMENTE al TURN**
- **NO pasa por PeerJS**
- TURN solo relaya los datos

---

## ¿Por qué es importante entender esto?

### 1. Configuración del Frontend

**El frontend DEBE tener la configuración de TURN** porque es el que se conecta directamente:

```typescript
// Esto va en el FRONTEND, no en PeerJS
const peer = new Peer(peerId, {
  host: 'peertankis-...',
  path: '/peerjs',
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      {
        urls: 'turn:TU_TURN_SERVER:3478', // ← Frontend se conecta aquí
        username: 'tankis-turn',
        credential: 'tankis-turn-secret',
      },
    ],
  },
});
```

### 2. PeerJS NO necesita saber de TURN

PeerJS solo necesita:
- Escuchar en un puerto
- Intercambiar mensajes SDP/ICE
- No necesita configuración de TURN

### 3. El TURN Server debe ser accesible desde Internet

Como los clientes se conectan directamente:
- ✅ El TURN debe tener IP pública
- ✅ Los puertos deben estar abiertos (3478 UDP/TCP, 49152-65535)
- ✅ El firewall debe permitir conexiones entrantes

---

## Comparación: Señalización vs Datos

| Aspecto | PeerJS (Señalización) | TURN (Datos) |
|---------|----------------------|--------------|
| **Quién se conecta** | Frontend → PeerJS | Frontend → TURN |
| **Qué transporta** | Mensajes de control (SDP/ICE) | Datos reales (audio/video/juego) |
| **Protocolo** | WebSocket (HTTP/HTTPS) | UDP/TCP (WebRTC) |
| **Puerto** | 8080 (Cloud Run) | 3478 (TURN) |
| **Dónde se configura** | Backend (server.js) | Frontend (iceServers) |
| **Necesita IP pública** | Sí (para señalización) | Sí (para relay) |
| **Volumen de datos** | Bajo (solo control) | Alto (audio/video) |

---

## Ejemplo Práctico

### Configuración del Backend (PeerJS)

```javascript
// server.js - Solo señalización
PeerServer({
  host: '0.0.0.0',
  port: 8080,
  path: '/peerjs',
  key: 'tankis-peer',
});
```

**No necesita saber nada de TURN.**

### Configuración del Frontend

```typescript
// frontend - Necesita TURN para conexiones
const peer = new Peer(peerId, {
  // Señalización vía PeerJS
  host: 'peertankis-1093381928939.europe-southwest1.run.app',
  port: 443,
  path: '/peerjs',
  secure: true,
  key: 'tankis-peer',
  
  // TURN para datos (directo desde el navegador)
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      {
        urls: 'turn:TU_VPS_IP:3478', // ← Navegador se conecta aquí
        username: 'tankis-turn',
        credential: 'tankis-turn-secret',
      },
    ],
  },
});
```

---

## Preguntas Frecuentes

### ¿PeerJS puede estar en Cloud Run y TURN en otro lugar?

**Sí, absolutamente.** De hecho, es la arquitectura recomendada:

```
PeerJS (Cloud Run) ──> Señalización
TURN (VPS/GCE) ────> Relay de datos
```

Los clientes:
1. Se conectan a PeerJS para señalización
2. Se conectan directamente a TURN para datos

### ¿Por qué TURN no puede estar en Cloud Run?

Cloud Run no soporta UDP bien, que es esencial para TURN. Pero PeerJS solo usa WebSocket (TCP), así que funciona perfectamente en Cloud Run.

### ¿El frontend necesita conocer ambos?

**Sí**, el frontend necesita:
- La URL de PeerJS (para señalización)
- La URL de TURN (para relay de datos)

### ¿Puedo usar diferentes TURN servers para diferentes clientes?

**Sí**, puedes configurar múltiples servidores TURN en `iceServers`:

```typescript
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'turn:turn1.example.com:3478', username: '...', credential: '...' },
  { urls: 'turn:turn2.example.com:3478', username: '...', credential: '...' },
]
```

El navegador intentará usar el primero disponible.

---

## Resumen

1. **PeerJS** = Señalización (mensajes de control)
   - Frontend → PeerJS (WebSocket)
   - Solo intercambia SDP/ICE

2. **TURN** = Relay de datos (audio/video/juego)
   - Frontend → TURN (directo, UDP/TCP)
   - NO pasa por PeerJS

3. **Frontend** necesita configurar ambos:
   - URL de PeerJS (para señalización)
   - URL de TURN en `iceServers` (para datos)

4. **Backend (PeerJS)** NO necesita saber nada de TURN

---

## Referencias

- **Configuración del Frontend**: `docs/frontend-turn-setup.md`
- **Configuración de TURN**: `docs/turn-configuration.md`
- **Opciones de TURN**: `docs/turn-options-comparison.md`

