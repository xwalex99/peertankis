import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 9000);
const host = process.env.HOST || "0.0.0.0";
const path = process.env.WS_PATH || "/ws";

const rooms = new Map();

const getRoom = (roomId) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { clients: new Set(), clientsById: new Map() });
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

const wss = new WebSocketServer({ host, port, path });

wss.on("connection", (socket, req) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const roomId = url.searchParams.get("roomId");
  const playerId = url.searchParams.get("playerId");

  if (!roomId || !playerId) {
    socket.close();
    return;
  }

  socket.playerId = playerId;

  const room = getRoom(roomId);
  room.clients.add(socket);
  room.clientsById.set(playerId, socket);

  socket.on("message", (raw) => {
    const message = safeParse(raw);
    if (!message) return;

    if (message.type === "PING") {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "PONG", timestamp: Date.now() }));
      }
      return;
    }

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

    const shouldBroadcast = message.broadcast === true;
    if (!shouldBroadcast) {
      // TODO: Aquí iría la lógica autoritativa del servidor.
      // Para pruebas rápidas, reenviamos a todos los clientes (relay simple).
    }

    for (const client of room.clients) {
      if (client.readyState !== client.OPEN) continue;
      if (client === socket) continue;
      if (message.excludePeerId && client.playerId === message.excludePeerId) continue;
      client.send(JSON.stringify(envelope));
    }
  });

  socket.on("close", () => {
    room.clients.delete(socket);
    room.clientsById.delete(playerId);

    if (room.clients.size === 0) {
      rooms.delete(roomId);
    }
  });
});

console.log(`[ws] listening on ws://${host}:${port}${path}`);
