# Configuración del Servidor TURN para Tankis

Este documento explica cómo configurar un servidor TURN en el mismo backend donde está corriendo PeerJS. El servidor TURN es **CRÍTICO** para permitir conexiones entre jugadores que están en diferentes redes WiFi.

---

## ¿Por qué necesitamos TURN?

- **STUN**: Descubre la IP pública del cliente (funciona para conexiones P2P directas)
- **TURN**: Relaya el tráfico cuando hay NATs estrictos o firewalls (necesario cuando STUN no es suficiente)
- **Sin TURN**: Los jugadores solo pueden conectarse si están en la misma red local
- **Con TURN**: Los jugadores pueden conectarse desde cualquier red (diferentes WiFi, móviles, etc.)

---

## Configuración Automática (Docker)

El proyecto ya incluye Coturn configurado en el Dockerfile. Solo necesitas:

### 1. Variables de entorno

Configura estas variables en tu despliegue (Cloud Run, App Engine, etc.):

```bash
ENABLE_TURN=true
TURN_REALM=peertankis-1093381928939.europe-southwest1.run.app
TURN_USER=tankis-turn
TURN_PASSWORD=tankis-turn-secret
```

**IMPORTANTE**: El `TURN_REALM` debe ser el dominio público donde está desplegado tu servidor.

### 2. Puertos a exponer

Asegúrate de que estos puertos estén abiertos:

- **3478/udp** y **3478/tcp**: Puertos estándar de TURN
- **5349/tcp**: Puerto TLS de TURN
- **49152-65535/udp** y **49152-65535/tcp**: Rango de puertos para relay (CRÍTICO)

### 3. Cloud Run - Limitaciones CRÍTICAS ⚠️

⚠️ **PROBLEMA CONOCIDO**: Google Cloud Run **NO soporta UDP de forma confiable**, que es esencial para TURN:

- Cloud Run está diseñado para HTTP/HTTPS (TCP), no para UDP
- TURN necesita UDP para funcionar correctamente
- Los puertos dinámicos (49152-65535) pueden no estar disponibles
- **Resultado**: TURN probablemente NO funcionará en Cloud Run

**Soluciones**:

1. **Usar solo TCP en el frontend** (limitado pero puede funcionar):
   ```typescript
   {
     urls: `turn:${host}:3478?transport=tcp`,
     username: 'tankis-turn',
     credential: 'tankis-turn-secret',
   }
   ```

2. **Desplegar TURN en un VPS separado** (RECOMENDADO):
   - Mantén PeerJS en Cloud Run
   - Despliega Coturn en un VPS (DigitalOcean, Linode, etc.)
   - Configura el frontend para usar el VPS para TURN

3. **Usar un servicio TURN público** como fallback:
   - Metered.ca (gratis con límites)
   - Twilio (de pago pero confiable)

4. **Desplegar todo en Google Compute Engine (GCE)**:
   - Crea una VM pequeña
   - Despliega PeerJS y Coturn en la misma VM
   - Funciona perfectamente con UDP

**Si decides usar Cloud Run de todos modos**: El Dockerfile está configurado, pero TURN puede no funcionar. El servidor continuará funcionando sin TURN (solo conexiones en la misma red).

---

## Configuración Manual (VPS/Servidor propio)

Si estás desplegando en un VPS o servidor propio:

### 1. Instalación de Coturn

#### Ubuntu/Debian

```bash
sudo apt-get update
sudo apt-get install coturn
```

#### Compilar desde fuente (opcional)

```bash
git clone https://github.com/coturn/coturn.git
cd coturn
./configure
make
sudo make install
```

### 2. Configuración

El archivo `turnserver.conf` en la raíz del proyecto contiene la configuración. Puedes copiarlo a `/etc/turnserver.conf`:

```bash
sudo cp turnserver.conf /etc/turnserver.conf
sudo nano /etc/turnserver.conf
```

Ajusta las siguientes variables según tu entorno:

```conf
realm=TU_DOMINIO_PUBLICO
user=TU_USUARIO:TU_CONTRASEÑA
```

### 3. Configuración del Firewall

#### UFW (Ubuntu)

