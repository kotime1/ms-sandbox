// HTTP application: routing + all web-security controls. Built on node:http only.
//
// Controls (see docs/SECURITY.md for the threat model):
//   Host allowlist (DNS rebinding)  · Origin check on writes (CSRF)  · CSRF token
//   HttpOnly + SameSite=Strict session cookie · strict CSP / security headers
//   JSON-only, size-limited bodies · per-session rate limiting · no directory traversal
//   generic error responses (no stack traces) · request audit without bodies

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionStore } from '../core/session.js';
import { perform, listScopes } from '../sim/actions.js';
import { LABS, labSummary } from '../labs/index.js';
import { getView } from './views.js';
import { safeEqual } from '../core/util.js';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web');
const MAX_BODY = 16 * 1024;
const COOKIE = 'sid';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };

export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

const SEC_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Fixed-window limiter. Cheap, bounded: keys are session ids or IPs, capped in size. */
class RateLimiter {
  constructor(limit, windowMs, now) { this.limit = limit; this.windowMs = windowMs; this.now = now; this.hits = new Map(); }
  allow(key) {
    const t = this.now();
    if (this.hits.size > 5000) this.hits.clear();
    const h = this.hits.get(key);
    if (!h || t - h.start > this.windowMs) { this.hits.set(key, { start: t, n: 1 }); return true; }
    return ++h.n <= this.limit;
  }
}

