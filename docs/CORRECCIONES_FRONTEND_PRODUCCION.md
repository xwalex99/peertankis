# Correcciones para el frontend (tankisbattle.app) en producción

Documento de referencia: qué se corrigió en el backend para que el frontend en **tankisbattle.app** funcione correctamente con el backend en producción.

**Backend en producción:** `wss://peertankis-1093381928939.europe-southwest1.run.app/ws`

---

## 1. Problema que había

- **HTTP:** `GET /` y `GET /health` respondían bien (200).
- **WebSocket:** la conexión se abría.
- **Mensajes:** al enviar `ROOM_STATUS_REQUEST`, `ROOMS_STATUS_REQUEST` o `ROOM_JOIN`, **no llegaba respuesta**; el cliente hacía timeout.

**Causa:** En producción se desplegaba el backend **TypeScript** (`src/` → `dist/server.js`), que usa otro protocolo:

- Exige `roomId` y `playerId` en la **URL** del WebSocket (y `roomId` con prefijo `tankblitz-v4-`).
- No implementa `ROOM_JOIN`, `ROOM_STATUS_REQUEST`, `ROOMS_STATUS_REQUEST`, etc.; usa `JOIN`/`REJOIN` y no devuelve `ROOM_JOINED` ni `ROOM_STATUS_RESPONSE`.

El frontend (tankisbattle.app) usa el protocolo de **salas por mensajes** (conexión a `/ws` sin query, luego `ROOM_JOIN`, `ROOM_STATUS_REQUEST`, etc.), es decir el de **`server.js`**.

---

## 2. Cambios realizados en el backend

### 2.1 Desplegar `server.js` (protocolo ROOM_*)

- **Dockerfile:** ahora copia y ejecuta **`server.js`** (Node), no el build TypeScript de `src/`.
- Así en producción se usa el mismo protocolo que el frontend: conexión a `/ws` sin parámetros en la URL, luego mensajes `ROOM_JOIN`, `ROOM_STATUS_REQUEST`, `ROOMS_STATUS_REQUEST`, etc., con respuestas `ROOM_JOINED`, `ROOM_STATUS_RESPONSE`, `ROOMS_STATUS_RESPONSE`, `ROOM_ERROR`.

### 2.2 Campo `roomCode` en respuestas

- **`ROOM_STATUS_RESPONSE`:** ya se enviaba `payload.roomCode`; se mantiene.
- **`ROOMS_STATUS_RESPONSE`:** cada elemento de `payload.rooms` ahora incluye **`roomCode`** además de `code` (el frontend usa `room.roomCode ?? room.code`; con `roomCode` hay consistencia).

Implementación: en `buildRoomStatus()` se añade `roomCode` al objeto devuelto (tanto cuando la sala existe como cuando no). Ese objeto se usa en `ROOM_STATUS_RESPONSE` y en cada item de `ROOMS_STATUS_RESPONSE.payload.rooms`.

### 2.3 Origen (Origin) permitido

- **Cloud Run:** en `cloudbuild.yaml` se añadió la variable de entorno  
  `ALLOWED_ORIGINS=https://tankisbattle.app`  
  para que el servidor acepte conexiones WebSocket desde ese origen.
- **`env.example`:** se actualizó `ALLOWED_ORIGINS` para incluir `https://tankisbattle.app` y, para desarrollo local, `http://localhost:3000`.

Si en producción quieres permitir más orígenes, hay que añadirlos en la configuración de Cloud Run (variable `ALLOWED_ORIGINS`, lista separada por comas). En `--set-env-vars` de gcloud, si el valor contiene comas, puede ser necesario usar comillas o configurar la variable desde la consola de Cloud Run.

---

## 3. Contrato mensajes (resumen para el frontend)

- **ROOM_STATUS_REQUEST** → respuesta **ROOM_STATUS_RESPONSE** con `payload.roomCode`, `status`, `players`, `max`, `teamPlayers`, `mode`.
- **ROOMS_STATUS_REQUEST** → respuesta **ROOMS_STATUS_RESPONSE** con `payload.rooms[]`; cada elemento tiene **`roomCode`** (y el resto de campos anteriores).
- **ROOM_JOIN** → **ROOM_JOINED** (éxito) o **ROOM_ERROR** (fallo), con `payload.code` y/o `payload.message`.
- **ROOM_LEAVE**, **ROOM_REJOIN**, **ROOM_MESSAGE**: mismo contrato que en la documentación del backend; el frontend no requiere cambios de formato.

---

## 4. Códigos de sala (`roomCode`)

- El frontend normaliza códigos (p. ej. `DM1`, `DM2`, `TDM1`).
- El backend acepta y devuelve esos códigos; en las respuestas el campo es **`roomCode`** (y en `buildRoomStatus` también se mantiene `code` por compatibilidad).

---

## 5. Qué hacer tras desplegar

1. **Redesplegar** con el nuevo Dockerfile (imagen que ejecuta `server.js`) y la nueva configuración de `ALLOWED_ORIGINS`.
2. **Comprobar** desde el frontend en producción:
   - Lista de salas públicas (`ROOMS_STATUS_REQUEST` → `ROOMS_STATUS_RESPONSE`).
   - Comprobar sala al unirse por código (`ROOM_STATUS_REQUEST` → `ROOM_STATUS_RESPONSE`).
   - Entrada / reconexión / salida (`ROOM_JOIN` → `ROOM_JOINED` o `ROOM_ERROR`; `ROOM_LEAVE` / `ROOM_REJOIN` / `ROOM_MESSAGE` según documentación).

Si algo no responde, revisar que no haya proxy o middleware en Cloud Run que cierre o filtre frames WebSocket después del handshake.
