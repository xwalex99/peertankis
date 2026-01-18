/**
 * Manejo de mensajes WebSocket
 */

import { Room, GameMessage } from './types.js';
import WebSocket from 'ws';
import { isValidMessage, validateJoinPayload, validatePlayerUpdatePayload, validateFirePayload } from './validators.js';
import { getPlayerId, updateLastPing } from './client.js';

// Rate limiting
const MESSAGE_RATE_WINDOW_MS = 1000;
const MESSAGE_RATE_LIMIT = 200;
const MESSAGE_RATE_BLOCK_MS = 4000;

interface RateLimitRecord {
  count: number;
  resetAt: number;
  blockedUntil?: number;
}

const clientMessageCounts = new Map<string, RateLimitRecord>();

/**
 * Verifica el rate limit para un cliente
 */
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

/**
 * Broadcast un mensaje a todos los clientes de una sala
 */
export function broadcastToRoom(room: Room, message: GameMessage, excludeSocket: WebSocket | null = null): void {
  const messageStr = JSON.stringify(message);
  let sent = 0;
  
  for (const client of room.clients) {
    if (client.readyState === WebSocket.OPEN) {
      if (excludeSocket === null || client !== excludeSocket) {
        try {
          client.send(messageStr);
          sent++;
        } catch (error) {
          console.error(`❌ Error enviando mensaje a cliente:`, error);
        }
      }
    }
  }
  
  room.lastActivity = Date.now();
  
  if (sent > 0) {
    console.log(`📤 Broadcast: ${message.type} a ${sent} clientes en sala ${room.roomId}`);
  }
}

/**
 * Maneja un mensaje recibido de un cliente
 */
export function handleMessage(socket: WebSocket, rawMessage: Buffer, room: Room, playerId: string): void {
  let message: GameMessage;
  
  try {
    message = JSON.parse(rawMessage.toString());
  } catch (error) {
    console.error(`❌ Error parseando mensaje de ${playerId}:`, error);
    return;
  }
  
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
    updateLastPing(socket);
    const pongMessage: GameMessage = {
      type: 'PONG',
      payload: { timestamp: message.payload?.timestamp || Date.now() }
    };
    try {
      socket.send(JSON.stringify(pongMessage));
    } catch (error) {
      console.error(`❌ Error enviando PONG a ${playerId}:`, error);
    }
    return;
  }
  
  // JOIN - Nuevo jugador
  if (messageType === 'JOIN' || messageType === 'REJOIN') {
    const payload = message.payload || {};
    
    if (!validateJoinPayload(payload)) {
      console.warn(`⚠️ Payload inválido en JOIN de ${playerId}`);
      return;
    }
    
    const playerInfo = {
      id: payload.id || playerId,
      name: payload.name || 'Jugador',
      tankClass: payload.tankClass || 'STRIKER',
      team: payload.team || 'NONE',
      color: payload.color || '#4a9db8',
      joinedAt: Date.now()
    };
    
    // Broadcast a otros jugadores
    const joinNotification: GameMessage = {
      type: 'PLAYER_JOINED',
      payload: playerInfo,
      meta: { peerId: playerId, timestamp: Date.now() }
    };
    
    broadcastToRoom(room, joinNotification, socket);
    
    // Enviar lista de peers al nuevo jugador
    const peers = Array.from(room.clientsById.keys())
      .filter(id => id !== playerId)
      .map(id => ({ id, joinedAt: Date.now() })); // En producción, guardar joinedAt real
    
    const peerListMessage: GameMessage = {
      type: 'PEER_LIST',
      payload: { peers }
    };
    
    try {
      socket.send(JSON.stringify(peerListMessage));
      console.log(`✅ ${playerId} se unió a la sala ${room.roomId}, ${peers.length} peers existentes`);
    } catch (error) {
      console.error(`❌ Error enviando PEER_LIST a ${playerId}:`, error);
    }
    
    return;
  }
  
  // LEAVE - Jugador abandona
  if (messageType === 'LEAVE') {
    const leaveNotification: GameMessage = {
      type: 'PLAYER_LEFT',
      payload: { playerId },
      meta: { peerId: playerId, timestamp: Date.now() }
    };
    
    broadcastToRoom(room, leaveNotification, socket);
    console.log(`👋 ${playerId} abandonó la sala ${room.roomId}`);
    return;
  }
  
  // Validación adicional para mensajes específicos
  if (messageType === 'PLAYER_UPDATE') {
    if (!validatePlayerUpdatePayload(message.payload)) {
      console.warn(`⚠️ Payload inválido en PLAYER_UPDATE de ${playerId}`);
      return;
    }
  }
  
  if (messageType === 'FIRE') {
    if (!validateFirePayload(message.payload)) {
      console.warn(`⚠️ Payload inválido en FIRE de ${playerId}`);
      return;
    }
  }
  
  // Todos los demás mensajes se broadcastan
  const envelope: GameMessage = {
    ...message,
    meta: {
      ...message.meta,
      peerId: playerId,
      timestamp: Date.now()
    }
  };
  
  // Broadcast a todos los jugadores (incluyendo al emisor para confirmación en algunos casos)
  // Para FIRE, FIRE_BURST, LASER_FIRE incluimos al emisor
  const includeSender = ['FIRE', 'FIRE_BURST', 'LASER_FIRE'].includes(messageType);
  broadcastToRoom(room, envelope, includeSender ? null : socket);
}
