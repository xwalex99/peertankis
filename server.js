import http from "http";
import { randomUUID } from "crypto";
import { WebSocket, WebSocketServer } from "ws";

function parseBool(value, defaultValue) {
  if (value == null) return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return defaultValue;
}

function parseNumber(value, defaultValue) {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

const PORT = parseNumber(process.env.PORT, 8080);
const HOST = process.env.HOST || "0.0.0.0";
const WS_PATH = process.env.WS_PATH || "/ws";
const ALLOWED_ORIGINS = new Set(parseList(process.env.ALLOWED_ORIGINS));
const MAX_ROOM_PLAYERS = parseNumber(process.env.MAX_ROOM_PLAYERS, 10);
const ROOM_IDLE_TTL_MS = parseNumber(process.env.ROOM_IDLE_TTL_MS, 60000);
const MESSAGE_MAX_BYTES = parseNumber(process.env.MESSAGE_MAX_BYTES, 65536);
const RATE_LIMIT_PER_SEC = parseNumber(process.env.RATE_LIMIT_PER_SEC, 50);
const PUBLIC_ROOMS_JSON = parseJson(process.env.PUBLIC_ROOMS_JSON, {});
const ENABLE_HEALTH = parseBool(process.env.HEALTH_ENABLED, true);

const rooms = new Map();
const socketMeta = new WeakMap();

const server = http.createServer((req, res) => {
  const url = req.url?.split("?")[0] ?? "";
  if (url === "/" || url === "") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ service: "peertankis-ws", ok: true, ws: WS_PATH }));
    return;
  }
  if (ENABLE_HEALTH && url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MESSAGE_MAX_BYTES });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
  if (url.pathname !== WS_PATH) {
    socket.destroy();
    return;
  }

  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.size > 0) {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      socket.destroy();
      return;
    }
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

function now() {
  return Date.now();
}

function isValidRoomCode(code) {
  return typeof code === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(code);
}

function send(ws, type, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type, payload }));
}

function sendError(ws, message, code) {
  send(ws, "ROOM_ERROR", { message, code });
}

function createRateLimiter(limitPerSec) {
  let windowStart = now();
  let count = 0;
  return () => {
    const current = now();
    if (current - windowStart >= 1000) {
      windowStart = current;
      count = 0;
    }
    count += 1;
    return count <= limitPerSec;
  };
}

function ensureRoom(code, hostPlayer, settings) {
  const room = {
    code,
    hostId: hostPlayer?.id || null,
    hostName: hostPlayer?.name || null,
    maxPlayers: clampMaxPlayers(settings?.maxPlayers),
    peers: new Map(),
    settings: settings || null,
    mode: settings?.mode,
    createdAt: now(),
    idleTimer: null,
  };
  rooms.set(code, room);
  return room;
}

function clampMaxPlayers(value) {
  const max = parseNumber(value, MAX_ROOM_PLAYERS);
  if (!Number.isFinite(max) || max <= 0) return MAX_ROOM_PLAYERS;
  return Math.min(max, MAX_ROOM_PLAYERS);
}

function getRoom(code) {
  return rooms.get(code) || null;
}

function clearIdleTimer(room) {
  if (room.idleTimer) {
    clearTimeout(room.idleTimer);
    room.idleTimer = null;
  }
}

function scheduleRoomCleanup(room) {
  clearIdleTimer(room);
  if (ROOM_IDLE_TTL_MS <= 0) return;
  room.idleTimer = setTimeout(() => {
    if (room.peers.size === 0) {
      rooms.delete(room.code);
    }
  }, ROOM_IDLE_TTL_MS);
}

function buildPeerList(room, excludeId) {
  const peers = [];
  for (const peer of room.peers.values()) {
    if (peer.id === excludeId) continue;
    peers.push({ id: peer.id, joinedAt: peer.joinedAt });
  }
  return peers;
}

function broadcastRoom(room, type, payload, excludeId) {
  for (const peer of room.peers.values()) {
    if (excludeId && peer.id === excludeId) continue;
    if (peer.ws.readyState === WebSocket.OPEN) {
      send(peer.ws, type, payload);
    }
  }
}

function selectNewHost(room) {
  let selected = null;
  for (const peer of room.peers.values()) {
    if (!selected || peer.joinedAt < selected.joinedAt) {
      selected = peer;
    }
  }
  if (selected) {
    room.hostId = selected.id;
    room.hostName = selected.name || null;
    broadcastRoom(room, "ROOM_HOST_CHANGED", {
      hostId: room.hostId,
      hostName: room.hostName || undefined,
    });
  } else {
    room.hostId = null;
    room.hostName = null;
  }
}

