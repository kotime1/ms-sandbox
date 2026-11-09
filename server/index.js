import http from 'node:http';
import { createApp } from './http/app.js';
import { icaConfig } from './core/ica-client.js';
import { aiLog, DEFAULT_LOG_PATH } from './exam/ai-log.js';

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

// The log of what the model wrote for live exam questions. Emptied at every start; AI_LOG=off turns it off, AI_LOG=<path> moves it.
const logSetting = process.env.AI_LOG;
const logFile = logSetting && logSetting.toLowerCase() === 'off' ? null : aiLog.open(logSetting || DEFAULT_LOG_PATH);

server.listen(port, host, () => {
  console.log(`ms-sandbox listening on http://${host}:${port}`);
  console.log(`ai question log: ${logFile ?? 'off'}`);
  const ica = icaConfig(process.env, 'ASSISTANT_MODEL');
  console.log(`assistant: ${ica.enabled && process.env.ASSISTANT_PROVIDER !== 'local' ? `${ica.model}` : process.env.ICA_API_KEY ? 'offline notes (ICA key set, but no model: set ICA_MODEL, see scripts/probe-ica.mjs models)' : 'offline notes (no ICA key)'}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e?.message));
