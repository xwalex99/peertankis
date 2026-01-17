import { PeerServer } from "peer";

function parseBool(value, defaultValue) {
  if (value == null) return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return defaultValue;
}
//cositas
const port = Number(process.env.PORT || 9000);
// Cloud Run (and most container platforms) expect the server to listen on 0.0.0.0
const host = process.env.HOST || "0.0.0.0";
const path = process.env.PEER_PATH || "/peerjs";
const key = process.env.PEER_KEY || "tankis-peer";

PeerServer({
  host,
  port,
  path,
  // If you're behind a reverse proxy (Nginx/Caddy/Traefik), keep this true
  proxied: parseBool(process.env.PEER_PROXIED, true),
  // For safety: do not allow public discovery (`GET /peers`)
  allow_discovery: parseBool(process.env.PEER_ALLOW_DISCOVERY, false),
  // Optional: set a custom key to avoid casual abuse of the API
  key,
});
//dsdaasd
console.log(`[peerjs] listening on ${host}:${port}${path} (key=${key})`);
//com