```bash
# Puertos TURN estándar
sudo ufw allow 3478/udp
sudo ufw allow 3478/tcp
sudo ufw allow 5349/tcp  # TLS

# Rango de puertos para relay (CRÍTICO)
sudo ufw allow 49152:65535/udp
sudo ufw allow 49152:65535/tcp

# Verificar reglas
sudo ufw status
```

#### Firewalld (CentOS/RHEL)

```bash
# Puertos TURN
sudo firewall-cmd --permanent --add-port=3478/udp
sudo firewall-cmd --permanent --add-port=3478/tcp
sudo firewall-cmd --permanent --add-port=5349/tcp

# Rango de puertos para relay
sudo firewall-cmd --permanent --add-port=49152-65535/udp
sudo firewall-cmd --permanent --add-port=49152-65535/tcp

# Aplicar cambios
sudo firewall-cmd --reload
```

### 4. Iniciar Coturn

```bash
# Iniciar coturn
sudo systemctl start coturn

# Habilitar inicio automático
sudo systemctl enable coturn

# Verificar estado
sudo systemctl status coturn

# Ver logs en tiempo real
sudo tail -f /var/log/turn.log
```

---

## Verificación y Testing

### 1. Verificar que el servicio está corriendo

```bash
# En el contenedor/servidor
ps aux | grep turnserver
```

### 2. Verificar que los puertos están abiertos

```bash
# Desde el servidor
sudo netstat -tulpn | grep 3478
sudo netstat -tulpn | grep 5349

# O con ss
sudo ss -tulpn | grep 3478
```

### 3. Test STUN (descubrimiento de IP)

```bash
# Instalar herramientas de test (si no están instaladas)
sudo apt-get install coturn-utils

# Test STUN
turnutils_stunclient TU_DOMINIO_PUBLICO
```

Deberías ver algo como:

```
0: IPv4. Reflexive address: X.X.X.X:XXXX
```

### 4. Test TURN (relay)

```bash
# Test TURN con autenticación
turnutils_oauth -u tankis-turn -w tankis-turn-secret TU_DOMINIO_PUBLICO
```

### 5. Test desde navegador

Puedes usar herramientas online como:

- https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

Añade tu servidor TURN en "Add Server":

```
turn:TU_DOMINIO_PUBLICO:3478
Username: tankis-turn
Password: tankis-turn-secret
```

---

## Configuración del Frontend

Una vez que el servidor TURN esté configurado y funcionando, actualiza el frontend:

### En `utils/network.ts` (o donde configures PeerJS)

**Ejemplo completo de configuración con PeerJS:**

```typescript
import Peer from 'peerjs';

// Configuración del servidor TURN
const TURN_HOST = 'peertankis-1093381928939.europe-southwest1.run.app';
const TURN_PORT = 3478;
const TURN_USER = 'tankis-turn';
const TURN_PASS = 'tankis-turn-secret';

// Crear peer con configuración TURN
const peer = new Peer(peerId, {
  host: TURN_HOST,
  port: 443, // Cloud Run usa HTTPS en puerto 443
  path: '/peerjs',
  secure: true, // IMPORTANTE: usar WSS en producción
  key: 'tankis-peer',
  config: {
    iceServers: [
      // STUN server (descubrimiento de IP pública)
      {
        urls: 'stun:stun.l.google.com:19302'
      },
      // Tu servidor TURN (UDP - puede no funcionar en Cloud Run)
      {
        urls: `turn:${TURN_HOST}:${TURN_PORT}`,
        username: TURN_USER,
        credential: TURN_PASS,
      },
      // Tu servidor TURN (TCP - funciona mejor en Cloud Run)
      {
        urls: `turn:${TURN_HOST}:${TURN_PORT}?transport=tcp`,
        username: TURN_USER,
        credential: TURN_PASS,
      },
    ],
    iceCandidatePoolSize: 10, // Pre-generar candidatos ICE
  },
});
```

**Si estás usando Cloud Run, prioriza TCP:**

```typescript
config: {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // TCP primero (funciona mejor en Cloud Run)
    {
      urls: `turn:${TURN_HOST}:${TURN_PORT}?transport=tcp`,
      username: TURN_USER,
      credential: TURN_PASS,
    },
    // UDP como fallback
    {
      urls: `turn:${TURN_HOST}:${TURN_PORT}`,
      username: TURN_USER,
      credential: TURN_PASS,
    },
  ],
}
```

