# Configuración de TURN en Google Cloud

Esta guía explica cómo hacer que TURN funcione en Google Cloud. **Cloud Run NO soporta UDP**, por lo que necesitas usar otra opción.

---

## Opción 1: Google Compute Engine (GCE) - RECOMENDADO ✅

Esta es la mejor opción para TURN en Google Cloud. Funciona perfectamente con UDP.

### Paso 1: Crear una VM

```bash
# Configurar proyecto
gcloud config set project TU_PROYECTO_ID

# Crear VM pequeña (suficiente para TURN)
gcloud compute instances create tankis-turn-server \
  --zone=europe-southwest1-a \
  --machine-type=e2-micro \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=10GB \
  --tags=turn-server
```

### Paso 2: Configurar Firewall

```bash
# Permitir puertos TURN
gcloud compute firewall-rules create allow-turn-udp \
  --allow udp:3478 \
  --source-ranges 0.0.0.0/0 \
  --target-tags turn-server \
  --description "Allow TURN UDP port"

gcloud compute firewall-rules create allow-turn-tcp \
  --allow tcp:3478 \
  --source-ranges 0.0.0.0/0 \
  --target-tags turn-server \
  --description "Allow TURN TCP port"

gcloud compute firewall-rules create allow-turn-tls \
  --allow tcp:5349 \
  --source-ranges 0.0.0.0/0 \
  --target-tags turn-server \
  --description "Allow TURN TLS port"

# Rango de puertos para relay (CRÍTICO)
gcloud compute firewall-rules create allow-turn-relay-udp \
  --allow udp:49152-65535 \
  --source-ranges 0.0.0.0/0 \
  --target-tags turn-server \
  --description "Allow TURN relay UDP ports"

gcloud compute firewall-rules create allow-turn-relay-tcp \
  --allow tcp:49152-65535 \
  --source-ranges 0.0.0.0/0 \
  --target-tags turn-server \
  --description "Allow TURN relay TCP ports"
```

### Paso 3: Conectar a la VM e instalar Coturn

```bash
# Obtener IP externa de la VM
gcloud compute instances describe tankis-turn-server \
  --zone=europe-southwest1-a \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'

# Conectar por SSH
gcloud compute ssh tankis-turn-server --zone=europe-southwest1-a

# Una vez dentro de la VM, instalar Coturn
sudo apt-get update
sudo apt-get install -y coturn
```

### Paso 4: Configurar Coturn

```bash
# Editar configuración
sudo nano /etc/turnserver.conf
```

Configuración mínima:

```conf
listening-port=3478
tls-listening-port=5349
realm=peertankis-1093381928939.europe-southwest1.run.app
user=tankis-turn:tankis-turn-secret
log-file=/var/log/turn.log
verbose
no-stdout-log
no-cli
min-port=49152
max-port=65535
listening-ip=0.0.0.0
lt-cred-mech
fingerprint
```

### Paso 5: Iniciar Coturn

```bash
# Habilitar Coturn
sudo systemctl enable coturn
sudo systemctl start coturn

# Verificar que está corriendo
sudo systemctl status coturn

# Ver logs
sudo tail -f /var/log/turn.log
```

### Paso 6: Obtener IP estática (Opcional pero recomendado)

```bash
# Crear IP estática
gcloud compute addresses create turn-server-ip \
  --region=europe-southwest1

# Asignar IP estática a la VM
gcloud compute instances delete-access-config tankis-turn-server \
  --zone=europe-southwest1-a \
  --access-config-name "External NAT"

gcloud compute instances add-access-config tankis-turn-server \
  --zone=europe-southwest1-a \
  --access-config-name "External NAT" \
  --address $(gcloud compute addresses describe turn-server-ip \
    --region=europe-southwest1 --format='get(address)')
```

### Paso 7: Configurar DNS (Opcional)

Si tienes un dominio, crea un subdominio apuntando a la IP de la VM:

