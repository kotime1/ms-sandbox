import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp, CSP } from '../server/http/app.js';

let server, base, port;
before(async () => {
  server = http.createServer(createApp({ env: {} }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});
after(() => server.close());

// Raw request helper so we control Host / Origin / headers exactly (fetch forbids some).
function raw(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: { Host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not json */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function session() {
  const r = await raw('POST', '/api/session', { headers: { 'Content-Type': 'application/json' }, body: {} });
  assert.equal(r.status, 200);
  const cookie = r.headers['set-cookie'][0].split(';')[0];
  return { cookie, csrf: r.json.data.csrf, setCookie: r.headers['set-cookie'][0] };
}
const authed = (s, extra = {}) => ({ Cookie: s.cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrf, Origin: base, ...extra });

test('security headers and strict CSP on pages and API', async () => {
  for (const p of ['/', '/css/app.css', '/js/main.js']) {
    const r = await raw('GET', p);
    assert.equal(r.status, 200, p);
    assert.equal(r.headers['content-security-policy'], CSP);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['x-frame-options'], 'DENY');
    assert.equal(r.headers['referrer-policy'], 'no-referrer');
    assert.equal(r.headers['cache-control'], 'no-store');
  }
  assert.doesNotMatch(CSP, /unsafe-inline|unsafe-eval/);
  assert.match(CSP, /script-src 'self'/);
  assert.match(CSP, /frame-ancestors 'none'/);
});

test('session cookie is HttpOnly + SameSite=Strict; csrf token is not in the cookie', async () => {
  const s = await session();
  assert.match(s.setCookie, /HttpOnly/);
  assert.match(s.setCookie, /SameSite=Strict/);
  assert.doesNotMatch(s.setCookie, new RegExp(s.csrf));
});

test('Secure flag is added when COOKIE_SECURE=1', async () => {
  const srv = http.createServer(createApp({ env: { COOKIE_SECURE: '1' } }));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const p = srv.address().port;
  const c = await new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: p, method: 'POST', path: '/api/session', headers: { Host: `127.0.0.1:${p}`, 'Content-Type': 'application/json' } }, (res) => { res.resume(); resolve(res.headers['set-cookie'][0]); });
    req.end('{}');
  });
  srv.close();
  assert.match(c, /; Secure/);
});

test('DNS rebinding: unknown Host header is rejected', async () => {
  const r = await raw('GET', '/', { headers: { Host: 'evil.example.com' } });
  assert.equal(r.status, 421);
});

test('API requires a session', async () => {
  assert.equal((await raw('GET', '/api/state')).status, 401);
  assert.equal((await raw('POST', '/api/action', { headers: { 'Content-Type': 'application/json' }, body: {} })).status, 401);
});

test('CSRF: writes need the token, a same-origin Origin, and JSON', async () => {
  const s = await session();
  const body = { type: 'ui.visit', params: { page: 'x' } };
  // no token
  let r = await raw('POST', '/api/lab/start', { headers: { Cookie: s.cookie, 'Content-Type': 'application/json', Origin: base }, body: { labId: 'suppress-app1' } });
  assert.equal(r.status, 403);
  // wrong token
  r = await raw('POST', '/api/lab/start', { headers: authed(s, { 'X-CSRF-Token': 'nope' }), body: { labId: 'suppress-app1' } });
  assert.equal(r.status, 403);
  // cross-site origin
  r = await raw('POST', '/api/lab/start', { headers: authed(s, { Origin: 'https://evil.example.com' }), body: { labId: 'suppress-app1' } });
  assert.equal(r.status, 403);
  // browser says cross-site
  r = await raw('POST', '/api/lab/start', { headers: authed(s, { 'Sec-Fetch-Site': 'cross-site' }), body: { labId: 'suppress-app1' } });
  assert.equal(r.status, 403);
  // wrong content type (form post style)
  r = await raw('POST', '/api/lab/start', { headers: authed(s, { 'Content-Type': 'text/plain' }), body: 'labId=suppress-app1' });
  assert.equal(r.status, 415);
  // happy path
  r = await raw('POST', '/api/lab/start', { headers: authed(s), body: { labId: 'suppress-app1' } });
  assert.equal(r.status, 200);
  void body;
});