**Ver documentación completa del frontend**: Ver `docs/frontend-turn-setup.md` para más detalles y ejemplos.

---

## Troubleshooting

### El servicio no inicia

```bash
# Ver logs de systemd
sudo journalctl -u coturn -n 50

# Verificar configuración
sudo turnserver -c /etc/turnserver.conf --log-file=stdout
```

### Los puertos no están abiertos

```bash
# Verificar que coturn está escuchando
sudo netstat -tulpn | grep turnserver

# Verificar firewall
sudo ufw status
# o
sudo firewall-cmd --list-all
```

### Los clientes no pueden conectarse

1. **Verificar que el realm coincide** con el dominio del servidor
2. **Verificar que las credenciales** en el frontend coinciden con las del servidor
3. **Verificar logs** de coturn: `sudo tail -f /var/log/turn.log`
4. **Verificar que los puertos** 49152-65535 están abiertos (crítico para relay)

### Diagnóstico: ¿TURN está funcionando?

**Síntoma**: Los jugadores solo pueden conectarse en la misma red WiFi.

**Pasos de diagnóstico**:

1. **Verificar en el navegador (Chrome/Edge)**:
   - Abre DevTools (F12) → Pestaña "Network"
   - Filtra por "WebRTC"
   - Busca conexiones establecidas
   - Si ves candidatos tipo `relay`, TURN está funcionando
   - Si solo ves `host` o `srflx`, TURN NO está funcionando

2. **Verificar candidatos ICE en consola**:
   ```javascript
   // En la consola del navegador
   const pc = new RTCPeerConnection({
     iceServers: [/* tu configuración */]
   });
   
   pc.onicecandidate = (event) => {
     if (event.candidate) {
       console.log('Candidato ICE:', event.candidate.type, event.candidate.candidate);
       // Deberías ver candidatos tipo "relay" si TURN funciona
     }
   };
   ```

3. **Verificar logs del servidor TURN**:
   ```bash
   # En el servidor/contenedor
   tail -f /var/log/turn.log
   # Busca líneas como "session" o "relay" cuando se conecta un cliente
   ```

4. **Test con herramienta online**:
   - Ve a: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
   - Agrega tu servidor TURN
   - Si ves candidatos `relay`, TURN funciona
   - Si solo ves `host` o `srflx`, TURN no funciona

### Errores comunes

**Error: "realm value is wrong"**
- El `realm` en `turnserver.conf` debe ser el dominio público del servidor

**Error: "authentication failed"**
- Verificar que `user=tankis-turn:tankis-turn-secret` coincide con el frontend

**Error: "relay port range exhausted"**
- Asegúrate de que los puertos 49152-65535 están abiertos en el firewall

**Cloud Run: "UDP not supported"**
- Cloud Run no soporta UDP nativamente. Considera usar GCE, GKE o un VPS.

**"Solo funciona en la misma WiFi"**
- Esto significa que TURN NO está funcionando. Posibles causas:
  1. El frontend no está configurado para usar TURN (ver sección "Configuración del Frontend")
  2. Cloud Run no soporta UDP (solución: usar VPS o TCP)
  3. Las credenciales no coinciden entre servidor y frontend
  4. El servidor TURN no está iniciado o tiene errores
  5. Los puertos no están abiertos en el firewall

**Solución rápida**:
1. Verifica que el frontend tiene la configuración de `iceServers` con tu servidor TURN
2. Usa `?transport=tcp` en la URL de TURN si estás en Cloud Run
3. Verifica los logs del servidor para ver si hay errores
4. Considera desplegar TURN en un VPS separado (ver `docs/cloud-run-turn-alternative.md`)

---

## Configuración Avanzada (Opcional)

### Múltiples usuarios

Si quieres usar múltiples usuarios, crea un archivo de usuarios:

```bash
# Crear archivo de usuarios
sudo nano /etc/turnuserdb.conf
```

Contenido:

```
tankis-turn:tankis-turn-secret:TU_DOMINIO_PUBLICO
usuario2:password2:TU_DOMINIO_PUBLICO
```

