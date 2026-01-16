# Deploy del PeerJS Server en **Google Cloud Run** (recomendado si el frontend está en Vercel)

Cloud Run soporta WebSockets, pero para PeerJS necesitas **una sola instancia** (sin sticky sessions, varias instancias rompen el estado en memoria).

## 1) Requisitos

- `gcloud` instalado y autenticado
- Un proyecto GCP con facturación
- Permisos de IAM configurados para Cloud Build (ver sección de permisos abajo)

## 2) Build + Deploy

Desde la carpeta del repo:

```bash
gcloud config set project TU_PROYECTO_ID

# Build con Cloud Build y sube la imagen al Artifact Registry
gcloud builds submit --tag gcr.io/TU_PROYECTO_ID/tankis-peerjs

# Deploy a Cloud Run
gcloud run deploy tankis-peerjs \
  --image gcr.io/TU_PROYECTO_ID/tankis-peerjs \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --max-instances 1 \
  --min-instances 1 \
  --timeout 3600 \
  --set-env-vars HOST=0.0.0.0,PEER_PATH=/peerjs,PEER_PROXIED=true,PEER_ALLOW_DISCOVERY=false,PEER_KEY=tankis-peer
```

## 3) Dominio + HTTPS

En Cloud Run puedes configurar **Custom Domains** para servir:

- `https://peer.tudominio.com/peerjs`

Una vez tengas el dominio, en el frontend (Tankis) usa:

- `host`: `peer.tudominio.com`
- `port`: `443`
- `secure`: `true`
- `path`: `'/peerjs'`
- `key`: `'tankis-peer'` (si activas key)

## 4) Configuración de Permisos IAM

Si recibes errores de permisos como `PERMISSION_DENIED: Permission 'run.services.get' denied`, necesitas otorgar permisos a la cuenta de servicio de Cloud Build:

```bash
# Obtener el número del proyecto
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

# Otorgar el rol de Cloud Run Admin a la cuenta de servicio de Cloud Build
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

# También necesitas el rol de Service Account User para que Cloud Build pueda usar cuentas de servicio
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

**Nota:** Si tu proyecto usa una cuenta de servicio de App Engine (como `airsoftlink@appspot.gserviceaccount.com`), también necesitas otorgarle estos permisos:

```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:airsoftlink@appspot.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:airsoftlink@appspot.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

## 5) Notas importantes

- Si subes `max-instances` > 1, necesitas sticky sessions / estado compartido (no recomendado para empezar).
- Ajusta `PEER_KEY` a una key tuya (y pon la misma en el cliente).


