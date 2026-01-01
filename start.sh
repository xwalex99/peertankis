#!/bin/sh

# Script de inicio para PeerJS + Coturn
# Este script inicia ambos servicios en paralelo

set -e

echo "=== Iniciando servicios Tankis ==="

# Función para manejar señales y terminar procesos
cleanup() {
    echo "Recibida señal de terminación, cerrando servicios..."
    kill -TERM "$PEERJS_PID" 2>/dev/null || true
    kill -TERM "$COTURN_PID" 2>/dev/null || true
    wait "$PEERJS_PID" 2>/dev/null || true
    wait "$COTURN_PID" 2>/dev/null || true
    exit 0
}

trap cleanup SIGTERM SIGINT

# Iniciar Coturn en segundo plano
if [ "$ENABLE_TURN" != "false" ]; then
    echo "Iniciando servidor TURN (Coturn)..."
    
    # Crear directorio de logs si no existe
    mkdir -p /var/log
    
    # Generar configuración dinámica desde variables de entorno
    TURN_REALM=${TURN_REALM:-peertankis-1093381928939.europe-southwest1.run.app}
    TURN_USER=${TURN_USER:-tankis-turn}
    TURN_PASSWORD=${TURN_PASSWORD:-tankis-turn-secret}
    
    # Crear archivo de configuración temporal con valores reales
    cat > /tmp/turnserver.conf <<EOF
# ===========================================
# CONFIGURACIÓN TURN SERVER - TANKIS
# Generado automáticamente desde variables de entorno
# ===========================================

# Puertos de escucha
listening-port=3478
tls-listening-port=5349

# Realm (usar tu dominio público)
realm=${TURN_REALM}

# Usuario y contraseña para TURN
user=${TURN_USER}:${TURN_PASSWORD}

# ===========================================
# SEGURIDAD
# ===========================================

# Habilitar autenticación
lt-cred-mech

# Fingerprint (mejora compatibilidad)
fingerprint

# ===========================================
# RED Y RENDIMIENTO
# ===========================================

# Rango de puertos para relay (importante para firewall)
min-port=49152
max-port=65535

# Límites de ancho de banda (ajustar según tu servidor)
max-bps=1000000
max-users=1000

# Tiempo de vida de las sesiones
stale-nonce=600

# ===========================================
# LOGS
# ===========================================

# Archivo de log
log-file=/var/log/turn.log

# Nivel de verbosidad (0-9, 9 es muy detallado)
verbose

# No mostrar logs en stdout (útil para systemd)
no-stdout-log

# ===========================================
# OPCIONES ADICIONALES
# ===========================================

# No usar CLI (interfaz de línea de comandos)
no-cli

# Habilitar IPv4
listening-ip=0.0.0.0

# Habilitar IPv6 (opcional)
# listening-ipv6=::

# TLS/SSL (opcional, si tienes certificados)
# cert=/etc/letsencrypt/live/${TURN_REALM}/fullchain.pem
# pkey=/etc/letsencrypt/live/${TURN_REALM}/privkey.pem
EOF
    
    echo "Configuración TURN generada:"
    echo "  Realm: ${TURN_REALM}"
    echo "  User: ${TURN_USER}"
    
    # Iniciar turnserver
    turnserver -c /tmp/turnserver.conf -v &
    COTURN_PID=$!
    echo "Coturn iniciado con PID: $COTURN_PID"
    
    # Esperar un momento para que Coturn inicie
    sleep 2
    
    # Verificar que Coturn está corriendo
    if ! kill -0 $COTURN_PID 2>/dev/null; then
        echo "ERROR: Coturn no pudo iniciarse"
        exit 1
    fi
else
    echo "TURN deshabilitado (ENABLE_TURN=false)"
    COTURN_PID=""
fi

# Iniciar PeerJS
echo "Iniciando servidor PeerJS..."
node server.js &
PEERJS_PID=$!
echo "PeerJS iniciado con PID: $PEERJS_PID"

# Esperar a que ambos procesos terminen
wait $PEERJS_PID
PEERJS_EXIT=$?

if [ -n "$COTURN_PID" ]; then
    wait $COTURN_PID
    COTURN_EXIT=$?
else
    COTURN_EXIT=0
fi

# Si alguno falla, salir con error
if [ $PEERJS_EXIT -ne 0 ] || [ $COTURN_EXIT -ne 0 ]; then
    echo "ERROR: Uno de los servicios falló"
    exit 1
fi

