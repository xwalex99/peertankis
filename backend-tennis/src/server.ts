import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  AbilityId,
  CharacterId,
  ClientToServerMessage,
  EnvConfig,
  LobbyErrorCode,
  MatchState,
  PlayerState,
  Room,
  ServerMessage
} from './types.js';

const cfg: EnvConfig = {
  PORT: parseInt(process.env.PORT || '8080', 10),
  HOST: process.env.HOST || '0.0.0.0',
  WS_PATH: process.env.WS_PATH || '/ws',
  NET_TICK_RATE: parseInt(process.env.NET_TICK_RATE || '60', 10),
  NET_SNAPSHOT_RATE: parseInt(process.env.NET_SNAPSHOT_RATE || '20', 10),
  NET_INPUT_RATE: parseInt(process.env.NET_INPUT_RATE || '30', 10),
  ROOM_CODE_LENGTH: parseInt(process.env.ROOM_CODE_LENGTH || '6', 10),
  ROOM_IDLE_CLOSE_SEC: parseInt(process.env.ROOM_IDLE_CLOSE_SEC || '300', 10),
  READY_TIMEOUT_SEC: parseInt(process.env.READY_TIMEOUT_SEC || '90', 10),
  RECONNECT_GRACE_SEC: parseInt(process.env.RECONNECT_GRACE_SEC || '20', 10),
  MAX_PLAYERS_PER_ROOM: parseInt(process.env.MAX_PLAYERS_PER_ROOM || '2', 10),
  TIEBREAK_POINTS: parseInt(process.env.TIEBREAK_POINTS || '7', 10),
  MAX_PING_MS_WARN: parseInt(process.env.MAX_PING_MS_WARN || '160', 10),
  MAX_PING_MS_KICK: parseInt(process.env.MAX_PING_MS_KICK || '450', 10),
  ANTI_CHEAT_INPUT_DELTA_MAX: parseFloat(process.env.ANTI_CHEAT_INPUT_DELTA_MAX || '1.0'),
  SERVER_AUTHORITATIVE: (process.env.SERVER_AUTHORITATIVE || 'true') === 'true',
  VERSION: process.env.BACKEND_VERSION || '1.0.0'
};

const CHARACTER_TO_ABILITY: Record<CharacterId, AbilityId> = {
  pyra_blaze: 'flame_drive',
  aero_vex: 'wind_bend',
  terra_guard: 'stone_wall',
  nyra_tide: 'tidal_focus'
};

const roomsByCode = new Map<string, Room>();
const roomByPlayerId = new Map<string, string>();
const messageRate = new Map<string, { count: number; resetAt: number }>();

function now(): number {
  return Date.now();
}

function touch(room: Room): void {
  room.updatedAt = now();
}

function send(socket: WebSocket | undefined, message: ServerMessage): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(message));
}

function roomStatePayload(room: Room): Record<string, unknown> {
  return {
    roomId: room.roomId,
    roomCode: room.roomCode,
    status: room.status,
    players: [...room.players.values()]
      .sort((a, b) => a.slot - b.slot)
      .map((p) => ({
        playerId: p.playerId,
        name: p.name,
        slot: p.slot,
        ready: p.ready,
        characterId: p.characterId
      }))
  };
}

function snapshotPayload(room: Room): Record<string, unknown> {
  const match = room.match!;
  return {
    tick: match.tick,
    ball: match.ball,
    players: [...room.players.values()].map((p) => ({
      playerId: p.playerId,
      x: Number((p.moveX * 5).toFixed(3)),
      z: Number((p.moveZ * 5).toFixed(3)),
      abilityCooldownMs: Math.max(0, p.abilityCooldownUntil - now())
    })),
    score: {
      sets: [match.score.sets[0], match.score.sets[1]],
      games: [match.score.games[0], match.score.games[1]],
      points: [toTennisPoint(match.score.points[0]), toTennisPoint(match.score.points[1])],
      serverPlayerId: room.bySlot.get(match.score.serverSlot)
    }
  };
}

