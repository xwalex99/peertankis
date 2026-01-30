/**
 * Servidor WebSocket principal para TankisBattle
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { getRoom, removeRoom, getAllRooms, getTotalClients } from './room.js';
import { setClientInfo, getPlayerId, getRoomId } from './client.js';
import { handleMessage, broadcastToRoom } from './messageHandler.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const WS_PATH = process.env.WS_PATH || '/ws';
const HOST = process.env.HOST || '0.0.0.0';

// Crear servidor HTTP para health check
const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    const totalClients = getTotalClients();
    const totalRooms = getAllRooms().size;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      rooms: totalRooms,
      clients: totalClients,
      uptime: Math.floor(process.uptime())
    }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// Crear servidor WebSocket
const wss = new WebSocketServer({ 
  server: httpServer,
  path: WS_PATH
});

// Heartbeat: verificar conexiones cada 10 segundos
const HEARTBEAT_INTERVAL = 10000; // 10 segundos
const HEARTBEAT_TIMEOUT = 10000; // 10 segundos sin PING = desconectar

setInterval(() => {
  const now = Date.now();
  
  for (const room of getAllRooms().values()) {
    for (const socket of room.clients) {
      const clientInfo = (socket as any).clientInfo;
      if (clientInfo) {
        const timeSinceLastPing = now - clientInfo.lastPing;
        
        if (timeSinceLastPing > HEARTBEAT_TIMEOUT) {
          console.warn(`⏱️ Timeout de heartbeat para ${clientInfo.playerId}, cerrando conexión`);
          socket.close(1000, 'Heartbeat timeout');
        }
      }
    }
  }
}, HEARTBEAT_INTERVAL);

// Manejar conexiones WebSocket
wss.on('connection', (socket: WebSocket, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const roomId = url.searchParams.get('roomId');
  const playerId = url.searchParams.get('playerId');
  
  // Validar parámetros
  if (!roomId || !playerId) {
    console.warn('⚠️ Conexión rechazada: faltan roomId o playerId');
    socket.close(1008, 'Missing roomId or playerId');
    return;
  }
  
  // Validar formato de roomId (debe empezar con tankblitz-v4-)
  if (!roomId.startsWith('tankblitz-v4-')) {
    console.warn(`⚠️ Conexión rechazada: roomId inválido (${roomId})`);
    socket.close(1008, 'Invalid roomId format');
    return;
  }
  
  // Obtener o crear sala
  const room = getRoom(roomId);
  
  // Verificar si el playerId ya está en la sala
  if (room.clientsById.has(playerId)) {
    const existingSocket = room.clientsById.get(playerId);
    if (existingSocket && existingSocket.readyState === WebSocket.OPEN) {
      console.warn(`⚠️ PlayerId ${playerId} ya está conectado, cerrando conexión anterior`);
      existingSocket.close(1000, 'Replaced by new connection');
    }
    room.clients.delete(existingSocket!);
    room.clientsById.delete(playerId);
  }
  
  // Registrar cliente
  setClientInfo(socket, {
    playerId,
    roomId,
    connectedAt: Date.now(),
    lastPing: Date.now()
  });
  
  room.clients.add(socket);
  room.clientsById.set(playerId, socket);
  
  console.log(`✅ Cliente conectado: ${playerId} en sala ${roomId} (Total: ${room.clients.size})`);
  
  // Manejar mensajes
  socket.on('message', (raw: Buffer) => {
    const currentPlayerId = getPlayerId(socket);
    const currentRoomId = getRoomId(socket);
    
    if (!currentPlayerId || !currentRoomId) {
      console.error('❌ Socket sin información de cliente');
      return;
    }
    
    const currentRoom = getRoom(currentRoomId);
    handleMessage(socket, raw, currentRoom, currentPlayerId);
  });
  
  // Manejar desconexión
  socket.on('close', () => {
    const currentPlayerId = getPlayerId(socket);
    const currentRoomId = getRoomId(socket);
    
    if (currentPlayerId && currentRoomId) {
      const currentRoom = getRoom(currentRoomId);
      
      currentRoom.clients.delete(socket);
      currentRoom.clientsById.delete(currentPlayerId);
      
      console.log(`❌ Cliente desconectado: ${currentPlayerId} de sala ${currentRoomId} (Restantes: ${currentRoom.clients.size})`);
      
      // Notificar a otros jugadores
      if (currentRoom.clients.size > 0) {
        const leaveNotification = {
          type: 'PLAYER_LEFT',
          payload: { playerId: currentPlayerId },
          meta: { peerId: currentPlayerId, timestamp: Date.now() }
        };
        broadcastToRoom(currentRoom, leaveNotification, null);
      }
      
      // Limpiar sala si está vacía
      if (currentRoom.clients.size === 0) {
        console.log(`🗑️ Sala ${currentRoomId} vacía, programando eliminación...`);
        setTimeout(() => {
          const room = getRoom(currentRoomId);
          if (room.clients.size === 0) {
            removeRoom(currentRoomId);
          }
        }, 300000); // 5 minutos
      }
    }
  });
  
  socket.on('error', (error) => {
    const currentPlayerId = getPlayerId(socket);
    console.error(`❌ Error en socket de ${currentPlayerId || 'desconocido'}:`, error);
  });
});

// Iniciar servidor HTTP
httpServer.listen(PORT, HOST, () => {
  console.log(`✅ Servidor HTTP escuchando en http://${HOST}:${PORT}`);
  console.log(`✅ Servidor WebSocket escuchando en ws://${HOST}:${PORT}${WS_PATH}`);
  console.log(`✅ Health check disponible en http://${HOST}:${PORT}/health`);
});

// Manejo de señales para cierre graceful
process.on('SIGTERM', () => {
  console.log('📴 Recibida señal SIGTERM, cerrando servidor...');
  httpServer.close(() => {
    console.log('✅ Servidor cerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📴 Recibida señal SIGINT, cerrando servidor...');
  httpServer.close(() => {
    console.log('✅ Servidor cerrado');
    process.exit(0);
  });
});