export function createApp({ env = process.env, now = () => Date.now(), store } = {}) {
  const sessions = store ?? new SessionStore({ env, now });
  const secure = env.COOKIE_SECURE === '1';
  const limiter = new RateLimiter(Number(env.RATE_LIMIT) || 240, 60_000, now);
  const askLimiter = new RateLimiter(20, 60_000, now);
  const newSessionLimiter = new RateLimiter(30, 60_000, now);

  const allowedHosts = (port) => new Set(['localhost', '127.0.0.1', '[::1]'].flatMap((h) => [h, `${h}:${port}`]).concat((env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean)));

  function send(res, status, body, headers = {}) {
    const isStr = typeof body === 'string' || Buffer.isBuffer(body);
    res.writeHead(status, { ...SEC_HEADERS, ...(isStr ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), ...headers });
    res.end(isStr ? body : JSON.stringify(body));
  }
  const fail = (res, status, code, message) => send(res, status, { ok: false, error: { code, message } });

  function parseCookies(header = '') {
    const out = Object.create(null);
    for (const part of header.split(';')) {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    return out;
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      const ct = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (ct !== 'application/json') return reject(new HttpError(415, 'Content-Type must be application/json'));
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          // Stop buffering now; the catch block replies 413 and closes the socket once it is sent.
          if (size - c.length <= MAX_BODY) reject(new HttpError(413, 'Request body too large'));
          chunks.length = 0;
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8');
          const v = text ? JSON.parse(text) : {};
          if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error();
          resolve(v);
        } catch { reject(new HttpError(400, 'Body must be a JSON object')); }
      });
      req.on('error', () => reject(new HttpError(400, 'Bad request')));
    });
  }

  async function serveStatic(req, res, pathname) {
    let rel = pathname === '/' ? '/index.html' : pathname;
    let decoded;
    try { decoded = decodeURIComponent(rel); } catch { return fail(res, 400, 'BadRequest', 'Bad path'); }
    if (decoded.includes('\0') || decoded.includes('\\')) return fail(res, 400, 'BadRequest', 'Bad path');
    const file = path.resolve(WEB_ROOT, `.${decoded}`);
    if (file !== WEB_ROOT && !file.startsWith(WEB_ROOT + path.sep)) return fail(res, 404, 'NotFound', 'Not found');
    const type = MIME[path.extname(file).toLowerCase()];
    if (!type) return fail(res, 404, 'NotFound', 'Not found');
    try {
      const st = await stat(file);
      if (!st.isFile()) return fail(res, 404, 'NotFound', 'Not found');
      send(res, 200, await readFile(file), { 'Content-Type': type });
    } catch { fail(res, 404, 'NotFound', 'Not found'); }
  }

  return async function handler(req, res) {
    try {
      const port = req.socket.localPort;
      if (!allowedHosts(port).has(String(req.headers.host || '').toLowerCase())) {
        return fail(res, 421, 'MisdirectedRequest', 'Host not allowed');
      }
      const url = new URL(req.url, 'http://x');
      const { pathname } = url;
      const isApi = pathname.startsWith('/api/');
      const method = req.method;

      if (!isApi) {
        if (method !== 'GET' && method !== 'HEAD') return fail(res, 405, 'MethodNotAllowed', 'Method not allowed');
        return serveStatic(req, res, pathname);
      }

      // ---- API: session
      const cookies = parseCookies(req.headers.cookie);
      let session = sessions.get(cookies[COOKIE]);
      const ip = req.socket.remoteAddress || 'unknown';

      if (pathname === '/api/session' && method === 'POST') {
        // Only same-origin pages may bootstrap a session.
        if (!originOk(req, port)) return fail(res, 403, 'Forbidden', 'Cross-origin request blocked');
        if (!session) {
          if (!newSessionLimiter.allow(ip)) return fail(res, 429, 'RateLimited', 'Too many new sessions');
          session = sessions.create();
        }
        const cookie = `${COOKIE}=${session.id}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}; Max-Age=7200`;
        return send(res, 200, { ok: true, data: { csrf: session.csrf, assistant: session.assistant.info(), labs: LABS.map(labSummary) } }, { 'Set-Cookie': cookie });
      }

      if (!session) return fail(res, 401, 'NoSession', 'Start a session first');
      if (!limiter.allow(session.id)) return fail(res, 429, 'RateLimited', 'Slow down');

      const write = method === 'POST';
      if (method !== 'GET' && !write) return fail(res, 405, 'MethodNotAllowed', 'Method not allowed');
      if (write) {
        if (!originOk(req, port)) return fail(res, 403, 'Forbidden', 'Cross-origin request blocked');
        if (!safeEqual(req.headers['x-csrf-token'] ?? '', session.csrf)) return fail(res, 403, 'Forbidden', 'Missing or invalid CSRF token');
      }
      const body = write ? await readJson(req) : null;

      // ---- API routes
      if (method === 'GET' && pathname === '/api/state') {
        const lab = session.lab.lab ? { briefing: session.lab.briefing(), status: session.lab.status(), next: session.lab.nextStep() } : null;
        return send(res, 200, { ok: true, data: { lab, feed: session.bus.feedSince(Number(url.searchParams.get('after')) || 0) } });
      }
      if (method === 'GET' && pathname.startsWith('/api/view/')) {
        const v = getView(session.world, pathname.slice('/api/view/'.length));
        return v ? send(res, 200, { ok: true, data: v }) : fail(res, 404, 'NotFound', 'Unknown view');
      }
      if (method === 'POST' && pathname === '/api/lab/start') {
        const b = await requireString(body, 'labId', 64);
        const briefing = session.lab.start(b);
        session.assistant.reset();
        return briefing ? send(res, 200, { ok: true, data: { briefing } }) : fail(res, 404, 'NotFound', 'Unknown lab');
      }
      if (method === 'POST' && pathname === '/api/lab/hint') {
        if (!session.lab.lab) return fail(res, 409, 'NoLab', 'Start a lab first');
        const id = body.objectiveId === undefined ? undefined : await requireString(body, 'objectiveId', 64);
        return send(res, 200, { ok: true, data: session.lab.hint(id) });
      }
      if (method === 'POST' && pathname === '/api/action') {
        if (!session.lab.lab) return fail(res, 409, 'NoLab', 'Start a lab first');
        const type = await requireString(body, 'type', 60);
        const out = perform(session.ctx, type, body.params);
        return send(res, out.ok ? 200 : 422, out);
      }
      if (method === 'POST' && pathname === '/api/assistant') {
        if (!askLimiter.allow(session.id)) return fail(res, 429, 'RateLimited', 'The assistant needs a moment');
        const q = await requireString(body, 'question', 600);
        return send(res, 200, { ok: true, data: await session.assistant.ask(q) });
      }
      return fail(res, 404, 'NotFound', 'Unknown API route');
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 413) {
          res.once('finish', () => req.destroy());
          return send(res, 413, { ok: false, error: { code: 'BadRequest', message: err.message } }, { Connection: 'close' });
        }
        return fail(res, err.status, 'BadRequest', err.message);
      }
      console.error('[http] unhandled error:', err?.message);
      return fail(res, 500, 'InternalError', 'Something went wrong');
    }
  };
}

function originOk(req, port) {
  const origin = req.headers.origin;
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) return false;
  if (!origin) return !fetchSite ? true : fetchSite === 'same-origin' || fetchSite === 'none';
  try {
    return new URL(origin).host.toLowerCase() === String(req.headers.host || '').toLowerCase();
  } catch { return false; }
}

async function requireString(body, key, max) {
  const v = body?.[key];
  if (typeof v !== 'string' || v.length === 0 || v.length > max) throw new HttpError(400, `${key} must be a string up to ${max} characters`);
  return v;
}

export { listScopes };
