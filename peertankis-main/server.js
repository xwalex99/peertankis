import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 9000);
const host = process.env.HOST || "0.0.0.0";
const path = process.env.WS_PATH || "/ws";

const rooms = new Map();

const getRoom = (roomId) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      clients: new Set(),
      clientsById: new Map(),
      players: new Map(), // playerId -> { name, team, joinedAt, ... }
      settings: { mode: "DEATHMATCH", maxPlayers: 10 },
    });
  }
  return rooms.get(roomId);
};

const safeParse = (data) => {
  try {
    return JSON.parse(data.toString());
  } catch {
    return null;
  }
};

// Genera el STATUS_REPORT para una sala
const generateStatusReport = (room) => {
  const teamPlayers = { RED: [], BLUE: [] };

  room.players.forEach((player) => {
    if (player.team === "RED" || player.team === "BLUE") {
      teamPlayers[player.team].push(player.name || "Piloto");
    }
  });

  return {
    type: "STATUS_REPORT",
    payload: {
      count: room.players.size,
      max: room.settings.maxPlayers,
      teamPlayers,
      mode: room.settings.mode,
    },
  };
};

// Notifica a todos en la sala la lista de peers actualizada
const broadcastPeerList = (room) => {
  const peers = Array.from(room.players.entries()).map(([id, data]) => ({
    id,
    name: data.name,
    team: data.team,
    joinedAt: data.joinedAt,
  }));

  const message = JSON.stringify({
    type: "PEER_LIST",
    payload: { peers },
  });

  for (const client of room.clients) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  }
};

const wss = new WebSocketServer({ host, port, path });

wss.on("connection", (socket, req) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const roomId = url.searchParams.get("roomId");
  const playerId = url.searchParams.get("playerId");

  if (!roomId || !playerId) {
    socket.close();
    return;
  }

  console.log(`🔌 [${roomId}] Conexión: ${playerId}`);

  socket.playerId = playerId;
  socket.roomId = roomId;

  const room = getRoom(roomId);
  room.clients.add(socket);
  room.clientsById.set(playerId, socket);

  socket.on("message", (raw) => {
    const message = safeParse(raw);
    if (!message) return;

    // PING/PONG - heartbeat
    if (message.type === "PING") {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "PONG", timestamp: Date.now() }));
      }
      return;
    }

    // QUERY_STATUS - el SERVIDOR responde con el estado de la sala
    if (message.type === "QUERY_STATUS") {
      console.log(`📊 [${roomId}] QUERY_STATUS de ${playerId} - Jugadores: ${room.players.size}`);
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(generateStatusReport(room)));
      }
      return;
    }

    // JOIN - registrar jugador en la sala
    if (message.type === "JOIN") {
      const playerData = {
        name: message.payload?.name || "Piloto",
        team: message.payload?.team || "NONE",
        joinedAt: Date.now(),
        ...message.payload,
      };
      room.players.set(playerId, playerData);

      // Si viene con settings (primer jugador o host), actualizar settings de la sala
      if (message.payload?.settings) {
        room.settings = { ...room.settings, ...message.payload.settings };
      }
      // También acepta mode directamente
      if (message.payload?.mode) {
        room.settings.mode = message.payload.mode;
      }
      if (message.payload?.maxPlayers) {
        room.settings.maxPlayers = message.payload.maxPlayers;
      }

      console.log(`✅ [${roomId}] JOIN: ${playerData.name} (${playerId}) - Total: ${room.players.size}`);

      // Notificar a todos la nueva lista de peers
      broadcastPeerList(room);

      // Broadcast el JOIN a los demás
      const envelope = { ...message, meta: { peerId: playerId } };
      for (const client of room.clients) {
        if (client.readyState !== client.OPEN || client === socket) continue;
        client.send(JSON.stringify(envelope));
      }
      return;
    }

    // PLAYER_LEFT - remover jugador (también se maneja en close)
    if (message.type === "PLAYER_LEFT") {
      const leavingId = message.payload?.playerId || playerId;
      room.players.delete(leavingId);
      console.log(`👋 [${roomId}] PLAYER_LEFT: ${leavingId} - Total: ${room.players.size}`);
      broadcastPeerList(room);
    }

    // Resto de mensajes - relay normal
    const envelope = {
      ...message,
      meta: { peerId: playerId },
    };

    if (message.targetPeerId) {
      const target = room.clientsById.get(message.targetPeerId);
      if (target && target.readyState === target.OPEN) {
        target.send(JSON.stringify(envelope));
      }
      return;
    }

    // Broadcast a todos los demás
    for (const client of room.clients) {
      if (client.readyState !== client.OPEN) continue;
      if (client === socket) continue;
      if (message.excludePeerId && client.playerId === message.excludePeerId) continue;
      client.send(JSON.stringify(envelope));
    }
  });

  socket.on("close", () => {
    console.log(`🔌 [${roomId}] Desconexión: ${playerId}`);
    room.clients.delete(socket);
    room.clientsById.delete(playerId);

    // Remover jugador y notificar a los demás
    if (room.players.has(playerId)) {
      room.players.delete(playerId);
      console.log(`👋 [${roomId}] Jugador removido: ${playerId} - Total: ${room.players.size}`);

      // Notificar a los demás que el jugador se fue
      const leftMessage = JSON.stringify({
        type: "PLAYER_LEFT",
        payload: { playerId },
        meta: { peerId: playerId },
      });
      for (const client of room.clients) {
        if (client.readyState === client.OPEN) {
          client.send(leftMessage);
        }
      }

      broadcastPeerList(room);
    }

    // Limpiar sala vacía
    if (room.clients.size === 0) {
      rooms.delete(roomId);
      console.log(`🗑️ [${roomId}] Sala eliminada (vacía)`);
    }
  });
});

console.log(`[ws] listening on ws://${host}:${port}${path}`);