function removePeer(room, peerId) {
  const peer = room.peers.get(peerId);
  if (!peer) return;
  room.peers.delete(peerId);
  broadcastRoom(room, "ROOM_PEER_LEFT", { peerId }, peerId);
  if (room.hostId === peerId) {
    selectNewHost(room);
  }
  if (room.peers.size === 0) {
    scheduleRoomCleanup(room);
  }
}

function buildTeamPlayers(room) {
  const teamPlayers = { RED: [], BLUE: [] };
  for (const peer of room.peers.values()) {
    if (peer.team === "RED") teamPlayers.RED.push(peer.id);
    if (peer.team === "BLUE") teamPlayers.BLUE.push(peer.id);
  }
  return teamPlayers;
}

function buildRoomStatus(roomCode) {
  const room = getRoom(roomCode);
  if (!room) {
    return {
      code: roomCode,
      status: "OFFLINE",
      players: 0,
      max: MAX_ROOM_PLAYERS,
      teamPlayers: { RED: [], BLUE: [] },
    };
  }
  const status = room.peers.size >= room.maxPlayers ? "FULL" : "OPEN";
  return {
    code: room.code,
    status,
    players: room.peers.size,
    max: room.maxPlayers,
    teamPlayers: buildTeamPlayers(room),
    mode: room.mode,
  };
}

function handleJoin(ws, payload) {
  if (!payload || !isValidRoomCode(payload.roomCode)) {
    sendError(ws, "Invalid roomCode", "INVALID_ROOM_CODE");
    return;
  }
  const player = payload.player || {};
  const playerId = typeof player.id === "string" ? player.id : randomUUID();
  const playerName = typeof player.name === "string" ? player.name : undefined;
  const team = player.team;
  const create = Boolean(payload.create);

  let room = getRoom(payload.roomCode);
  if (!room) {
    if (!create) {
      sendError(ws, "Room not found", "ROOM_NOT_FOUND");
      return;
    }
    room = ensureRoom(payload.roomCode, { id: playerId, name: playerName }, payload.settings);
  } else if (room.peers.size === 0 && payload.settings) {
    room.settings = payload.settings;
    room.maxPlayers = clampMaxPlayers(payload.settings.maxPlayers);
    room.mode = payload.settings.mode;
  }

  clearIdleTimer(room);

  const existing = room.peers.get(playerId);
  if (!existing && room.peers.size >= room.maxPlayers) {
    sendError(ws, "Room full", "ROOM_FULL");
    return;
  }

  const joinedAt = existing?.joinedAt || now();
  const peer = {
    id: playerId,
    name: playerName,
    team,
    joinedAt,
    ws,
  };

  if (existing && existing.ws !== ws) {
    try {
      existing.ws.close(4000, "replaced");
    } catch {
      // ignore
    }
  }

  room.peers.set(playerId, peer);

  if (!room.hostId) {
    room.hostId = playerId;
    room.hostName = playerName || null;
  }

  socketMeta.set(ws, { roomCode: room.code, playerId });

  send(ws, "ROOM_JOINED", {
    clientId: playerId,
    isHost: room.hostId === playerId,
    hostId: room.hostId,
    hostName: room.hostName || undefined,
    peers: buildPeerList(room, playerId),
  });

  if (!existing) {
    broadcastRoom(room, "ROOM_PEER_JOINED", { peerId: playerId }, playerId);
  }
}

function handleRejoin(ws, payload) {
  if (!payload || !isValidRoomCode(payload.roomCode)) {
    sendError(ws, "Invalid roomCode", "INVALID_ROOM_CODE");
    return;
  }
  if (typeof payload.playerId !== "string") {
    sendError(ws, "Invalid playerId", "INVALID_PLAYER_ID");
    return;
  }
  const room = getRoom(payload.roomCode);
  if (!room) {
    sendError(ws, "Room not found", "ROOM_NOT_FOUND");
    return;
  }

  const existing = room.peers.get(payload.playerId);
  if (!existing) {
    sendError(ws, "Player not found in room", "PLAYER_NOT_FOUND");
    return;
  }

  clearIdleTimer(room);
  if (existing.ws !== ws) {
    try {
      existing.ws.close(4000, "replaced");
    } catch {
      // ignore
    }
  }
  room.peers.set(payload.playerId, { ...existing, ws });
  socketMeta.set(ws, { roomCode: room.code, playerId: payload.playerId });

  send(ws, "ROOM_JOINED", {
    clientId: payload.playerId,
    isHost: room.hostId === payload.playerId,
    hostId: room.hostId,
    hostName: room.hostName || undefined,
    peers: buildPeerList(room, payload.playerId),
  });
}

function handleLeave(ws, payload) {
  const meta = socketMeta.get(ws);
  const roomCode = payload?.roomCode || meta?.roomCode;
  const playerId = payload?.playerId || meta?.playerId;
  if (!roomCode || !playerId) return;
  const room = getRoom(roomCode);
  if (!room) return;
  const current = room.peers.get(playerId);
  if (current && current.ws === ws) {
    removePeer(room, playerId);
  }
  socketMeta.delete(ws);
}

