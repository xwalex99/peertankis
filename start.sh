#!/bin/sh

# Script de inicio para PeerJS + Coturn
# Este script inicia ambos servicios en paralelo
# IMPORTANTE: PeerJS debe ejecutarse en primer plano para Cloud Run

echo "=== Iniciando servicios Tankis ==="

# Variables globales para PIDs
COTURN_PID=""

# Función para manejar señales y terminar procesos
cleanup() {
    echo "Recibida señal de terminación, cerrando servicios..."
    # Terminar Coturn si está corriendo
    if [ -n "$COTURN_PID" ]; then
        echo "Cerrando Coturn (PID: $COTURN_PID)..."
        kill -TERM "$COTURN_PID" 2>/dev/null || true
        wait "$COTURN_PID" 2>/dev/null || true
    fi
    # PeerJS está en primer plano, así que la señal se propagará automáticamente
    # Pero también podemos intentar terminar procesos de node relacionados
    pkill -TERM node 2>/dev/null || true
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
        echo "ADVERTENCIA: Coturn no pudo iniciarse, continuando sin TURN"
        echo "Nota: Esto puede afectar las conexiones entre jugadores en diferentes redes"
        COTURN_PID=""
    else
        echo "Coturn está corriendo correctamente"
    fi
else
    echo "TURN deshabilitado (ENABLE_TURN=false)"
    COTURN_PID=""
fi

# Iniciar PeerJS en PRIMER PLANO (requerido por Cloud Run)
# Cloud Run necesita que el proceso principal esté en primer plano escuchando en el puerto
echo "Iniciando servidor PeerJS (proceso principal)..."
echo "PeerJS escuchará en el puerto ${PORT:-8080}"

# Ejecutar PeerJS en primer plano (sin &) - esto será el proceso principal
# El script esperará aquí hasta que PeerJS termine
node server.js
PEERJS_EXIT=$?

# Cuando PeerJS termine, limpiar Coturn si está corriendo
if [ -n "$COTURN_PID" ]; then
    echo "PeerJS terminó, cerrando Coturn..."
    kill -TERM "$COTURN_PID" 2>/dev/null || true
    wait "$COTURN_PID" 2>/dev/null || true
fi

# Salir con el código de salida de PeerJS
exit $PEERJS_EXIT

