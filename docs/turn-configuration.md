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

### 3. Cloud Run - Limitaciones importantes

⚠️ **ADVERTENCIA**: Google Cloud Run tiene limitaciones con UDP y puertos dinámicos:

- Cloud Run **NO soporta UDP** de forma nativa
- Los puertos dinámicos (49152-65535) pueden no funcionar correctamente
- **Recomendación**: Para producción con TURN, considera usar:
  - **Google Compute Engine (GCE)** con una VM
  - **Google Kubernetes Engine (GKE)**
  - Un **VPS** tradicional (DigitalOcean, Linode, etc.)

Si aún así quieres intentar en Cloud Run, el Dockerfile está configurado, pero puede que necesites ajustes adicionales.

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

```typescript
// Cambiar estas constantes:
const USE_OWN_TURN = true;
const TURN_HOST = 'TU_DOMINIO_PUBLICO';
const TURN_PORT = 3478;
const TURN_USERNAME = 'tankis-turn';
const TURN_CREDENTIAL = 'tankis-turn-secret';
```

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

### Errores comunes

**Error: "realm value is wrong"**
- El `realm` en `turnserver.conf` debe ser el dominio público del servidor

**Error: "authentication failed"**
- Verificar que `user=tankis-turn:tankis-turn-secret` coincide con el frontend

**Error: "relay port range exhausted"**
- Asegúrate de que los puertos 49152-65535 están abiertos en el firewall

**Cloud Run: "UDP not supported"**
- Cloud Run no soporta UDP nativamente. Considera usar GCE, GKE o un VPS.

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

- [ ] Coturn instalado (o incluido en Dockerfile)
- [ ] Archivo `turnserver.conf` configurado
- [ ] Realm configurado con el dominio correcto
- [ ] Usuario y contraseña configurados
- [ ] Puertos 3478, 5349 abiertos en firewall
- [ ] Rango de puertos 49152-65535 abiertos en firewall
- [ ] Servicio coturn iniciado y habilitado (o ejecutándose en Docker)
- [ ] Test STUN exitoso
- [ ] Test TURN exitoso
- [ ] Frontend actualizado con `USE_OWN_TURN = true`
- [ ] Credenciales en frontend coinciden con servidor
- [ ] Logs verificados sin errores

---

## Soporte

Si tienes problemas:

1. Revisa los logs: `sudo tail -f /var/log/turn.log` o logs del contenedor
2. Verifica la configuración: `sudo turnserver -c /etc/turnserver.conf --log-file=stdout`
3. Prueba con herramientas de test: `turnutils_stunclient` y `turnutils_oauth`
4. Verifica firewall y puertos abiertos
5. Asegúrate de que el realm y las credenciales coinciden entre servidor y frontend

---

## Referencias

- Documentación oficial de Coturn: https://github.com/coturn/coturn
- WebRTC TURN Server: https://webrtc.org/getting-started/turn-server
- Ejemplos de configuración: https://github.com/coturn/coturn/wiki