function handleRoomMessage(ws, payload) {
  const meta = socketMeta.get(ws);
  if (!payload || !isValidRoomCode(payload.roomCode)) {
    sendError(ws, "Invalid roomCode", "INVALID_ROOM_CODE");
    return;
  }
  if (!meta || meta.roomCode !== payload.roomCode) {
    sendError(ws, "Not in room", "NOT_IN_ROOM");
    return;
  }
  const room = getRoom(payload.roomCode);
  if (!room) {
    sendError(ws, "Room not found", "ROOM_NOT_FOUND");
    return;
  }
  const senderId = meta.playerId;
  const to = payload.to;
  const exclude = payload.exclude;
  const message = payload.message;

  if (to === "HOST") {
    const hostId = room.hostId;
    if (!hostId) {
      sendError(ws, "Host not available", "HOST_NOT_FOUND");
      return;
    }
    const host = room.peers.get(hostId);
    if (host) send(host.ws, "ROOM_MESSAGE", { from: senderId, message });
    return;
  }

  if (to === "ALL") {
    broadcastRoom(room, "ROOM_MESSAGE", { from: senderId, message }, exclude);
    return;
  }

  if (typeof to === "string") {
    const target = room.peers.get(to);
    if (!target) {
      sendError(ws, "Peer not found", "PEER_NOT_FOUND");
      return;
    }
    send(target.ws, "ROOM_MESSAGE", { from: senderId, message });
    return;
  }

  sendError(ws, "Invalid target", "INVALID_TARGET");
}

function handleRoomStatusRequest(ws, payload) {
  if (!payload || !isValidRoomCode(payload.roomCode)) {
    sendError(ws, "Invalid roomCode", "INVALID_ROOM_CODE");
    return;
  }
  const status = buildRoomStatus(payload.roomCode);
  send(ws, "ROOM_STATUS_RESPONSE", {
    roomCode: status.code,
    status: status.status,
    players: status.players,
    max: status.max,
    teamPlayers: status.teamPlayers,
    mode: status.mode,
  });
}

function handleRoomsStatusRequest(ws, payload) {
  const mode = payload?.mode;
  let roomsList = Array.isArray(payload?.rooms) ? payload.rooms : null;
  if (!roomsList && mode && PUBLIC_ROOMS_JSON && PUBLIC_ROOMS_JSON[mode]) {
    roomsList = PUBLIC_ROOMS_JSON[mode];
  }
  if (!Array.isArray(roomsList)) roomsList = [];
  const roomsStatus = roomsList.map((code) => buildRoomStatus(code));
  send(ws, "ROOMS_STATUS_RESPONSE", { rooms: roomsStatus });
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.rateLimit = createRateLimiter(RATE_LIMIT_PER_SEC);

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      sendError(ws, "Binary messages not supported", "INVALID_MESSAGE");
      return;
    }

    const size = Buffer.byteLength(data);
    if (size > MESSAGE_MAX_BYTES) {
      sendError(ws, "Message too large", "MESSAGE_TOO_LARGE");
      return;
    }

    if (!ws.rateLimit()) {
      sendError(ws, "Rate limit exceeded", "RATE_LIMIT");
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      sendError(ws, "Invalid JSON", "INVALID_JSON");
      return;
    }

    if (!parsed || typeof parsed.type !== "string") {
      sendError(ws, "Invalid message format", "INVALID_FORMAT");
      return;
    }

    switch (parsed.type) {
      case "ROOM_JOIN":
        handleJoin(ws, parsed.payload);
        break;
      case "ROOM_REJOIN":
        handleRejoin(ws, parsed.payload);
        break;
      case "ROOM_LEAVE":
        handleLeave(ws, parsed.payload);
        break;
      case "ROOM_MESSAGE":
        handleRoomMessage(ws, parsed.payload);
        break;
      case "ROOM_STATUS_REQUEST":
        handleRoomStatusRequest(ws, parsed.payload);
        break;
      case "ROOMS_STATUS_REQUEST":
        handleRoomsStatusRequest(ws, parsed.payload);
        break;
      default:
        sendError(ws, "Unknown message type", "UNKNOWN_TYPE");
        break;
    }
  });

  ws.on("close", () => {
    const meta = socketMeta.get(ws);
    if (!meta) return;
    const room = getRoom(meta.roomCode);
    if (!room) return;
    const current = room.peers.get(meta.playerId);
    if (current && current.ws === ws) {
      removePeer(room, meta.playerId);
    }
    socketMeta.delete(ws);
  });
});

const heartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

heartbeatInterval.unref();

server.listen(PORT, HOST, () => {
  console.log(`[ws] listening on ${HOST}:${PORT}${WS_PATH}`);
});