function emitRoomState(room: Room): void {
  const msg: ServerMessage = { type: 'lobby.room_state', payload: roomStatePayload(room) };
  for (const p of room.players.values()) {
    send(p.socket, msg);
  }
  touch(room);
}

function emitLobbyError(socket: WebSocket | undefined, code: LobbyErrorCode, message: string): void {
  send(socket, { type: 'lobby.error', payload: { code, message } });
}

function validRoomCode(code: string): boolean {
  return new RegExp(`^[A-Z0-9]{${cfg.ROOM_CODE_LENGTH}}$`).test(code);
}

function createRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  while (true) {
    let out = '';
    for (let i = 0; i < cfg.ROOM_CODE_LENGTH; i += 1) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!roomsByCode.has(out)) {
      return out;
    }
  }
}

function createMatch(): MatchState {
  return {
    startedAt: now(),
    tick: 0,
    ball: { x: 0, y: 1, z: 0, vx: 0.02, vy: 0, vz: 0.03, spin: 0 },
    score: { points: [0, 0], games: [0, 0], sets: [0, 0], serverSlot: 1 }
  };
}

function toTennisPoint(raw: number): string {
  if (raw <= 0) return '0';
  if (raw === 1) return '15';
  if (raw === 2) return '30';
  if (raw === 3) return '40';
  return 'AD';
}

function isOverInSet(games: [number, number], tiebreakPoints: [number, number]): 0 | 1 | null {
  if (games[0] >= 6 || games[1] >= 6) {
    const d = Math.abs(games[0] - games[1]);
    if ((games[0] >= 6 || games[1] >= 6) && d >= 2) {
      return games[0] > games[1] ? 0 : 1;
    }
    if (games[0] === 6 && games[1] === 6) {
      if ((tiebreakPoints[0] >= cfg.TIEBREAK_POINTS || tiebreakPoints[1] >= cfg.TIEBREAK_POINTS) && Math.abs(tiebreakPoints[0] - tiebreakPoints[1]) >= 2) {
        return tiebreakPoints[0] > tiebreakPoints[1] ? 0 : 1;
      }
    }
  }
  return null;
}

function awardPoint(room: Room, winnerSlot: 1 | 2): void {
  const m = room.match;
  if (!m) return;
  const i = winnerSlot === 1 ? 0 : 1;
  const j = i === 0 ? 1 : 0;
  const inTiebreak = m.score.games[0] === 6 && m.score.games[1] === 6;

  if (inTiebreak) {
    m.score.points[i] += 1;
  } else {
    const a = m.score.points[i];
    const b = m.score.points[j];
    if (a <= 2) {
      m.score.points[i] += 1;
    } else if (a === 3 && b <= 2) {
      m.score.points[i] = 4;
    } else if (a === 3 && b === 3) {
      m.score.points[i] = 4;
    } else if (a === 4) {
      m.score.points[i] = 5;
    } else if (b === 4) {
      m.score.points[j] = 3;
    }
  }

  let gameWon = false;
  if (inTiebreak) {
    if ((m.score.points[i] >= cfg.TIEBREAK_POINTS && m.score.points[i] - m.score.points[j] >= 2)) {
      gameWon = true;
    }
  } else {
    if ((m.score.points[i] >= 4 && m.score.points[i] - m.score.points[j] >= 2) || m.score.points[i] >= 5) {
      gameWon = true;
    }
  }

  if (gameWon) {
    m.score.games[i] += 1;
    m.score.points = [0, 0];
    m.score.serverSlot = m.score.serverSlot === 1 ? 2 : 1;
  }

  const setWinner = isOverInSet([m.score.games[0], m.score.games[1]], [m.score.points[0], m.score.points[1]]);
  if (setWinner !== null) {
    m.score.sets[setWinner] += 1;
    m.score.games = [0, 0];
    m.score.points = [0, 0];
  }

  const finished = m.score.sets[0] >= 2 || m.score.sets[1] >= 2;
  for (const p of room.players.values()) {
    send(p.socket, { type: 'match.point_result', payload: { winnerPlayerId: room.bySlot.get(winnerSlot), serverPlayerId: room.bySlot.get(m.score.serverSlot) } });
    send(p.socket, { type: 'match.score_update', payload: snapshotPayload(room).score as Record<string, unknown> });
    if (finished) {
      room.status = 'finished';
      send(p.socket, { type: 'match.finished', payload: { winnerPlayerId: m.score.sets[0] > m.score.sets[1] ? room.bySlot.get(1) : room.bySlot.get(2), reason: 'match_complete' } });
    }
  }
}

