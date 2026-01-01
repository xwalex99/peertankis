# Alternativa: TURN en VPS separado (Recomendado para Cloud Run)

Si estás usando Cloud Run para PeerJS pero necesitas TURN funcionando correctamente, la mejor solución es desplegar Coturn en un VPS separado.

## Arquitectura Recomendada

```
┌─────────────────┐         ┌──────────────────┐
│   Cloud Run     │         │   VPS (TURN)     │
│   (PeerJS)      │         │   (Coturn)       │
│                 │         │                  │
│  - Señalización │         │  - Relay UDP/TCP │
│  - WebSockets   │         │  - Puerto 3478   │
└─────────────────┘         └──────────────────┘
         │                           │
         └───────────┬───────────────┘
                     │
              ┌──────▼──────┐
              │   Frontend  │
              │  (Tankis)   │
              └─────────────┘
```

## Opción 1: VPS Barato (Recomendado)

### DigitalOcean Droplet ($5/mes)

1. **Crear Droplet**:
   - Ubuntu 22.04
   - 1GB RAM, 1 vCPU
   - Región cercana a tus usuarios

2. **Instalar Coturn**:
   ```bash
   sudo apt-get update
   sudo apt-get install -y coturn
   ```

3. **Configurar Coturn**:
   ```bash
   sudo nano /etc/turnserver.conf
   ```
   
   Configuración mínima:
   ```conf
   listening-port=3478
   realm=TU_DOMINIO_VPS.com
   user=tankis-turn:tankis-turn-secret
   log-file=/var/log/turn.log
   verbose
   no-stdout-log
   no-cli
   min-port=49152
   max-port=65535
   ```

4. **Configurar Firewall**:
   ```bash
   sudo ufw allow 3478/udp
   sudo ufw allow 3478/tcp
   sudo ufw allow 49152:65535/udp
   sudo ufw allow 49152:65535/tcp
   sudo ufw enable
   ```

5. **Iniciar Coturn**:
   ```bash
   sudo systemctl start coturn
   sudo systemctl enable coturn
   ```

6. **Configurar DNS** (opcional pero recomendado):
   - Crea un subdominio: `turn.tudominio.com` → IP del VPS

### Configurar Frontend

```typescript
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: `turn:TU_IP_VPS:3478`, // O turn.tudominio.com:3478
    username: 'tankis-turn',
    credential: 'tankis-turn-secret',
  },
];
```

## Opción 2: Usar Servicio TURN Público (Gratis)

Si no quieres mantener un VPS, puedes usar un servicio TURN público como fallback:

### Metered.ca (Gratis)

```typescript
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];
```

**Limitaciones**:
- Límite de ancho de banda (1GB/mes en plan gratis)
- Puede ser más lento que tu propio servidor
- No tienes control total

## Opción 3: Docker en VPS

Si prefieres usar Docker también en el VPS:

```bash
# En el VPS
git clone TU_REPO
cd peertankis

# Modificar Dockerfile para solo Coturn, o usar el mismo
docker build -t tankis-turn .
docker run -d \
  -p 3478:3478/udp \
  -p 3478:3478/tcp \
  -p 49152-65535:49152-65535/udp \
  -e TURN_REALM=TU_DOMINIO \
  -e TURN_USER=tankis-turn \
  -e TURN_PASSWORD=tankis-turn-secret \
  --name tankis-turn \
  tankis-turn
```

## Verificación

```bash
# En el VPS
turnutils_stunclient TU_IP_O_DOMINIO
turnutils_oauth -u tankis-turn -w tankis-turn-secret TU_IP_O_DOMINIO
```

## Costos Estimados

- **DigitalOcean Droplet**: $5/mes (1GB RAM)
- **Linode**: $5/mes (1GB RAM)
- **Vultr**: $5/mes (1GB RAM)
- **Hetzner**: €4/mes (2GB RAM) - Mejor precio/rendimiento

## Recomendación Final

Para producción con muchos usuarios:
1. **PeerJS en Cloud Run** (señalización, funciona bien)
2. **Coturn en VPS pequeño** ($5/mes, TURN funciona perfectamente)
3. **Servicio TURN público como fallback** (si el VPS falla)

Esto te da:
- ✅ Señalización escalable (Cloud Run)
- ✅ TURN confiable (VPS con UDP)
- ✅ Redundancia (servicio público como backup)
- ✅ Costo total: ~$5-10/mes

