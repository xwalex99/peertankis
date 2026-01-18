/**
 * Tipos TypeScript para el servidor WebSocket de TankisBattle
 */

import WebSocket from 'ws';

export interface GameMessage {
  type: string;
  payload?: any;
  meta?: {
    peerId?: string;
    timestamp?: number;
  };
}

export interface Room {
  roomId: string;
  clients: Set<WebSocket>;
  clientsById: Map<string, WebSocket>;
  gameState?: GameState;
  createdAt: number;
  lastActivity: number;
}

export interface ClientInfo {
  playerId: string;
  roomId: string;
  connectedAt: number;
  lastPing: number;
}

export interface GameState {
  players: Record<string, any>;
  bullets: any[];
  lasers: any[];
  turrets: any[];
  powerups: any[];
  obstacles: any[];
  zoneRadius?: number;
  teamScores?: Record<string, number>;
  timestamp: number;
}

export const ALLOWED_MESSAGE_TYPES = new Set([
  'PING',
  'PONG',
  'SYNC_STATE',
  'TANK_EXPLODED',
  'FIRE',
  'FIRE_BURST',
  'ABILITY_USED',
  'POWERUP_COLLECTED',
  'PLAYER_RESPAWNED',
  'JOIN',
  'REJOIN',
  'SPECIAL_ABILITY_USED',
  'KILLSTREAK_USED',
  'KILLSTREAK_TRIGGERED',
  'KILLSTREAK_EXPLOSION',
  'PLAYER_JOINED',
  'LASER_FIRE',
  'FLOATING_TEXT',
  'HIT_SPARKS',
  'PLAYER_UPDATE',
  'LEAVE',
  'PLAYER_LEFT',
  'CHAT_MESSAGE',
  'QUEUE_TANK_CHANGE',
  'TANK_CHANGE',
  'PEER_LIST'
] as const);

export type MessageType = typeof ALLOWED_MESSAGE_TYPES extends Set<infer T> ? T : never;