function parseJson(raw: WebSocket.RawData): ClientToServerMessage | null {
  try {
    const p = JSON.parse(raw.toString()) as ClientToServerMessage;
    if (typeof p?.type !== 'string') return null;
    return p;
  } catch {
    return null;
  }
}

function checkRate(playerId: string): boolean {
  const t = now();
  const r = messageRate.get(playerId) ?? { count: 0, resetAt: t + 1000 };
  if (t > r.resetAt) {
    r.count = 0;
    r.resetAt = t + 1000;
  }
  r.count += 1;
  messageRate.set(playerId, r);
  return r.count <= 120;
}

const httpServer = createServer((req, res) => {
  const path = (req.url || '').split('?')[0];
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: roomsByCode.size, uptimeSec: Math.floor(process.uptime()) }));
    return;
  }
  if (path === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ws: cfg.WS_PATH, version: cfg.VERSION }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

const wss = new WebSocketServer({ server: httpServer, path: cfg.WS_PATH });

wss.on('connection', (socket) => {
  (socket as WebSocket & { isAlive?: boolean }).isAlive = true;
  let currentPlayerId: string | null = null;

  socket.on('pong', () => {
    (socket as WebSocket & { isAlive?: boolean }).isAlive = true;
  });

  socket.on('message', (raw) => {
    const msg = parseJson(raw);
    if (!msg) {
      emitLobbyError(socket, 'INVALID_INPUT', 'Mensaje invalido');
      return;
    }

    if (currentPlayerId && !checkRate(currentPlayerId)) {
      emitLobbyError(socket, 'RATE_LIMITED', 'Demasiados mensajes por segundo');
      return;
    }

    if (msg.type === 'session.hello') {
      const p = (msg.payload || {}) as Record<string, unknown>;
      const playerId = String(p.playerId || randomUUID());
      currentPlayerId = playerId;
      const playerRoomCode = roomByPlayerId.get(playerId);
      const room = playerRoomCode ? roomsByCode.get(playerRoomCode) : undefined;
      send(socket, { type: 'session.welcome', payload: { playerId, serverTime: now(), net: { tickRate: cfg.NET_TICK_RATE, snapshotRate: cfg.NET_SNAPSHOT_RATE, inputRate: cfg.NET_INPUT_RATE }, reconnectGraceSec: cfg.RECONNECT_GRACE_SEC } });
      if (room && room.match && room.status === 'in_match') {
        const player = room.players.get(playerId);
        if (player) {
          player.socket = socket;
          player.connected = true;
          send(socket, { type: 'match.resync_snapshot', payload: { room: roomStatePayload(room), snapshot: snapshotPayload(room) } });
        }
      }
      return;
    }

    if (msg.type === 'session.ping') {
      const sentAt = Number((msg.payload || {}).sentAt || now());
      const ms = Math.max(0, now() - sentAt);
      if (currentPlayerId) {
        const rc = roomByPlayerId.get(currentPlayerId);
        if (rc) {
          const room = roomsByCode.get(rc);
          const pl = room?.players.get(currentPlayerId);
          if (pl) pl.pingMs = ms;
          if (ms >= cfg.MAX_PING_MS_KICK && pl?.socket) {
            emitLobbyError(pl.socket, 'UNAUTHORIZED', 'Ping demasiado alto sostenido');
            pl.socket.close(1008, 'high_ping');
          }
        }
      }
      send(socket, { type: 'session.pong', payload: { serverTime: now(), pingMs: ms, warn: ms >= cfg.MAX_PING_MS_WARN } });
      return;
    }

    if (!currentPlayerId) {
      emitLobbyError(socket, 'UNAUTHORIZED', 'Debes enviar session.hello primero');
      return;
    }

    if (msg.type === 'lobby.create_private') {
      if (roomByPlayerId.has(currentPlayerId)) {
        emitLobbyError(socket, 'ALREADY_IN_ROOM', 'Ya estas en una sala');
        return;
      }
      const code = createRoomCode();
      const room: Room = {
        roomId: randomUUID(),
        roomCode: code,
        status: 'waiting',
        createdAt: now(),
        updatedAt: now(),
        players: new Map(),
        bySlot: new Map()
      };
      const player: PlayerState = {
        playerId: currentPlayerId,
        name: String((msg.payload || {}).name || 'Player 1'),
        slot: 1,
        ready: false,
        characterId: null,
        connected: true,
        reconnectUntil: 0,
        socket,
        lastSeq: -1,
        moveX: 0,
        moveZ: 0,
        abilityCooldownUntil: 0,
        pingMs: 0,
        rematchVote: false
      };
      room.players.set(currentPlayerId, player);
      room.bySlot.set(1, currentPlayerId);
      roomsByCode.set(code, room);
      roomByPlayerId.set(currentPlayerId, code);
      touch(room);
      send(socket, { type: 'lobby.room_created', payload: { roomId: room.roomId, roomCode: room.roomCode } });
      emitRoomState(room);
      return;
    }

    if (msg.type === 'lobby.join_by_code') {
      const code = String((msg.payload || {}).roomCode || '').toUpperCase();
      if (!validRoomCode(code)) {
        emitLobbyError(socket, 'INVALID_ROOM_CODE', 'Codigo no valido');
        return;
      }
      const room = roomsByCode.get(code);
      if (!room) {
        emitLobbyError(socket, 'ROOM_NOT_FOUND', 'Codigo no valido');
        return;
      }
      if (roomByPlayerId.has(currentPlayerId) && roomByPlayerId.get(currentPlayerId) !== code) {
        emitLobbyError(socket, 'ALREADY_IN_ROOM', 'Ya estas en una sala');
        return;
      }

      const existing = room.players.get(currentPlayerId);
      if (existing) {
        existing.connected = true;
        existing.socket = socket;
        existing.reconnectUntil = 0;
        emitRoomState(room);
        if (room.match && room.status === 'in_match') {
          send(socket, { type: 'match.resync_snapshot', payload: { room: roomStatePayload(room), snapshot: snapshotPayload(room) } });
        }
        return;
      }

      if (room.players.size >= cfg.MAX_PLAYERS_PER_ROOM) {
        emitLobbyError(socket, 'ROOM_FULL', 'Sala completa');
        return;
      }
      const slot: 1 | 2 = room.bySlot.has(1) ? 2 : 1;
      const p: PlayerState = {
        playerId: currentPlayerId,
        name: String((msg.payload || {}).name || `Player ${slot}`),
        slot,
        ready: false,
        characterId: null,
        connected: true,
        reconnectUntil: 0,
        socket,
        lastSeq: -1,
        moveX: 0,
        moveZ: 0,
        abilityCooldownUntil: 0,
        pingMs: 0,
        rematchVote: false
      };
      room.players.set(currentPlayerId, p);
      room.bySlot.set(slot, currentPlayerId);
      roomByPlayerId.set(currentPlayerId, code);
      room.status = room.players.size >= 2 ? 'full' : 'waiting';
      touch(room);
      emitRoomState(room);
      return;
    }

    const code = roomByPlayerId.get(currentPlayerId);
    const room = code ? roomsByCode.get(code) : undefined;
    if (!room) {
      emitLobbyError(socket, 'ROOM_NOT_FOUND', 'No estas en una sala');
      return;
    }
    const player = room.players.get(currentPlayerId);
    if (!player) {
      emitLobbyError(socket, 'UNAUTHORIZED', 'Jugador no registrado en sala');
      return;
    }

    if (msg.type === 'lobby.leave') {
      room.players.delete(currentPlayerId);
      room.bySlot.delete(player.slot);
      roomByPlayerId.delete(currentPlayerId);
      room.status = room.players.size === 0 ? 'waiting' : room.players.size === 1 ? 'waiting' : room.status;
      touch(room);
      emitRoomState(room);
      if (room.players.size === 0) {
        roomsByCode.delete(room.roomCode);
      }
      return;
    }

    if (msg.type === 'lobby.select_character') {
      const characterId = String((msg.payload || {}).characterId || '') as CharacterId;
      if (!Object.keys(CHARACTER_TO_ABILITY).includes(characterId)) {
        emitLobbyError(socket, 'INVALID_INPUT', 'Personaje invalido');
        return;
      }
      for (const p of room.players.values()) {
        if (p.playerId !== player.playerId && p.characterId === characterId) {
          emitLobbyError(socket, 'CHARACTER_ALREADY_TAKEN', 'Personaje ya elegido');
          return;
        }
      }
      player.characterId = characterId;
      touch(room);
      emitRoomState(room);
      return;
    }

    if (msg.type === 'lobby.ready') {
      player.ready = Boolean((msg.payload || {}).ready ?? true);
      touch(room);
      emitRoomState(room);
      const readyPlayers = [...room.players.values()].filter((p) => p.ready && p.characterId).length;
      if (room.players.size === 2 && readyPlayers === 2 && room.status !== 'in_match') {
        room.status = 'countdown';
        const endAt = now() + 3000;
        for (const p of room.players.values()) {
          send(p.socket, { type: 'match.countdown', payload: { startsInMs: 3000, startAt: endAt } });
        }
        setTimeout(() => {
          room.status = 'in_match';
          room.match = createMatch();
          touch(room);
          for (const p of room.players.values()) {
            send(p.socket, { type: 'match.started', payload: { startedAt: room.match.startedAt } });
          }
        }, 3000);
      }
      return;
    }

    if (msg.type === 'lobby.rematch_vote') {
      player.rematchVote = Boolean((msg.payload || {}).vote ?? true);
      const allVotes = [...room.players.values()].every((p) => p.rematchVote);
      if (allVotes && room.players.size === 2) {
        for (const p of room.players.values()) {
          p.ready = false;
          p.rematchVote = false;
        }
        room.status = 'waiting';
        room.match = undefined;
        touch(room);
        emitRoomState(room);
      }
      return;
    }

    if (msg.type === 'match.input') {
      if (room.status !== 'in_match' || !room.match) {
        emitLobbyError(socket, 'MATCH_ALREADY_STARTED', 'La partida no esta activa');
        return;
      }
      const payload = (msg.payload || {}) as Record<string, unknown>;
      const seq = Number(payload.seq ?? -1);
      const moveX = Number(payload.moveX ?? 0);
      const moveZ = Number(payload.moveZ ?? 0);
      const power = Number(payload.power ?? 0);
      const spin = Number(payload.spin ?? 0);

      if (seq <= player.lastSeq) {
        emitLobbyError(socket, 'INVALID_INPUT', 'Seq duplicada o antigua');
        return;
      }
      if (Math.abs(moveX) > 1 || Math.abs(moveZ) > 1 || power < 0 || power > 1 || spin < -1 || spin > 1) {
        emitLobbyError(socket, 'INVALID_INPUT', 'Input fuera de rango');
        return;
      }
      if (Math.abs(moveX - player.moveX) > cfg.ANTI_CHEAT_INPUT_DELTA_MAX || Math.abs(moveZ - player.moveZ) > cfg.ANTI_CHEAT_INPUT_DELTA_MAX) {
        emitLobbyError(socket, 'INVALID_INPUT', 'Delta de input invalido');
        return;
      }

      player.lastSeq = seq;
      player.moveX = moveX;
      player.moveZ = moveZ;
      room.match.ball.spin = spin;
      touch(room);
      if (power > 0.95) {
        awardPoint(room, player.slot);
      }
      return;
    }

    if (msg.type === 'ability.activate') {
      if (!player.characterId) {
        emitLobbyError(socket, 'INVALID_INPUT', 'Selecciona un personaje primero');
        return;
      }
      const t = now();
      if (player.abilityCooldownUntil > t) {
        emitLobbyError(socket, 'COOLDOWN_ACTIVE', 'Habilidad en cooldown');
        return;
      }
      const requested = String((msg.payload || {}).abilityId || '');
      const expected = CHARACTER_TO_ABILITY[player.characterId];
      if (requested !== expected) {
        emitLobbyError(socket, 'INVALID_INPUT', 'Habilidad no corresponde al personaje');
        return;
      }
      player.abilityCooldownUntil = t + 12000;
      touch(room);
      for (const p of room.players.values()) {
        send(p.socket, {
          type: 'ability.result',
          payload: { playerId: player.playerId, abilityId: expected, applied: true, cooldownMs: 12000 }
        });
      }
      return;
    }
  });

  socket.on('close', () => {
    if (!currentPlayerId) return;
    const roomCode = roomByPlayerId.get(currentPlayerId);
    if (!roomCode) return;
    const room = roomsByCode.get(roomCode);
    if (!room) return;
    const p = room.players.get(currentPlayerId);
    if (!p) return;

    p.connected = false;
    p.socket = undefined;
    p.reconnectUntil = now() + cfg.RECONNECT_GRACE_SEC * 1000;
    touch(room);

    setTimeout(() => {
      const r = roomsByCode.get(roomCode);
      const pl = r?.players.get(currentPlayerId);
      if (!r || !pl) return;
      if (!pl.connected && pl.reconnectUntil <= now()) {
        const rival = [...r.players.values()].find((x) => x.playerId !== currentPlayerId);
        if (rival?.socket && r.status === 'in_match') {
          send(rival.socket, { type: 'match.finished', payload: { winnerPlayerId: rival.playerId, reason: 'opponent_abandoned' } });
        }
        r.players.delete(currentPlayerId);
        r.bySlot.delete(pl.slot);
        roomByPlayerId.delete(currentPlayerId);
        if (r.players.size === 0) {
          roomsByCode.delete(roomCode);
        } else {
          touch(r);
          emitRoomState(r);
        }
      }
    }, cfg.RECONNECT_GRACE_SEC * 1000 + 250);
  });
});

