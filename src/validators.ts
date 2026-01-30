/**
 * Validación de mensajes
 */

import { GameMessage, ALLOWED_MESSAGE_TYPES } from './types.js';

/**
 * Valida que un mensaje tenga la estructura correcta
 */
export function isValidMessage(message: any): message is GameMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }
  
  if (typeof message.type !== 'string') {
    return false;
  }
  
  if (!ALLOWED_MESSAGE_TYPES.has(message.type)) {
    return false;
  }
  
  return true;
}

/**
 * Valida el payload de un mensaje JOIN/REJOIN
 */
export function validateJoinPayload(payload: any): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  
  // El ID es opcional (se puede usar el playerId de la URL)
  // Pero si está presente, debe ser string
  if (payload.id !== undefined && typeof payload.id !== 'string') {
    return false;
  }
  
  return true;
}

/**
 * Valida el payload de un mensaje PLAYER_UPDATE
 */
export function validatePlayerUpdatePayload(payload: any): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  
  if (typeof payload.id !== 'string') {
    return false;
  }
  
  // Validar posición
  if (payload.pos && (typeof payload.pos.x !== 'number' || typeof payload.pos.y !== 'number')) {
    return false;
  }
  
  // Validar ángulos
  if (payload.angle !== undefined && typeof payload.angle !== 'number') {
    return false;
  }
  
  if (payload.turretAngle !== undefined && typeof payload.turretAngle !== 'number') {
    return false;
  }
  
  // Validar salud y munición
  if (payload.health !== undefined && (typeof payload.health !== 'number' || payload.health < 0)) {
    return false;
  }
  
  if (payload.ammo !== undefined && (typeof payload.ammo !== 'number' || payload.ammo < 0)) {
    return false;
  }
  
  return true;
}

/**
 * Valida el payload de un mensaje FIRE
 */
export function validateFirePayload(payload: any): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  
  if (typeof payload.id !== 'string') {
    return false;
  }
  
  if (typeof payload.playerId !== 'string') {
    return false;
  }
  
  if (!payload.pos || typeof payload.pos.x !== 'number' || typeof payload.pos.y !== 'number') {
    return false;
  }
  
  if (!payload.velocity || typeof payload.velocity.x !== 'number' || typeof payload.velocity.y !== 'number') {
    return false;
  }
  
  if (typeof payload.angle !== 'number') {
    return false;
  }
  
  if (typeof payload.damage !== 'number' || payload.damage < 0) {
    return false;
  }
  
  return true;
}