```
turn.tudominio.com → IP_DE_LA_VM
```

### Paso 8: Configurar Frontend

Actualiza el frontend para usar la IP o dominio de la VM:

```typescript
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: `turn:IP_DE_LA_VM:3478`, // O turn.tudominio.com:3478
    username: 'tankis-turn',
    credential: 'tankis-turn-secret',
  },
];
```

### Costo estimado

- **e2-micro**: ~$6-8/mes (1 vCPU, 1GB RAM)
- **IP estática**: Gratis si la VM está corriendo
- **Tráfico**: Primeros 1GB/mes gratis, luego $0.12/GB

**Total**: ~$6-10/mes

---

## Opción 2: Desplegar con Docker en GCE

Si prefieres usar el mismo Dockerfile del proyecto:

### Paso 1: Crear VM con Docker

```bash
gcloud compute instances create tankis-turn-server \
  --zone=europe-southwest1-a \
  --machine-type=e2-micro \
  --image-family=cos-stable \
  --image-project=cos-cloud \
  --boot-disk-size=20GB \
  --tags=turn-server
```

### Paso 2: Configurar Firewall (igual que Opción 1)

### Paso 3: Conectar y desplegar

```bash
# Conectar por SSH
gcloud compute ssh tankis-turn-server --zone=europe-southwest1-a

# Instalar Docker (si no está)
sudo apt-get update
sudo apt-get install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker

# Clonar tu repo o subir archivos
git clone TU_REPO
cd peertankis

# Construir imagen
docker build -t tankis-turn .

# Ejecutar solo Coturn (deshabilitar PeerJS)
docker run -d \
  --name tankis-turn \
  --restart unless-stopped \
  -p 3478:3478/udp \
  -p 3478:3478/tcp \
  -p 5349:5349/tcp \
  -p 49152-65535:49152-65535/udp \
  -p 49152-65535:49152-65535/tcp \
  -e ENABLE_TURN=true \
  -e TURN_REALM=peertankis-1093381928939.europe-southwest1.run.app \
  -e TURN_USER=tankis-turn \
  -e TURN_PASSWORD=tankis-turn-secret \
  tankis-turn
```

**Nota**: Necesitarías modificar el `start.sh` para que solo ejecute Coturn si solo quieres TURN en esta VM.

---

## Opción 3: Google Kubernetes Engine (GKE) - Para escalabilidad

Si necesitas escalar TURN o ya usas Kubernetes:

### Paso 1: Crear cluster

```bash
gcloud container clusters create turn-cluster \
  --zone=europe-southwest1-a \
  --num-nodes=1 \
  --machine-type=e2-micro
```

### Paso 2: Configurar firewall

```bash
# Similar a GCE, pero para el cluster
gcloud compute firewall-rules create allow-turn-udp \
  --allow udp:3478 \
  --source-ranges 0.0.0.0/0 \
  --description "Allow TURN UDP port"
# ... (resto de reglas)
```

### Paso 3: Desplegar con Kubernetes

Crea un `turn-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: turn-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: turn-server
  template:
    metadata:
      labels:
        app: turn-server
    spec:
      containers:
      - name: turn
        image: gcr.io/TU_PROYECTO/tankis-turn:latest
        env:
        - name: ENABLE_TURN
          value: "true"
        - name: TURN_REALM
          value: "peertankis-1093381928939.europe-southwest1.run.app"
        - name: TURN_USER
          value: "tankis-turn"
        - name: TURN_PASSWORD
          value: "tankis-turn-secret"
        ports:
        - containerPort: 3478
          protocol: UDP
        - containerPort: 3478
          protocol: TCP
        - containerPort: 5349
          protocol: TCP
---
apiVersion: v1
kind: Service
metadata:
  name: turn-service
spec:
  type: LoadBalancer
  selector:
    app: turn-server
  ports:
  - name: turn-udp
    port: 3478
    targetPort: 3478
    protocol: UDP
  - name: turn-tcp
    port: 3478
    targetPort: 3478
    protocol: TCP
  - name: turn-tls
    port: 5349
    targetPort: 5349
    protocol: TCP
```

