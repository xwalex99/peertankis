import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 9000);
const host = process.env.HOST || "0.0.0.0";
const path = process.env.WS_PATH || "/ws";

const rooms = new Map();

const getRoom = (roomId) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { clients: new Set(), host: null });
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

const sendToClient = (client, message) => {
  if (client.readyState === client.OPEN) {
    client.send(JSON.stringify(message));
  }
};

const broadcastRoom = (room, message, { excludePeerId } = {}) => {
  for (const client of room.clients) {
    if (excludePeerId && client.playerId === excludePeerId) continue;
    sendToClient(client, message);
  }
};

const wss = new WebSocketServer({ host, port, path });

wss.on("connection", (socket, req) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const roomId = url.searchParams.get("roomId");
  const playerId = url.searchParams.get("playerId");
  const isHost = url.searchParams.get("isHost") === "1";

  if (!roomId || !playerId) {
    socket.close();
    return;
  }

  socket.playerId = playerId;
  socket.isHost = isHost;

  const room = getRoom(roomId);
  room.clients.add(socket);
  if (isHost) {
    room.host = socket;
  }

  const joinMessage = {
    type: "JOIN",
    meta: { peerId: playerId, isHost },
  };
  broadcastRoom(room, joinMessage, { excludePeerId: playerId });

  socket.on("message", (raw) => {
    const message = safeParse(raw);
    if (!message) return;

    if (message.type === "PING") {
      sendToClient(socket, { type: "PONG", timestamp: Date.now() });
      return;
    }

    const envelope = {
      ...message,
      meta: { peerId: playerId, isHost },
    };

    if (message.targetRole === "HOST" && room.host) {
      sendToClient(room.host, envelope);
      return;
    }

    if (message.targetPeerId) {
      for (const client of room.clients) {
        if (client.playerId === message.targetPeerId) {
          sendToClient(client, envelope);
          return;
        }
      }
      return;
    }

    if (message.broadcast === true) {
      broadcastRoom(room, envelope, {
        excludePeerId: message.excludePeerId || playerId,
      });
      return;
    }

    if (room.host && room.host !== socket) {
      sendToClient(room.host, envelope);
    }
  });

  socket.on("close", () => {
    room.clients.delete(socket);
    if (room.host === socket) {
      room.host = null;
    }

    const leftMessage = {
      type: "PLAYER_LEFT",
      payload: { peerId: playerId },
      meta: { peerId: playerId, isHost },
    };
    broadcastRoom(room, leftMessage, { excludePeerId: playerId });

    if (room.clients.size === 0) {
      rooms.delete(roomId);
    }
  });
});

console.log(`[ws] listening on ws://${host}:${port}${path}`);