En `turnserver.conf`:

```conf
userdb=/etc/turnuserdb.conf
```

### Autenticación con secret (más seguro)

En lugar de usuarios fijos, puedes usar un secret compartido:

```conf
use-auth-secret
static-auth-secret=tu-secret-key-muy-largo-y-seguro-aqui
```

El frontend necesitaría generar credenciales temporales usando este secret.

### Límites de ancho de banda por usuario

```conf
# Límite por usuario (en bits por segundo)
user-quota=100000
total-quota=10000000
```

---

## Monitoreo

### Ver conexiones activas

```bash
# Ver estadísticas
sudo turnadmin -s

# Ver usuarios conectados
sudo turnadmin -l
```

### Métricas útiles

- **Conexiones activas**: `turnadmin -s | grep "Total sessions"`
- **Ancho de banda usado**: `turnadmin -s | grep "Total"`
- **Errores**: Revisar `/var/log/turn.log`

---

## Checklist de Implementación

### Backend (Servidor)
- [ ] Coturn instalado (o incluido en Dockerfile)
- [ ] Archivo `turnserver.conf` configurado
- [ ] Realm configurado con el dominio correcto
- [ ] Usuario y contraseña configurados
- [ ] Variables de entorno configuradas (`ENABLE_TURN`, `TURN_REALM`, `TURN_USER`, `TURN_PASSWORD`)
- [ ] Puertos 3478, 5349 abiertos en firewall (si es VPS)
- [ ] Rango de puertos 49152-65535 abiertos en firewall (si es VPS)
- [ ] Servicio coturn iniciado y habilitado (o ejecutándose en Docker)
- [ ] Test STUN exitoso
- [ ] Test TURN exitoso
- [ ] Logs verificados sin errores

### Frontend (Cliente)
- [ ] Configuración de `iceServers` agregada a PeerJS
- [ ] Servidor TURN agregado a la lista de `iceServers`
- [ ] TCP configurado (`?transport=tcp`) si usas Cloud Run
- [ ] Credenciales en frontend coinciden con servidor (`username` y `credential`)
- [ ] Dominio del TURN coincide con `TURN_REALM` del servidor
- [ ] Test en navegador muestra candidatos tipo `relay`

### Verificación Final
- [ ] Dos dispositivos en diferentes redes WiFi pueden conectarse
- [ ] Candidatos ICE tipo `relay` aparecen en DevTools
- [ ] No hay errores en la consola del navegador
- [ ] Logs del servidor muestran sesiones TURN activas

---

## Soporte

Si tienes problemas:

1. **Revisa los logs**: 
   - Servidor: `sudo tail -f /var/log/turn.log` o logs del contenedor en Cloud Run
   - Frontend: Abre DevTools (F12) → Console y Network tabs

2. **Verifica la configuración**: 
   - Servidor: `sudo turnserver -c /etc/turnserver.conf --log-file=stdout`
   - Frontend: Verifica que `iceServers` incluye tu servidor TURN

3. **Prueba con herramientas de test**: 
   - `turnutils_stunclient` y `turnutils_oauth` en el servidor
   - https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/ en el navegador

4. **Verifica firewall y puertos abiertos** (solo si es VPS)

5. **Asegúrate de que coinciden**:
   - `TURN_REALM` en servidor = dominio en `iceServers` del frontend
   - `TURN_USER` en servidor = `username` en frontend
   - `TURN_PASSWORD` en servidor = `credential` en frontend

6. **Si estás en Cloud Run**: 
   - Considera que UDP puede no funcionar
   - Usa `?transport=tcp` en la URL de TURN
   - O despliega TURN en un VPS separado (ver `docs/cloud-run-turn-alternative.md`)

## Documentación Relacionada

- **Configuración del Frontend**: `docs/frontend-turn-setup.md` - Guía detallada para configurar el cliente
- **Alternativa VPS**: `docs/cloud-run-turn-alternative.md` - Cómo desplegar TURN en VPS separado

---

## Referencias

- Documentación oficial de Coturn: https://github.com/coturn/coturn
- WebRTC TURN Server: https://webrtc.org/getting-started/turn-server
- Ejemplos de configuración: https://github.com/coturn/coturn/wiki

