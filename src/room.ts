/**
 * Gestión de salas de juego
 */

import { Room } from './types.js';

const rooms = new Map<string, Room>();

const ROOM_TIMEOUT_MS = 300000; // 5 minutos

/**
 * Obtiene una sala existente o crea una nueva
 */
export function getRoom(roomId: string): Room {
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
    console.log(`📦 Sala creada: ${roomId}`);
  }
  return room;
}

/**
 * Elimina una sala
 */
export function removeRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (room) {
    rooms.delete(roomId);
    console.log(`🗑️ Sala eliminada: ${roomId}`);
  }
}

/**
 * Obtiene todas las salas activas
 */
export function getAllRooms(): Map<string, Room> {
  return rooms;
}

/**
 * Obtiene el número total de clientes en todas las salas
 */
export function getTotalClients(): number {
  return Array.from(rooms.values()).reduce((sum, room) => sum + room.clients.size, 0);
}

/**
 * Limpia salas vacías después del timeout
 */
export function cleanupEmptyRooms(): void {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (room.clients.size === 0 && (now - room.lastActivity) > ROOM_TIMEOUT_MS) {
      removeRoom(roomId);
    }
  }
}

// Ejecutar limpieza cada minuto
setInterval(cleanupEmptyRooms, 60000);
