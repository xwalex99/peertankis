import WebSocket from 'ws';

const ROOM_ID = process.env.TANKIS_ROOM_ID || 'tankblitz-v4-TEST01';
const PLAYER_ID =
  process.env.TANKIS_PLAYER_ID || `test-${Math.random().toString(36).slice(2, 8)}`;
const WS_URL = process.env.TANKIS_WS_URL || 'ws://localhost:8080/ws';

const url = new URL(WS_URL);
url.searchParams.set('roomId', ROOM_ID);
url.searchParams.set('playerId', PLAYER_ID);

console.log('🔌 Conectando a', url.toString());
const socket = new WebSocket(url.toString());

socket.on('open', () => {
  console.log('✅ Conectado. Enviando JOIN de prueba...');
  socket.send(
    JSON.stringify({
      type: 'JOIN',
      payload: {
        id: PLAYER_ID,
        name: 'Tester WS',
        tankClass: 'STRIKER',
        team: 'NONE',
      },
    })
  );

  setInterval(() => {
    socket.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
  }, 3000);
});

socket.on('message', (raw) => {
  try {
    const msg = JSON.parse(raw.toString());
    console.log('📥 Mensaje recibido:', msg.type, msg);
  } catch (error) {
    console.warn('⚠️ Mensaje no JSON:', raw.toString());
  }
});

socket.on('close', () => {
  console.log('🔌 Conexión cerrada');
});

socket.on('error', (error) => {
  console.error('❌ Error WS:', error);
});
