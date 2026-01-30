/**
 * Gestión de clientes WebSocket
 */

import { ClientInfo } from './types.js';
import WebSocket from 'ws';

/**
 * Obtiene la información del cliente desde el socket
 */
export function getClientInfo(socket: WebSocket): ClientInfo | null {
  const info = (socket as any).clientInfo as ClientInfo | undefined;
  return info || null;
}

/**
 * Establece la información del cliente en el socket
 */
export function setClientInfo(socket: WebSocket, info: ClientInfo): void {
  (socket as any).clientInfo = info;
}

/**
 * Obtiene el playerId del socket
 */
export function getPlayerId(socket: WebSocket): string | null {
  const info = getClientInfo(socket);
  return info?.playerId || null;
}

/**
 * Obtiene el roomId del socket
 */
export function getRoomId(socket: WebSocket): string | null {
  const info = getClientInfo(socket);
  return info?.roomId || null;
}

/**
 * Actualiza el último ping del cliente
 */
export function updateLastPing(socket: WebSocket): void {
  const info = getClientInfo(socket);
  if (info) {
    info.lastPing = Date.now();
  }
}
