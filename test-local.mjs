/**
 * Pruebas locales del backend: HTTP y WebSocket
 * Ejecutar con: node test-local.mjs
 * (El servidor debe estar corriendo en localhost:8080)
 */

const BASE = "http://127.0.0.1:8080";
const WS_URL = "ws://127.0.0.1:8080/ws";

async function httpTests() {
  console.log("--- HTTP ---");
  const r1 = await fetch(BASE + "/");
  console.log("GET /  ->", r1.status, await r1.json());
  const r2 = await fetch(BASE + "/health");
  console.log("GET /health ->", r2.status, await r2.json());
  const r3 = await fetch(BASE + "/noexiste");
  console.log("GET /noexiste ->", r3.status, r3.status === 404 ? "OK" : "esperado 404");
}

async function wsTest() {
  const { default: WebSocket } = await import("ws");
  return new Promise((resolve) => {
    console.log("\n--- WebSocket ---");
    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(() => {
      ws.close();
      resolve(new Error("timeout"));
    }, 5000);
    ws.on("open", () => {
      console.log("Conexión WS abierta");
      ws.send(JSON.stringify({
        type: "ROOM_JOIN",
        payload: { roomCode: "TEST1", create: true, player: { name: "TestBot" }, settings: { maxPlayers: 10 } },
      }));
    });
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      console.log("Mensaje:", msg.type, msg.payload ? "(payload)" : "");
      if (msg.type === "ROOM_JOINED" || msg.type === "ROOM_ERROR") {
        clearTimeout(timeout);
        ws.close();
        resolve(msg.type === "ROOM_JOINED" ? null : new Error(msg.payload?.message || msg.payload?.code));
      }
    });
    ws.on("error", (err) => {
      clearTimeout(timeout);
      resolve(err);
    });
    ws.on("close", () => resolve(null));
  });
}

async function main() {
  await httpTests();
  const err = await wsTest();
  if (err) console.error("WebSocket error:", err.message || err);
  else console.log("WebSocket JOIN OK");
  console.log("\nPruebas terminadas.");
  process.exit(err ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
