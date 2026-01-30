/**
 * Ejemplo de implementación del servidor WebSocket para TankisBattle
 * 
 * Este es un ejemplo de referencia. Adapta según tu stack tecnológico.
 */

import WebSocket, { WebSocketServer } from 'ws';

// ============== TIPOS ==============

interface Room {
  roomId: string;
  clients: Set<WebSocket>;
  clientsById: Map<string, WebSocket>;
  createdAt: number;
  lastActivity: number;
}

interface ClientInfo {
  playerId: string;
  roomId: string;
  connectedAt: number;
  lastPing: number;
}

// ============== GESTIÓN DE SALAS ==============

const rooms = new Map<string, Room>();

function getRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      roomId,
      clients: new Set(),
      clientsById: new Map(),
      createdAt: Date.now(),
      lastActivity: Date.now()
    };
    rooms.set(roomId, room);
  }
  return room;
}

function removeRoom(roomId: string) {
  rooms.delete(roomId);
}

// ============== VALIDACIÓN ==============

const ALLOWED_MESSAGE_TYPES = new Set([
  'PING', 'PONG', 'SYNC_STATE', 'TANK_EXPLODED', 'FIRE', 'FIRE_BURST',
  'ABILITY_USED', 'POWERUP_COLLECTED', 'PLAYER_RESPAWNED', 'JOIN', 'REJOIN',
  'SPECIAL_ABILITY_USED', 'KILLSTREAK_USED', 'KILLSTREAK_TRIGGERED',
  'KILLSTREAK_EXPLOSION', 'PLAYER_JOINED', 'LASER_FIRE', 'FLOATING_TEXT',
  'HIT_SPARKS', 'PLAYER_UPDATE', 'LEAVE', 'PLAYER_LEFT', 'CHAT_MESSAGE',
  'QUEUE_TANK_CHANGE', 'TANK_CHANGE'
]);

function isValidMessage(message: any): boolean {
  return message && 
         typeof message.type === 'string' && 
         ALLOWED_MESSAGE_TYPES.has(message.type);
}

// ============== RATE LIMITING ==============

const MESSAGE_RATE_WINDOW_MS = 1000;
const MESSAGE_RATE_LIMIT = 200;
const MESSAGE_RATE_BLOCK_MS = 4000;

const clientMessageCounts = new Map<string, { count: number; resetAt: number; blockedUntil?: number }>();

function checkRateLimit(playerId: string): boolean {
  const now = Date.now();
  let record = clientMessageCounts.get(playerId);
  
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + MESSAGE_RATE_WINDOW_MS };
    clientMessageCounts.set(playerId, record);
  }
  
  if (record.blockedUntil && now < record.blockedUntil) {
    return false; // Bloqueado
  }
  
  if (record.blockedUntil && now >= record.blockedUntil) {
    record.blockedUntil = undefined;
    record.count = 0;
    record.resetAt = now + MESSAGE_RATE_WINDOW_MS;
  }
  
  record.count++;
  
  if (record.count > MESSAGE_RATE_LIMIT) {
    record.blockedUntil = now + MESSAGE_RATE_BLOCK_MS;
    console.warn(`⚠️ Rate limit excedido para ${playerId}, bloqueado por ${MESSAGE_RATE_BLOCK_MS}ms`);
    return false;
  }
  
  return true;
}

// ============== MANEJO DE MENSAJES ==============