setInterval(() => {
  for (const client of wss.clients) {
    const tracked = client as WebSocket & { isAlive?: boolean };
    if (tracked.isAlive === false) {
      client.terminate();
      continue;
    }
    tracked.isAlive = false;
    client.ping();
  }
}, 5000);

setInterval(() => {
  for (const room of roomsByCode.values()) {
    if (room.status !== 'in_match' || !room.match) continue;
    room.match.tick += 1;
    room.match.ball.x += room.match.ball.vx;
    room.match.ball.y = Math.max(0.4, room.match.ball.y + room.match.ball.vy);
    room.match.ball.z += room.match.ball.vz;
    if (Math.abs(room.match.ball.x) > 9) room.match.ball.vx *= -1;
    if (Math.abs(room.match.ball.z) > 17) room.match.ball.vz *= -1;
  }
}, Math.max(1, Math.floor(1000 / cfg.NET_TICK_RATE)));

setInterval(() => {
  for (const room of roomsByCode.values()) {
    if (room.status !== 'in_match' || !room.match) continue;
    const payload = snapshotPayload(room);
    for (const p of room.players.values()) {
      send(p.socket, { type: 'match.state_snapshot', payload });
    }
  }
}, Math.max(1, Math.floor(1000 / cfg.NET_SNAPSHOT_RATE)));

setInterval(() => {
  const idleLimit = cfg.ROOM_IDLE_CLOSE_SEC * 1000;
  const t = now();
  for (const room of roomsByCode.values()) {
    const allDisconnected = [...room.players.values()].every((p) => !p.connected);
    if (allDisconnected && t - room.updatedAt > idleLimit) {
      roomsByCode.delete(room.roomCode);
    }
  }
}, 30000);

httpServer.listen(cfg.PORT, cfg.HOST, () => {
  console.log(`backend-tennis listening on http://${cfg.HOST}:${cfg.PORT}`);
  console.log(`ws endpoint ws://${cfg.HOST}:${cfg.PORT}${cfg.WS_PATH}`);
});
