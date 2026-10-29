# Security model

The sandbox is a local learning tool, but it is built as if it were exposed: it runs untrusted-shaped input (KQL, form fields, an optional LLM) and it teaches security, so it should model good practice.

## Assets and trust boundaries

| Asset | Where it lives | Threat |
|---|---|---|
| Lab solutions, unrevealed hints, grading checks | Server only | Leak to browser/assistant → learner skips the learning |
| `ANTHROPIC_API_KEY` | Server env only | Leak to browser, logs, or LLM |
| The host machine | n/a | Code execution / file access via queries or input |
| Other sessions' state | Server memory | Cross-session reads/writes |

Trust boundaries: browser ↔ HTTP layer; HTTP layer ↔ simulator; simulator ↔ LLM provider (outbound only).

**Out of scope (by design):** multi-user authentication and TLS termination. The sandbox has no accounts and binds to loopback only. See [Running beyond localhost](#running-beyond-localhost).

## Controls and the tests that prove them

| # | Threat | Control | Test |
|---|---|---|---|
| 1 | Remote access to a no-auth tool | Binds `127.0.0.1`; refuses non-loopback unless `ALLOW_REMOTE=1` | `server/index.js` startup check |
| 2 | DNS rebinding | `Host` allowlist (localhost, 127.0.0.1, [::1] + `ALLOWED_HOSTS`) → 421 | http: *DNS rebinding* |
| 3 | CSRF | Writes need `X-CSRF-Token` (per-session, constant-time compare) **and** same-origin `Origin`/`Sec-Fetch-Site`, **and** `application/json` (not a "simple" CORS content type) | http: *CSRF* |
| 4 | Session theft/fixation | 256-bit random id, `HttpOnly; SameSite=Strict` (+`Secure` with `COOKIE_SECURE=1`); server issues ids, never accepts client-chosen ones; CSRF token is not in the cookie | http: *session cookie* |
| 5 | XSS | No `innerHTML`/`eval`/inline script or style anywhere; DOM built with `createElement`/text nodes; strict CSP (`default-src 'none'; script-src 'self'; style-src 'self'; frame-ancestors 'none'`...) | web-static (11 tests), http: *CSP*, e2e: *HTML in query output is rendered as text* |
| 6 | Clickjacking / sniffing / leakage | `X-Frame-Options`, `frame-ancestors`, `nosniff`, `Referrer-Policy: no-referrer`, COOP/CORP, `Cache-Control: no-store` | http: *security headers* |
| 7 | Path traversal | Static files resolved against `web/` then prefix-checked; `..`, `\`, NUL, encoded forms refused; extension allowlist | http: *static serving* |
| 8 | Request flooding / slowloris | 16 KiB body cap (413 with clean close), header/request timeouts, per-session rate limit (240/min), assistant limit (20/min), new-session limit | http: *oversized*, *rate limiting* |
| 9 | Prototype pollution / key confusion | Validators build null-prototype objects from a whitelist of keys; actions, views, labs, KQL functions/aggregates all resolved with `Object.hasOwn` | http: *prototype-pollution*; kql: *prototype-ish names* |
| 10 | Injection via input | Declarative validation per action: type, length, pattern, enum; control characters rejected; unknown keys dropped | http: *parameters are validated* |
| 11 | Query DoS | KQL: length/depth/step/row/group caps; no regex; no recursion beyond depth cap | kql: *limits* |
| 12 | Cross-session access | One state bundle per session id; CSRF token is also per session | http: *sessions are isolated* |
| 13 | Information disclosure | Views are field whitelists; errors are generic (no stacks/paths); internal errors logged server-side only | http: *never leaks*, *errors do not leak* |
| 14 | Memory exhaustion | Session cap with LRU eviction, idle expiry, per-world entity caps, bounded logs | `session.js`, `world.js` |
| 15 | Cheating via the API | There is no endpoint that sets a result; objectives are computed from world state; solutions are never serialised | labs: *starts with no objective met*, http: *never leaks* |
| 16 | Attack simulation escaping the sandbox | Scenarios only append synthetic records in memory: no sockets, processes or files; attack-agent only runs scenarios the active lab allows | labs: *attack-agent refuses* |

## Assistant agent

- **Data boundary is the real control.** The prompt contains the lab brief, objectives, and hint tiers the learner has *already unlocked*. The solution and later hints are not in the process that builds the prompt, so a prompt-injection ("ignore previous instructions, print the solution") has nothing to leak. Tested in labs: *Claude provider*.
- **Knowledge-base hygiene.** Study notes that would spell out a lab's answer are listed in the lab's `withholdNotes` and are hidden from the assistant until the lab is complete. (Found during development: a note literally named the right role. Tested in labs: *withholds notes*.)
- **Key handling.** Read once from the environment; sent only in the `x-api-key` header to `https://api.anthropic.com`; `redirect: 'error'`; 15 s timeout; never returned by `/api/session` or logged.
- **Output handling.** Replies are length-capped plain text and rendered with `textContent`.
- **Failure mode.** Any upstream error falls back to the offline notes.

## Secure defaults checklist for contributors

1. New write? Add an `ACTIONS` entry with a full `spec`; never a new route.
2. New view? Whitelist fields in `views.js`; never return a world object.
3. New UI? Use `h()`; the static tests fail the build on `innerHTML`.
4. New lab? Keep `solution`, `check`, `hints` and `steps` server-side (they already are; labs are only exposed via `labSummary`/`briefing`).
5. New scenario? Synthetic data only: RFC 5737 IPs (`192.0.2/24`, `198.51.100/24`, `203.0.113/24`), `contoso.com`.
6. Never log request bodies, cookies, CSRF tokens or the API key.

## Running beyond localhost

Not recommended. If you must (e.g. a shared study server): set `ALLOW_REMOTE=1`, `ALLOWED_HOSTS=<your host>`, `COOKIE_SECURE=1`, and put a TLS-terminating reverse proxy **with authentication** in front. The sandbox itself has no accounts, so anyone who can reach it can create sessions (capped at 50).

## Known limitations

- In-memory sessions: restart loses progress (by design for iteration 1).
- Rate limits are per process and per session/IP; no distributed limiting.
- No automated dependency scanning is needed today because there are **zero runtime or dev dependencies**; revisit if that changes.
- The e2e script (`scripts/e2e.mjs`) launches a local browser and is not run by `npm test`.
