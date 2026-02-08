import type WebSocket from 'ws';

export type RoomStatus = 'waiting' | 'full' | 'countdown' | 'in_match' | 'finished';
export type LobbyErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ALREADY_IN_ROOM'
  | 'INVALID_ROOM_CODE'
  | 'MATCH_ALREADY_STARTED'
  | 'CHARACTER_ALREADY_TAKEN'
  | 'NOT_READY'
  | 'COOLDOWN_ACTIVE'
  | 'INVALID_INPUT'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'VERSION_MISMATCH'
  | 'SERVER_ERROR';

export type CharacterId = 'pyra_blaze' | 'aero_vex' | 'terra_guard' | 'nyra_tide';
export type AbilityId = 'flame_drive' | 'wind_bend' | 'stone_wall' | 'tidal_focus';

export interface ClientToServerMessage {
  type:
    | 'session.hello'
    | 'session.ping'
    | 'lobby.create_private'
    | 'lobby.join_by_code'
    | 'lobby.leave'
    | 'lobby.select_character'
    | 'lobby.ready'
    | 'lobby.rematch_vote'
    | 'match.input'
    | 'ability.activate';
  payload?: Record<string, unknown>;
}

export interface ServerMessage {
  type:
    | 'session.welcome'
    | 'session.pong'
    | 'lobby.room_created'
    | 'lobby.room_state'
    | 'lobby.error'
    | 'match.countdown'
    | 'match.started'
    | 'match.state_snapshot'
    | 'match.point_result'
    | 'match.score_update'
    | 'ability.result'
    | 'match.finished'
    | 'match.resync_snapshot';
  payload: Record<string, unknown>;
}

export interface PlayerState {
  playerId: string;
  name: string;
  slot: 1 | 2;
  ready: boolean;
  characterId: CharacterId | null;
  connected: boolean;
  reconnectUntil: number;
  socket?: WebSocket;
  lastSeq: number;
  moveX: number;
  moveZ: number;
  abilityCooldownUntil: number;
  pingMs: number;
  rematchVote: boolean;
}

export interface MatchState {
  startedAt: number;
  tick: number;
  ball: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    spin: number;
  };
  countdownUntil?: number;
  score: {
    points: [number, number];
    games: [number, number];
    sets: [number, number];
    serverSlot: 1 | 2;
  };
}

export interface Room {
  roomId: string;
  roomCode: string;
  status: RoomStatus;
  createdAt: number;
  updatedAt: number;
  players: Map<string, PlayerState>;
  bySlot: Map<1 | 2, string>;
  match?: MatchState;
}

export interface EnvConfig {
  PORT: number;
  HOST: string;
  WS_PATH: string;
  NET_TICK_RATE: number;
  NET_SNAPSHOT_RATE: number;
  NET_INPUT_RATE: number;
  ROOM_CODE_LENGTH: number;
  ROOM_IDLE_CLOSE_SEC: number;
  READY_TIMEOUT_SEC: number;
  RECONNECT_GRACE_SEC: number;
  MAX_PLAYERS_PER_ROOM: number;
  TIEBREAK_POINTS: number;
  MAX_PING_MS_WARN: number;
  MAX_PING_MS_KICK: number;
  ANTI_CHEAT_INPUT_DELTA_MAX: number;
  SERVER_AUTHORITATIVE: boolean;
  VERSION: string;
}
