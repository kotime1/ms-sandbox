import http from 'node:http';
import { createApp } from './http/app.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT) || 3000;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

if (!LOOPBACK.has(host) && process.env.ALLOW_REMOTE !== '1') {
  console.error(`Refusing to bind to ${host}. This sandbox has no user accounts; expose it beyond localhost only deliberately.\nSet ALLOW_REMOTE=1 (and put TLS + auth in front of it) if you really mean it.`);
  process.exit(1);
}

const server = http.createServer(createApp());
// Slowloris / resource-exhaustion limits.
server.headersTimeout = 10_000;
server.requestTimeout = 20_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 50;
server.maxRequestsPerSocket = 1000;

server.listen(port, host, () => {
  console.log(`ms-sandbox listening on http://${host}:${port}`);
  console.log(`assistant: ${process.env.ANTHROPIC_API_KEY && process.env.ASSISTANT_PROVIDER !== 'local' ? 'Claude (optional provider enabled)' : 'offline notes (no API key)'}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e?.message));