Desplegar:

```bash
kubectl apply -f turn-deployment.yaml
kubectl get service turn-service
```

**Costo**: Más caro (~$25-30/mes mínimo por el cluster)

---

## Opción 4: Cloud Run con TCP (Limitado) ⚠️

Si insistes en usar Cloud Run, solo funcionará parcialmente con TCP:

### Configuración del Frontend

```typescript
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    // SOLO TCP (UDP no funciona en Cloud Run)
    urls: `turn:peertankis-1093381928939.europe-southwest1.run.app:3478?transport=tcp`,
    username: 'tankis-turn',
    credential: 'tankis-turn-secret',
  },
];
```

**Limitaciones**:
- ❌ No funciona con UDP (más lento)
- ❌ Puede no funcionar en todos los casos
- ❌ Puertos dinámicos pueden no estar disponibles
- ✅ Ya está desplegado (no necesitas crear nada nuevo)

---

## Comparación de Opciones

| Opción | Costo/mes | UDP | Facilidad | Recomendado |
|--------|-----------|-----|-----------|-------------|
| **GCE (VM)** | $6-10 | ✅ | ⭐⭐⭐ | ✅✅✅ |
| **GKE** | $25+ | ✅ | ⭐⭐ | ✅ (si ya usas K8s) |
| **Cloud Run** | Incluido | ❌ | ⭐⭐⭐⭐⭐ | ⚠️ (limitado) |

---

## Recomendación Final

**Para producción**: Usa **Google Compute Engine (Opción 1)**:
- ✅ Funciona perfectamente con UDP
- ✅ Barato (~$6-10/mes)
- ✅ Fácil de configurar
- ✅ Control total

**Arquitectura recomendada**:
```
┌─────────────────┐         ┌──────────────────┐
│   Cloud Run     │         │   GCE (VM)       │
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

---

## Checklist de Implementación GCE

- [ ] VM creada en GCE
- [ ] Reglas de firewall configuradas (UDP 3478, TCP 3478, TCP 5349, UDP/TCP 49152-65535)
- [ ] Coturn instalado en la VM
- [ ] `/etc/turnserver.conf` configurado con realm, usuario y contraseña
- [ ] Coturn iniciado y habilitado (`systemctl enable coturn`)
- [ ] IP estática asignada (opcional pero recomendado)
- [ ] DNS configurado (opcional, subdominio apuntando a la VM)
- [ ] Test STUN exitoso desde la VM
- [ ] Test TURN exitoso desde la VM
- [ ] Frontend actualizado con IP/dominio de la VM
- [ ] Verificación: dos dispositivos en diferentes WiFi pueden conectarse

---

## Troubleshooting GCE

### Coturn no inicia

```bash
# Ver logs
sudo journalctl -u coturn -n 50

# Verificar configuración
sudo turnserver -c /etc/turnserver.conf --log-file=stdout
```

### Firewall bloquea conexiones

```bash
# Verificar reglas
gcloud compute firewall-rules list --filter="name~turn"

# Verificar que la VM tiene el tag correcto
gcloud compute instances describe tankis-turn-server \
  --zone=europe-southwest1-a \
  --format='get(tags.items)'
```

### No se pueden conectar desde fuera

1. Verifica que la IP externa es accesible
2. Verifica que las reglas de firewall permiten el tráfico
3. Verifica que Coturn está escuchando: `sudo netstat -tulpn | grep 3478`
4. Prueba desde la VM: `turnutils_stunclient IP_DE_LA_VM`

---

## Referencias

- [Documentación GCE](https://cloud.google.com/compute/docs)
- [Configuración de Firewall](https://cloud.google.com/vpc/docs/firewalls)
- [Coturn en GitHub](https://github.com/coturn/coturn)