function handleMessage(socket: WebSocket, message: any, room: Room, playerId: string) {
  if (!isValidMessage(message)) {
    console.warn(`⚠️ Mensaje inválido de ${playerId}:`, message);
    return;
  }
  
  if (!checkRateLimit(playerId)) {
    return; // Ignorar mensaje por rate limit
  }
  
  const messageType = message.type;
  
  // Heartbeat
  if (messageType === 'PING') {
    socket.send(JSON.stringify({ type: 'PONG', timestamp: message.timestamp || Date.now() }));
    return;
  }
  
  // JOIN - Nuevo jugador
  if (messageType === 'JOIN' || messageType === 'REJOIN') {
    const payload = message.payload || {};
    const playerInfo = {
      id: payload.id || playerId,
      name: payload.name || 'Jugador',
      tankClass: payload.tankClass || 'STRIKER',
      team: payload.team || 'NONE',
      color: payload.color || '#4a9db8',
      joinedAt: Date.now()
    };
    
    // Broadcast a otros jugadores
    const joinNotification = {
      type: 'PLAYER_JOINED',
      payload: playerInfo,
      meta: { peerId: playerId }
    };
    
    broadcastToRoom(room, joinNotification, socket);
    
    // Enviar lista de peers al nuevo jugador
    const peers = Array.from(room.clientsById.keys())
      .filter(id => id !== playerId)
      .map(id => ({ id, joinedAt: Date.now() })); // En producción, guardar joinedAt real
    
    socket.send(JSON.stringify({
      type: 'PEER_LIST',
      payload: { peers }
    }));
    
    return;
  }
  
  // LEAVE - Jugador abandona
  if (messageType === 'LEAVE') {
    const leaveNotification = {
      type: 'PLAYER_LEFT',
      payload: { playerId },
      meta: { peerId: playerId }
    };
    
    broadcastToRoom(room, leaveNotification, socket);
    return;
  }
  
  // Todos los demás mensajes se broadcastan
  const envelope = {
    ...message,
    meta: {
      peerId: playerId,
      timestamp: Date.now()
    }
  };
  
  // Broadcast a todos los jugadores (incluyendo al emisor para confirmación)
  broadcastToRoom(room, envelope, null);
}

// ============== BROADCAST ==============

function broadcastToRoom(room: Room, message: any, excludeSocket: WebSocket | null) {
  const messageStr = JSON.stringify(message);
  let sent = 0;
  
  for (const client of room.clients) {
    if (client.readyState === WebSocket.OPEN) {
      if (client !== excludeSocket) {
        try {
          client.send(messageStr);
          sent++;
        } catch (error) {
          console.error(`❌ Error enviando a cliente:`, error);
        }
      }
    }
  }
  
  room.lastActivity = Date.now();
}

// ============== SERVIDOR ==============

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const wss = new WebSocketServer({ port: PORT, path: '/ws' });

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
  
  // Obtener o crear sala
  const room = getRoom(roomId);
  
  // Registrar cliente
  (socket as any).playerId = playerId;
  (socket as any).roomId = roomId;
  (socket as any).connectedAt = Date.now();
  (socket as any).lastPing = Date.now();
  
  room.clients.add(socket);
  room.clientsById.set(playerId, socket);
  
  console.log(`✅ Cliente conectado: ${playerId} en sala ${roomId} (Total: ${room.clients.size})`);
  
  // Manejar mensajes
  socket.on('message', (raw: Buffer) => {
    try {
      const message = JSON.parse(raw.toString());
      handleMessage(socket, message, room, playerId);
    } catch (error) {
      console.error(`❌ Error parseando mensaje de ${playerId}:`, error);
    }
  });
  
  // Manejar desconexión
  socket.on('close', () => {
    room.clients.delete(socket);
    room.clientsById.delete(playerId);
    
    console.log(`❌ Cliente desconectado: ${playerId} de sala ${roomId} (Restantes: ${room.clients.size})`);
    
    // Notificar a otros jugadores
    if (room.clients.size > 0) {
      const leaveNotification = {
        type: 'PLAYER_LEFT',
        payload: { playerId },
        meta: { peerId: playerId }
      };
      broadcastToRoom(room, leaveNotification, null);
    }
    
    // Limpiar sala si está vacía
    if (room.clients.size === 0) {
      console.log(`🗑️ Sala ${roomId} vacía, eliminando...`);
      setTimeout(() => {
        if (rooms.get(roomId)?.clients.size === 0) {
          removeRoom(roomId);
        }
      }, 300000); // 5 minutos
    }
  });
  
  socket.on('error', (error) => {
    console.error(`❌ Error en socket de ${playerId}:`, error);
  });
});

// ============== HEALTH CHECK ==============

import { createServer } from 'http';

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    const totalClients = Array.from(rooms.values()).reduce((sum, room) => sum + room.clients.size, 0);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      rooms: rooms.size,
      clients: totalClients,
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

httpServer.listen(PORT + 1, () => {
  console.log(`✅ Health check en http://localhost:${PORT + 1}/health`);
});

// ============== INICIO ==============

console.log(`✅ Servidor WebSocket escuchando en ws://localhost:${PORT}/ws`);