test('cross-origin page cannot bootstrap a session', async () => {
  const r = await raw('POST', '/api/session', { headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example.com' }, body: {} });
  assert.equal(r.status, 403);
});

test('oversized and malformed bodies are rejected', async () => {
  const s = await session();
  let r = await raw('POST', '/api/assistant', { headers: authed(s), body: JSON.stringify({ question: 'a'.repeat(40_000) }) });
  assert.equal(r.status, 413);
  r = await raw('POST', '/api/assistant', { headers: authed(s), body: '{not json' });
  assert.equal(r.status, 400);
  r = await raw('POST', '/api/assistant', { headers: authed(s), body: '[1,2]' });
  assert.equal(r.status, 400);
  r = await raw('POST', '/api/assistant', { headers: authed(s), body: { question: 'x'.repeat(601) } });
  assert.equal(r.status, 400);
});

test('static serving: traversal, encoded traversal, backslashes, NUL and unknown types are refused', async () => {
  for (const p of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/package.json', '/js/..%5c..%5cpackage.json', '/js/%00.js', '/../server/index.js', '/js/', '/nope.exe', '/.git/config', '/..%252fpackage.json']) {
    const r = await raw('GET', p);
    assert.ok([400, 404].includes(r.status), `${p} -> ${r.status}`);
    assert.doesNotMatch(r.text, /"name": "ms-sandbox"|createApp/);
  }
});

test('only GET/HEAD for pages, only GET/POST for API', async () => {
  assert.equal((await raw('POST', '/')).status, 405);
  const s = await session();
  assert.equal((await raw('DELETE', '/api/state', { headers: { Cookie: s.cookie } })).status, 405);
  assert.equal((await raw('PUT', '/api/state', { headers: { Cookie: s.cookie } })).status, 405);
});

test('unknown action names and prototype-pollution payloads are inert', async () => {
  const s = await session();
  await raw('POST', '/api/lab/start', { headers: authed(s), body: { labId: 'sentinel-rbac' } });
  for (const type of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'nope']) {
    const r = await raw('POST', '/api/action', { headers: authed(s), body: { type, params: {} } });
    assert.equal(r.status, 422, type);
    assert.equal(r.json.error.code, 'UnknownAction');
  }
  const evil = '{"type":"azure.assignRole","params":{"__proto__":{"polluted":true},"scope":"x","principalId":"u-a","role":"Owner","constructor":{"prototype":{"polluted":true}}}}';
  const r = await raw('POST', '/api/action', { headers: authed(s), body: evil });
  assert.equal(r.status, 422);
  assert.equal({}.polluted, undefined);
  // unknown labs / views
  assert.equal((await raw('POST', '/api/lab/start', { headers: authed(s), body: { labId: '__proto__' } })).status, 404);
  assert.equal((await raw('GET', '/api/view/__proto__', { headers: { Cookie: s.cookie } })).status, 404);
  assert.equal((await raw('GET', '/api/view/constructor', { headers: { Cookie: s.cookie } })).status, 404);
});

test('parameters are validated: wrong types, long strings, control characters', async () => {
  const s = await session();
  await raw('POST', '/api/lab/start', { headers: authed(s), body: { labId: 'suppress-app1' } });
  const act = (type, params) => raw('POST', '/api/action', { headers: authed(s), body: { type, params } });
  assert.equal((await act('defender.createSuppression', { alertTitle: 5, scope: 'organization', action: 'hide' })).json.error.code, 'ValidationError');
  assert.equal((await act('defender.createSuppression', { alertTitle: 'a'.repeat(500), scope: 'organization', action: 'hide' })).json.error.code, 'ValidationError');
  assert.equal((await act('defender.createSuppression', { alertTitle: 'x\u0000y', scope: 'organization', action: 'hide' })).json.error.code, 'ValidationError');
  assert.equal((await act('defender.createSuppression', { alertTitle: '<img src=x onerror=alert(1)>', scope: 'organization', action: 'hide' })).json.error.code, 'ValidationError');
  assert.equal((await act('defender.createSuppression', { alertTitle: 'ok', scope: 'galaxy', action: 'hide' })).json.error.code, 'ValidationError');
  assert.equal((await act('defender.createSuppression', { alertTitle: 'ok', scope: 'organization', action: 'hide', extra: 'dropped' })).status, 200);
});

test('actions require an active lab', async () => {
  const s = await session();
  const r = await raw('POST', '/api/action', { headers: authed(s), body: { type: 'ui.visit', params: { page: 'a' } } });
  assert.equal(r.status, 409);
});

test('the API never leaks solutions, check functions or unrevealed hints', async () => {
  const s = await session();
  const start = await raw('POST', '/api/lab/start', { headers: authed(s), body: { labId: 'playbook-permissions' } });
  const state = await raw('GET', '/api/state', { headers: { Cookie: s.cookie } });
  const view = await raw('GET', '/api/view/resources', { headers: { Cookie: s.cookie } });
  const iam = await raw('GET', '/api/view/iam', { headers: { Cookie: s.cookie } });
  const everything = start.text + state.text + view.text + iam.text + (await raw('POST', '/api/session', { headers: { Cookie: s.cookie, 'Content-Type': 'application/json' }, body: {} })).text;
  // Match JSON keys / hint text, not words: "hintsUsed" is a legitimate field, and
  // "Virtual Machine Contributor" is a normal entry in the role catalog.
  for (const secret of ['"solution"', '"hints"', '"check"', '"steps"', '"withholdNotes"', 'Azure portal > Resources > Playbook1', 'set the trigger to']) {
    assert.ok(!everything.includes(secret), `leaked: ${secret}`);
  }
  assert.doesNotMatch(everything, /"seen"|"r":|counters|mulberry/);
});

test('hint endpoint reveals one tier at a time', async () => {
  const s = await session();
  await raw('POST', '/api/lab/start', { headers: authed(s), body: { labId: 'suppress-app1' } });
  const h1 = await raw('POST', '/api/lab/hint', { headers: authed(s), body: {} });
  const h2 = await raw('POST', '/api/lab/hint', { headers: authed(s), body: {} });
  assert.equal(h1.json.data.tier, 1);
  assert.equal(h2.json.data.tier, 2);
  assert.notEqual(h1.json.data.text, h2.json.data.text);
});

test('sessions are isolated from each other', async () => {
  const a = await session();
  const b = await session();
  await raw('POST', '/api/lab/start', { headers: authed(a), body: { labId: 'suppress-app1' } });
  const sa = await raw('GET', '/api/state', { headers: { Cookie: a.cookie } });
  const sb = await raw('GET', '/api/state', { headers: { Cookie: b.cookie } });
  assert.ok(sa.json.data.lab);
  assert.equal(sb.json.data.lab, null);
  // A's cookie with B's CSRF token is rejected.
  const r = await raw('POST', '/api/lab/start', { headers: { ...authed(a), 'X-CSRF-Token': b.csrf }, body: { labId: 'suppress-app1' } });
  assert.equal(r.status, 403);
});

test('errors do not leak stack traces or file paths', async () => {
  const s = await session();
  for (const r of [await raw('GET', '/api/view/nope', { headers: { Cookie: s.cookie } }), await raw('GET', '/api/nope', { headers: { Cookie: s.cookie } })]) {
    assert.doesNotMatch(r.text, /at .*\(|node_modules|C:\\|\/home\//);
  }
});

test('rate limiting kicks in', async () => {
  const srv = http.createServer(createApp({ env: { RATE_LIMIT: '5' } }));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const p = srv.address().port;
  const call = (path, headers = {}, method = 'GET') => new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: p, method, path, headers: { Host: `127.0.0.1:${p}`, 'Content-Type': 'application/json', ...headers } }, (res) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, res, body: Buffer.concat(c).toString() })); });
    req.end(method === 'POST' ? '{}' : undefined);
  });
  const ses = await call('/api/session', {}, 'POST');
  const cookie = ses.res.headers['set-cookie'][0].split(';')[0];
  const codes = [];
  for (let i = 0; i < 9; i++) codes.push((await call('/api/state', { Cookie: cookie })).status);
  srv.close();
  assert.ok(codes.includes(429), `expected a 429 in ${codes}`);
});
