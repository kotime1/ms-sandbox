let csrf = '';

async function call(method, path, body) {
  const headers = { Accept: 'application/json' };
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    headers['X-CSRF-Token'] = csrf;
  }
  let res;
  try {
    res = await fetch(path, { method, headers, body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    return { ok: false, error: { code: 'Network', message: 'Cannot reach the sandbox server. Is it still running?' } };
  }
  try {
    return await res.json();
  } catch {
    return { ok: false, error: { code: 'BadResponse', message: `Unexpected response (${res.status})` } };
  }
}

export async function startSession() {
  const out = await call('POST', '/api/session', {});
  if (!out.ok) throw new Error(out.error?.message ?? 'Could not start a session');
  csrf = out.data.csrf;
  return out.data;
}

export const get = (path) => call('GET', path);
export const post = (path, body) => call('POST', path, body);
