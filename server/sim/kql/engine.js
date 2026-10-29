// Mini-KQL: a small, safe interpreter for the subset of Kusto Query Language that the
// SC-200 labs need. It is NOT a faithful KQL implementation (see docs/ARCHITECTURE.md).
//
// Security notes:
//  - No eval/Function; queries are parsed to an AST and interpreted.
//  - Hard caps on query length, parser depth, evaluation steps and result size so a
//    hostile or accidental query cannot hang the server.
//  - No regex operators are exposed (avoids ReDoS); `matches regex`/`extract` are unsupported.
//  - Table and column lookups use Map / Object.hasOwn so names like "constructor" are inert.

export class KqlError extends Error {
  constructor(message, kind = 'Semantic') {
    super(message);
    this.name = 'KqlError';
    this.kind = kind;
  }
}

export const LIMITS = Object.freeze({
  maxQueryLength: 4000,
  maxDepth: 40,
  maxSteps: 3_000_000,
  maxResultRows: 1000,
  maxJoinRows: 100_000,
});

const TS_UNITS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
const HYPHEN_OPS = /^(project-away|project-keep)(?![\w-])/;
const CMP_WORDS = new Set([
  'contains', '!contains', 'has', '!has', 'startswith', '!startswith',
  'endswith', '!endswith', 'in', '!in', 'between',
]);
const UNSUPPORTED_OPS = new Set([
  'lookup', 'mv-expand', 'mvexpand', 'parse', 'evaluate', 'invoke', 'make-series',
  'serialize', 'sample', 'getschema', 'as', 'let', 'externaldata', 'materialize',
]);

// ---------------------------------------------------------------- lexer

function lex(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let out = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) {
          const n = src[j + 1];
          out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          j += 2;
        } else {
          out += src[j++];
        }
      }
      if (j >= src.length) throw new KqlError('Syntax error: unterminated string literal', 'Syntax');
      toks.push({ t: 'str', v: out, pos: i });
      i = j + 1;
      continue;
    }
    if (/\d/.test(c)) {
      const m = /^\d+(\.\d+)?/.exec(src.slice(i, i + 40));
      let end = i + m[0].length;
      const unit = /^(ms|s|m|h|d)(?![A-Za-z0-9_])/.exec(src.slice(end, end + 3));
      if (unit) {
        toks.push({ t: 'ts', v: Number(m[0]) * TS_UNITS[unit[1]], pos: i });
        end += unit[1].length;
      } else {
        toks.push({ t: 'num', v: Number(m[0]), pos: i });
      }
      i = end;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) { // '$' only so `$left.Col == $right.Col` lexes
      const rest = src.slice(i, i + 40);
      const h = HYPHEN_OPS.exec(rest);
      const m = h || /^[A-Za-z_$][A-Za-z0-9_]*/.exec(rest);
      // identifiers longer than the 40-char window are re-read in full
      let word = m[0];
      if (!h && word.length === 40) word = /^[A-Za-z_$][A-Za-z0-9_]*/.exec(src.slice(i))[0];
      toks.push({ t: 'id', v: word, pos: i });
      i += word.length;
      continue;
    }
    if (c === '!' && /[a-z]/.test(src[i + 1] || '')) {
      const m = /^![a-z_]+/.exec(src.slice(i, i + 20));
      toks.push({ t: 'id', v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '=~', '!~', '<=', '>=', '..'].includes(two)) {
      toks.push({ t: 'op', v: two, pos: i });
      i += 2;
      continue;
    }
    if ('|(),=<>+-*/%.'.includes(c)) {
      toks.push({ t: 'op', v: c, pos: i });
      i++;
      continue;
    }
    throw new KqlError(`Syntax error: unexpected character '${c}'`, 'Syntax');
  }
  toks.push({ t: 'eof', v: null, pos: src.length });
  return toks;
}

// ---------------------------------------------------------------- parser

class Parser {
  constructor(toks) {
    this.toks = toks;
    this.p = 0;
    this.depth = 0;
  }
  peek(o = 0) { return this.toks[Math.min(this.p + o, this.toks.length - 1)]; }
  next() { return this.toks[this.p++]; }
  isOp(v, o = 0) { const t = this.peek(o); return t.t === 'op' && t.v === v; }
  isWord(v, o = 0) { const t = this.peek(o); return t.t === 'id' && t.v.toLowerCase() === v; }
  expectOp(v) {
    if (!this.isOp(v)) throw this.err(`expected '${v}'`);
    return this.next();
  }
  expectId() {
    const t = this.peek();
    if (t.t !== 'id') throw this.err('expected a name');
    return this.next().v;
  }
  err(msg) {
    const t = this.peek();
    const near = t.t === 'eof' ? 'end of query' : `'${t.v}'`;
    return new KqlError(`Syntax error: ${msg} near ${near}`, 'Syntax');
  }
  enter() {
    if (++this.depth > LIMITS.maxDepth) throw new KqlError('Query is nested too deeply', 'Syntax');
  }
  leave() { this.depth--; }

  parseQuery() {
    const stages = this.parseStages();
    if (this.peek().t !== 'eof') throw this.err('unexpected token');
    return stages;
  }

  /** A table-or-union source followed by `| operator` stages. Stops at ')' or end of input. */
  parseStages() {
    const stages = [];
    const t = this.peek();
    if (t.t !== 'id') throw this.err('a query must start with a table name');
    if (t.v.toLowerCase() === 'union') {
      this.next();
      stages.push({ op: 'union', ...this.parseUnionArgs(true) });
    } else if (UNSUPPORTED_OPS.has(t.v.toLowerCase())) {
      throw new KqlError(`'${t.v}' statements are not supported in this sandbox. Start with a table name.`, 'Unsupported');
    } else {
      this.next();
      stages.push({ op: 'table', name: t.v });
    }
    while (this.isOp('|')) {
      this.next();
      stages.push(this.parseOperator());
    }
    return stages;
  }

  // join [kind=inner|leftouter] ( <sub-query> ) on Col[, Col2]  |  on $left.A == $right.B
  parseJoin() {
    let kind = 'inner';
    if (this.isWord('kind') && this.isOp('=', 1)) {
      this.next(); this.next();
      kind = this.expectId().toLowerCase();
      if (kind !== 'inner' && kind !== 'leftouter') {
        throw new KqlError(`join kind '${kind}' is not supported in this sandbox (use inner or leftouter)`, 'Unsupported');
      }
    }
    this.expectOp('(');
    this.enter();
    const sub = this.parseStages();
    this.leave();
    this.expectOp(')');
    if (!this.isWord('on')) throw this.err("expected 'on' followed by the join column(s)");
    this.next();
    const keys = [];
    do {
      if (keys.length) this.next();
      if (this.peek().t === 'id' && this.peek().v === '$left') {
        this.next(); this.expectOp('.');
        const l = this.expectId();
        this.expectOp('==');
        if (!(this.peek().t === 'id' && this.peek().v === '$right')) throw this.err("expected '$right'");
        this.next(); this.expectOp('.');
        keys.push({ l, r: this.expectId() });
      } else {
        const c = this.expectId();
        keys.push({ l: c, r: c });
      }
    } while (this.isOp(','));
    return { op: 'join', kind, sub, keys };
  }

  parseUnionArgs(asSource) {
    let withsource = null;
    while (this.peek().t === 'id' && this.isOp('=', 1)) {
      const name = this.next().v.toLowerCase();
      this.next();
      const val = this.next();
      if (name === 'withsource') withsource = String(val.v);
      else if (name !== 'kind' && name !== 'isfuzzy') throw this.err(`unknown union option '${name}'`);
    }
    const tables = [this.expectId()];
    while (this.isOp(',')) { this.next(); tables.push(this.expectId()); }
    return { tables, withsource, asSource };
  }

  parseOperator() {
    const t = this.peek();
    if (t.t !== 'id') throw this.err('expected an operator');
    const name = t.v.toLowerCase();
    if (UNSUPPORTED_OPS.has(name)) {
      throw new KqlError(`The '${t.v}' operator is not supported in this sandbox.`, 'Unsupported');
    }
    this.next();
    switch (name) {
      case 'where': case 'filter': return { op: 'where', expr: this.parseExpr() };
      case 'project': return { op: 'project', items: this.parseNamedList() };
      case 'project-away': return { op: 'project-away', names: this.parseIdList() };
      case 'project-keep': return { op: 'project-keep', names: this.parseIdList() };
      case 'extend': return { op: 'extend', items: this.parseNamedList() };
      case 'summarize': return this.parseSummarize();
      case 'sort': case 'order': return this.parseSort();
      case 'take': case 'limit': return { op: 'limit', n: this.parseCount() };
      case 'top': {
        const n = this.parseCount();
        if (!this.isWord('by')) throw this.err("expected 'by'");
        this.next();
        const expr = this.parseExpr();
        const desc = this.parseDir();
        return { op: 'top', n, key: { expr, desc } };
      }
      case 'distinct': return { op: 'distinct', items: this.parseNamedList() };
      case 'count': return { op: 'count' };
      case 'union': return { op: 'union', ...this.parseUnionArgs(false) };
      case 'join': return this.parseJoin();
      case 'render': {
        const chart = this.expectId().toLowerCase();
        if (this.isWord('with')) {
          this.next();
          this.expectOp('(');
          let d = 1;
          while (d > 0) {
            const x = this.next();
            if (x.t === 'eof') throw this.err("expected ')'");
            if (x.t === 'op' && x.v === '(') d++;
            if (x.t === 'op' && x.v === ')') d--;
          }
        }
        return { op: 'render', chart };
      }
      default:
        throw new KqlError(`Unknown operator '${t.v}'`, 'Syntax');
    }
  }

  parseCount() {
    const t = this.next();
    if (t.t !== 'num' || !Number.isInteger(t.v) || t.v < 0) throw this.err('expected a whole number');
    return t.v;
  }
  parseDir() {
    if (this.isWord('asc')) { this.next(); return false; }
    if (this.isWord('desc')) { this.next(); return true; }
    return true;
  }
  parseIdList() {
    const out = [this.expectId()];
    while (this.isOp(',')) { this.next(); out.push(this.expectId()); }
    return out;
  }
  parseNamedList() {
    const items = [];
    do {
      if (items.length) this.next();
      let name = null;
      if (this.peek().t === 'id' && this.isOp('=', 1)) {
        name = this.next().v;
        this.next();
      }
      items.push({ name, expr: this.parseExpr() });
    } while (this.isOp(','));
    return items;
  }
  parseSort() {
    if (!this.isWord('by')) throw this.err("expected 'by'");
    this.next();
    const keys = [];
    do {
      if (keys.length) this.next();
      const expr = this.parseExpr();
      keys.push({ expr, desc: this.parseDir() });
    } while (this.isOp(','));
    return { op: 'sort', keys };
  }
  parseSummarize() {
    const aggs = [];
    let by = [];
    if (!this.isWord('by')) {
      do {
        if (aggs.length) this.next();
        let name = null;
        if (this.peek().t === 'id' && this.isOp('=', 1)) {
          name = this.next().v;
          this.next();
        }
        const expr = this.parseExpr();
        if (expr.k !== 'call' || !isAgg(expr.name.toLowerCase())) {
          throw new KqlError('summarize requires aggregation functions such as count(), dcount(), sum()', 'Semantic');
        }
        aggs.push({ name, expr });
      } while (this.isOp(','));
    }
    if (this.isWord('by')) {
      this.next();
      by = this.parseNamedList();
    }
    if (!aggs.length && !by.length) throw this.err('summarize needs an aggregation or a by clause');
    return { op: 'summarize', aggs, by };
  }

  // expressions ---------------------------------------------------------
  parseExpr() {
    this.enter();
    try { return this.parseOr(); } finally { this.leave(); }
  }
  parseOr() {
    let l = this.parseAnd();
    while (this.isWord('or')) { this.next(); l = { k: 'bin', op: 'or', l, r: this.parseAnd() }; }
    return l;
  }
  parseAnd() {
    let l = this.parseCmp();
    while (this.isWord('and')) { this.next(); l = { k: 'bin', op: 'and', l, r: this.parseCmp() }; }
    return l;
  }
  parseCmp() {
    const l = this.parseAdd();
    const t = this.peek();
    let op = null;
    if (t.t === 'op' && ['==', '!=', '=~', '!~', '<', '>', '<=', '>='].includes(t.v)) op = t.v;
    else if (t.t === 'id' && CMP_WORDS.has(t.v.toLowerCase())) op = t.v.toLowerCase();
    if (!op) return l;
    this.next();
    if (op === 'in' || op === '!in') {
      this.expectOp('(');
      const list = [this.parseAdd()];
      while (this.isOp(',')) { this.next(); list.push(this.parseAdd()); }
      this.expectOp(')');
      return { k: 'in', e: l, list, neg: op === '!in' };
    }
    if (op === 'between') {
      this.expectOp('(');
      const lo = this.parseAdd();
      this.expectOp('..');
      const hi = this.parseAdd();
      this.expectOp(')');
      return { k: 'between', e: l, lo, hi };
    }
    return { k: 'bin', op, l, r: this.parseAdd() };
  }
  parseAdd() {
    let l = this.parseMul();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.next().v;
      l = { k: 'bin', op, l, r: this.parseMul() };
    }
    return l;
  }
  parseMul() {
    let l = this.parseUnary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const op = this.next().v;
      l = { k: 'bin', op, l, r: this.parseUnary() };
    }
    return l;
  }
  parseUnary() {
    if (this.isOp('-')) { this.next(); return { k: 'neg', e: this.parseUnary() }; }
    return this.parsePrimary();
  }
  parsePrimary() {
    const t = this.peek();
    if (t.t === 'num' || t.t === 'ts') { this.next(); return { k: 'lit', v: t.v }; }
    if (t.t === 'str') { this.next(); return { k: 'lit', v: t.v }; }
    if (t.t === 'op' && t.v === '(') {
      this.next();
      const e = this.parseExpr();
      this.expectOp(')');
      return e;
    }
    if (t.t === 'op' && t.v === '*') { this.next(); return { k: 'star' }; }
    if (t.t === 'id') {
      this.next();
      const lower = t.v.toLowerCase();
      if (this.isOp('(')) {
        this.next();
        const args = [];
        if (!this.isOp(')')) {
          args.push(this.parseExpr());
          while (this.isOp(',')) { this.next(); args.push(this.parseExpr()); }
        }
        this.expectOp(')');
        return { k: 'call', name: t.v, args };
      }
      if (lower === 'true') return { k: 'lit', v: true };
      if (lower === 'false') return { k: 'lit', v: false };
      if (lower === 'null') return { k: 'lit', v: null };
      return { k: 'col', name: t.v };
    }
    throw this.err('expected an expression');
  }
}

// ---------------------------------------------------------------- values

const isDate = (v) => v instanceof Date;
const isNil = (v) => v === null || v === undefined;

function str(v) {
  if (isNil(v)) return '';
  if (isDate(v)) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
function num(v) {
  if (isDate(v)) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return NaN;
}
function looseEq(a, b) {
  if (isNil(a) || isNil(b)) return isNil(a) && isNil(b);
  if (isDate(a) || isDate(b)) return num(a) === num(b);
  if (typeof a === typeof b) return a === b;
  return str(a) === str(b);
}
function compare(a, b) {
  if (isNil(a) && isNil(b)) return 0;
  if (isNil(a)) return -1;
  if (isNil(b)) return 1;
  const na = num(a), nb = num(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && (typeof a !== 'string' || typeof b !== 'string')) return na - nb;
  const sa = str(a), sb = str(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
const hasTerm = (hay, needle) => {
  const h = hay.toLowerCase(), n = needle.toLowerCase();
  if (!n) return false;
  let from = 0;
  const isWordCh = (ch) => /[a-z0-9]/.test(ch);
  for (;;) {
    const idx = h.indexOf(n, from);
    if (idx < 0) return false;
    const before = idx === 0 ? '' : h[idx - 1];
    const after = h[idx + n.length] ?? '';
    if ((!before || !isWordCh(before)) && (!after || !isWordCh(after))) return true;
    from = idx + 1;
  }
};

function strMatch(op, hay, needle) {
  const h = str(hay), n = str(needle);
  switch (op) {
    case 'contains': return h.toLowerCase().includes(n.toLowerCase());
    case 'has': return hasTerm(h, n);
    case 'startswith': return h.toLowerCase().startsWith(n.toLowerCase());
    case 'endswith': return h.toLowerCase().endsWith(n.toLowerCase());
    default: return false;
  }
}

// ---------------------------------------------------------------- functions

const FUNCS = {
  ago: (ctx, [ts]) => new Date(ctx.now - num(ts)),
  now: (ctx) => new Date(ctx.now),
  strlen: (_c, [s]) => str(s).length,
  tolower: (_c, [s]) => str(s).toLowerCase(),
  toupper: (_c, [s]) => str(s).toUpperCase(),
  tostring: (_c, [v]) => (isNil(v) ? '' : str(v)),
  toint: (_c, [v]) => { const n = num(v); return Number.isNaN(n) ? null : Math.trunc(n); },
  tolong: (_c, [v]) => { const n = num(v); return Number.isNaN(n) ? null : Math.trunc(n); },
  todouble: (_c, [v]) => { const n = num(v); return Number.isNaN(n) ? null : n; },
  isempty: (_c, [v]) => isNil(v) || str(v) === '',
  isnotempty: (_c, [v]) => !(isNil(v) || str(v) === ''),
  isnull: (_c, [v]) => isNil(v),
  isnotnull: (_c, [v]) => !isNil(v),
  not: (_c, [v]) => !v,
  iff: (_c, [c, a, b]) => (c ? a : b),
  iif: (_c, [c, a, b]) => (c ? a : b),
  coalesce: (_c, args) => args.find((a) => !isNil(a) && a !== '') ?? null,
  strcat: (_c, args) => args.map(str).join(''),
  substring: (_c, [s, start, len]) => str(s).substr(num(start), isNil(len) ? undefined : num(len)),
  round: (_c, [v, d = 0]) => { const f = 10 ** num(d); return Math.round(num(v) * f) / f; },
  floor: (_c, [v]) => Math.floor(num(v)),
  abs: (_c, [v]) => Math.abs(num(v)),
  bin: (_c, [v, size]) => {
    const s = num(size);
    if (!(s > 0)) throw new KqlError('bin() size must be greater than zero');
    const b = Math.floor(num(v) / s) * s;
    return isDate(v) ? new Date(b) : b;
  },
  startofday: (_c, [v]) => { const d = new Date(num(v)); d.setUTCHours(0, 0, 0, 0); return d; },
};

// Own-property lookups only: names like "constructor" must never resolve via Object.prototype.
const isFunc = (n) => Object.hasOwn(FUNCS, n);
const isAgg = (n) => Object.hasOwn(AGGS, n);

// aggregates: each returns { init, add(state, args), done(state) }
const AGGS = {
  count: { argc: 0, mk: () => ({ n: 0 }), add: (s) => { s.n++; }, done: (s) => s.n, name: () => 'count_' },
  countif: { argc: 1, mk: () => ({ n: 0 }), add: (s, [p]) => { if (p) s.n++; }, done: (s) => s.n, name: () => 'countif_' },
  dcount: { argc: 1, mk: () => ({ set: new Set() }), add: (s, [v]) => { if (!isNil(v)) s.set.add(isDate(v) ? v.getTime() : v); }, done: (s) => s.set.size, name: (a) => `dcount_${a}` },
  count_distinct: { argc: 1, mk: () => ({ set: new Set() }), add: (s, [v]) => { if (!isNil(v)) s.set.add(isDate(v) ? v.getTime() : v); }, done: (s) => s.set.size, name: (a) => `count_distinct_${a}` },
  sum: { argc: 1, mk: () => ({ t: 0 }), add: (s, [v]) => { const n = num(v); if (!Number.isNaN(n)) s.t += n; }, done: (s) => s.t, name: (a) => `sum_${a}` },
  avg: { argc: 1, mk: () => ({ t: 0, n: 0 }), add: (s, [v]) => { const n = num(v); if (!Number.isNaN(n)) { s.t += n; s.n++; } }, done: (s) => (s.n ? s.t / s.n : null), name: (a) => `avg_${a}` },
  min: { argc: 1, mk: () => ({ v: undefined }), add: (s, [v]) => { if (!isNil(v) && (s.v === undefined || compare(v, s.v) < 0)) s.v = v; }, done: (s) => s.v ?? null, name: (a) => `min_${a}` },
  max: { argc: 1, mk: () => ({ v: undefined }), add: (s, [v]) => { if (!isNil(v) && (s.v === undefined || compare(v, s.v) > 0)) s.v = v; }, done: (s) => s.v ?? null, name: (a) => `max_${a}` },
  // arg_max/arg_min(key, col1, col2 | *): emit the chosen columns from the winning row.
  arg_max: { multi: true, mk: () => ({ best: undefined, row: null }), add: (s, [k], row) => { if (!isNil(k) && (s.best === undefined || compare(k, s.best) > 0)) { s.best = k; s.row = row; } }, name: () => 'arg_max_' },
  arg_min: { multi: true, mk: () => ({ best: undefined, row: null }), add: (s, [k], row) => { if (!isNil(k) && (s.best === undefined || compare(k, s.best) < 0)) { s.best = k; s.row = row; } }, name: () => 'arg_min_' },
  make_set: { argc: 1, mk: () => ({ set: new Set() }), add: (s, [v]) => { if (!isNil(v) && s.set.size < 1000) s.set.add(isDate(v) ? v.toISOString() : v); }, done: (s) => [...s.set], name: (a) => `set_${a}` },
  make_list: { argc: 1, mk: () => ({ l: [] }), add: (s, [v]) => { if (!isNil(v) && s.l.length < 1000) s.l.push(isDate(v) ? v.toISOString() : v); }, done: (s) => s.l, name: (a) => `list_${a}` },
};

// ---------------------------------------------------------------- evaluation

function didYouMean(name, candidates) {
  const lower = name.toLowerCase();
  let best = null, bestD = 3;
  for (const c of candidates) {
    if (c.toLowerCase() === lower) return c;
    const d = lev(lower, c.toLowerCase());
    if (d < bestD) { best = c; bestD = d; }
    else if (c.toLowerCase().startsWith(lower) || lower.startsWith(c.toLowerCase())) { best = best ?? c; }
  }
  return best;
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

function tick(ctx, n = 1) {
  ctx.steps += n;
  if (ctx.steps > LIMITS.maxSteps) throw new KqlError('Query exceeded the sandbox compute limit. Add a time filter or a where clause earlier in the query.', 'Limit');
}

function walk(node, fn) {
  if (!node) return;
  fn(node);
  switch (node.k) {
    case 'bin': walk(node.l, fn); walk(node.r, fn); break;
    case 'neg': walk(node.e, fn); break;
    case 'in': walk(node.e, fn); node.list.forEach((n) => walk(n, fn)); break;
    case 'between': walk(node.e, fn); walk(node.lo, fn); walk(node.hi, fn); break;
    case 'call': node.args.forEach((n) => walk(n, fn)); break;
    default: break;
  }
}

function checkColumns(node, columns) {
  walk(node, (n) => {
    if (n.k === 'col' && !columns.includes(n.name)) {
      const s = didYouMean(n.name, columns);
      throw new KqlError(`Failed to resolve scalar expression named '${n.name}'.${s ? ` Did you mean '${s}'?` : ''}`);
    }
    if (n.k === 'call') {
      const low = n.name.toLowerCase();
      if (!isFunc(low) && !isAgg(low)) {
        const s = didYouMean(low, [...Object.keys(FUNCS), ...Object.keys(AGGS)]);
        throw new KqlError(`Unknown function '${n.name}'.${s ? ` Did you mean '${s}'?` : ''}`);
      }
    }
  });
}

function evalExpr(node, row, ctx) {
  tick(ctx);
  switch (node.k) {
    case 'lit': return node.v;
    case 'col': return row[node.name] ?? null;
    case 'neg': return -num(evalExpr(node.e, row, ctx));
    case 'star': throw new KqlError("'*' can only be used with has/contains/startswith, e.g. where * has \"value\"");
    case 'call': {
      const low = node.name.toLowerCase();
      if (isAgg(low)) throw new KqlError(`Aggregation '${node.name}' can only be used inside summarize`);
      const args = node.args.map((a) => evalExpr(a, row, ctx));
      return FUNCS[low](ctx, args);
    }
    case 'in': {
      const v = evalExpr(node.e, row, ctx);
      const hit = node.list.some((n) => looseEq(v, evalExpr(n, row, ctx)));
      return node.neg ? !hit : hit;
    }
    case 'between': {
      const v = evalExpr(node.e, row, ctx);
      return compare(v, evalExpr(node.lo, row, ctx)) >= 0 && compare(v, evalExpr(node.hi, row, ctx)) <= 0;
    }
    case 'bin': return evalBin(node, row, ctx);
    default: throw new KqlError('Unsupported expression');
  }
}

function evalBin(node, row, ctx) {
  const { op } = node;
  if (op === 'and') return Boolean(evalExpr(node.l, row, ctx)) && Boolean(evalExpr(node.r, row, ctx));
  if (op === 'or') return Boolean(evalExpr(node.l, row, ctx)) || Boolean(evalExpr(node.r, row, ctx));
  const neg = op.startsWith('!') && /[a-z]/.test(op[1] || '');
  const baseOp = neg ? op.slice(1) : op;
  if (['contains', 'has', 'startswith', 'endswith'].includes(baseOp)) {
    const right = evalExpr(node.r, row, ctx);
    let hit;
    if (node.l.k === 'star') {
      hit = Object.values(row).some((v) => !isNil(v) && strMatch(baseOp, v, right));
    } else {
      hit = strMatch(baseOp, evalExpr(node.l, row, ctx), right);
    }
    return neg ? !hit : hit;
  }
  const l = evalExpr(node.l, row, ctx);
  const r = evalExpr(node.r, row, ctx);
  switch (op) {
    case '==': return looseEq(l, r);
    case '!=': return !looseEq(l, r);
    case '=~': return str(l).toLowerCase() === str(r).toLowerCase();
    case '!~': return str(l).toLowerCase() !== str(r).toLowerCase();
    case '<': return compare(l, r) < 0;
    case '>': return compare(l, r) > 0;
    case '<=': return compare(l, r) <= 0;
    case '>=': return compare(l, r) >= 0;
    case '+':
      if (typeof l === 'string' || typeof r === 'string') return str(l) + str(r);
      return num(l) + num(r);
    case '-':
      if (isDate(l) && isDate(r)) return l.getTime() - r.getTime();
      if (isDate(l)) return new Date(l.getTime() - num(r));
      return num(l) - num(r);
    case '*': return num(l) * num(r);
    case '/': return num(r) === 0 ? null : num(l) / num(r);
    case '%': return num(r) === 0 ? null : num(l) % num(r);
    default: throw new KqlError(`Unsupported operator '${op}'`);
  }
}

function defaultName(item, i) {
  if (item.name) return item.name;
  const e = item.expr;
  if (e.k === 'col') return e.name;
  if (e.k === 'call' && e.name.toLowerCase() === 'bin' && e.args[0]?.k === 'col') return e.args[0].name;
  return `Column${i + 1}`;
}

function sourceTable(name, ctx) {
  const t = ctx.tables.get(name);
  if (!t) {
    const s = didYouMean(name, [...ctx.tables.keys()]);
    throw new KqlError(`Failed to resolve table or column expression named '${name}'.${s ? ` Did you mean '${s}'?` : ''}`);
  }
  ctx.touched.add(name);
  // Huge tables: charge a per-row scan cost up front so aggregating the raw table "times out" the way
  // it does on a real high-volume custom table. Summary tables carry no scanCost.
  if (t.scanCost && !ctx.noScanCost) {
    const cost = t.rows.length * t.scanCost;
    if (ctx.steps + cost > LIMITS.maxSteps) {
      throw new KqlError(`The request timed out while scanning '${name}' (${t.rows.length.toLocaleString('en-US')} rows). Aggregate the raw table with a summary rule and query the summary table instead.`, 'Timeout');
    }
    ctx.steps += cost;
  }
  return t;
}

function unionTables(names, ctx, withsource) {
  const columns = [];
  const rows = [];
  for (const n of names) {
    const t = sourceTable(n, ctx);
    for (const c of t.columns) if (!columns.includes(c.name)) columns.push(c.name);
  }
  if (withsource && !columns.includes(withsource)) columns.unshift(withsource);
  for (const n of names) {
    for (const r of ctx.tables.get(n).rows) {
      tick(ctx);
      rows.push(withsource ? { ...r, [withsource]: n } : r);
    }
  }
  return { columns, rows };
}

function runStages(stages, ctx) {
  let columns = [];
  let rows = [];
  let render = null;

  for (const st of stages) {
    switch (st.op) {
      case 'table': {
        const t = sourceTable(st.name, ctx);
        columns = t.columns.map((c) => c.name);
        rows = t.rows;
        break;
      }
      case 'union': {
        if (st.asSource) {
          ({ columns, rows } = unionTables(st.tables, ctx, st.withsource));
        } else {
          const other = unionTables(st.tables, ctx, st.withsource);
          const cols = [...columns];
          for (const c of other.columns) if (!cols.includes(c)) cols.push(c);
          columns = cols;
          rows = rows.concat(other.rows);
        }
        break;
      }
      case 'where': {
        checkColumns(st.expr, columns);
        rows = rows.filter((r) => evalExpr(st.expr, r, ctx) === true);
        break;
      }
      case 'project': {
        st.items.forEach((it) => checkColumns(it.expr, columns));
        const names = st.items.map(defaultName);
        rows = rows.map((r) => {
          const o = {};
          st.items.forEach((it, i) => { o[names[i]] = evalExpr(it.expr, r, ctx); });
          return o;
        });
        columns = names;
        break;
      }
      case 'project-away': {
        st.names.forEach((n) => { if (!columns.includes(n)) throw new KqlError(`Failed to resolve column '${n}'`); });
        columns = columns.filter((c) => !st.names.includes(c));
        rows = rows.map((r) => { const o = {}; columns.forEach((c) => { o[c] = r[c]; }); return o; });
        break;
      }
      case 'project-keep': {
        st.names.forEach((n) => { if (!columns.includes(n)) throw new KqlError(`Failed to resolve column '${n}'`); });
        columns = st.names.slice();
        rows = rows.map((r) => { const o = {}; columns.forEach((c) => { o[c] = r[c]; }); return o; });
        break;
      }
      case 'extend': {
        for (const it of st.items) checkColumns(it.expr, columns);
        const names = st.items.map(defaultName);
        rows = rows.map((r) => {
          const o = { ...r };
          st.items.forEach((it, i) => { o[names[i]] = evalExpr(it.expr, o, ctx); });
          return o;
        });
        names.forEach((n) => { if (!columns.includes(n)) columns = [...columns, n]; });
        break;
      }
      case 'summarize': ({ columns, rows } = summarize(st, columns, rows, ctx)); break;
      case 'sort': {
        st.keys.forEach((k) => checkColumns(k.expr, columns));
        const keyed = rows.map((r) => ({ r, k: st.keys.map((k) => evalExpr(k.expr, r, ctx)) }));
        tick(ctx, keyed.length);
        keyed.sort((a, b) => {
          for (let i = 0; i < st.keys.length; i++) {
            const c = compare(a.k[i], b.k[i]);
            if (c) return st.keys[i].desc ? -c : c;
          }
          return 0;
        });
        rows = keyed.map((x) => x.r);
        break;
      }
      case 'join': {
        const right = runStages(st.sub, ctx);
        for (const k of st.keys) {
          if (!columns.includes(k.l)) throw new KqlError(`Failed to resolve column '${k.l}' on the left side of the join.${suggest(k.l, columns)}`);
          if (!right.columns.includes(k.r)) throw new KqlError(`Failed to resolve column '${k.r}' on the right side of the join.${suggest(k.r, right.columns)}`);
        }
        ({ columns, rows } = joinRows(st, columns, rows, right, ctx));
        break;
      }
      case 'limit': rows = rows.slice(0, st.n); break;
      case 'top': {
        checkColumns(st.key.expr, columns);
        const keyed = rows.map((r) => ({ r, k: evalExpr(st.key.expr, r, ctx) }));
        keyed.sort((a, b) => (st.key.desc ? -1 : 1) * compare(a.k, b.k));
        rows = keyed.slice(0, st.n).map((x) => x.r);
        break;
      }
      case 'distinct': {
        st.items.forEach((it) => checkColumns(it.expr, columns));
        const names = st.items.map(defaultName);
        const seen = new Set();
        const out = [];
        for (const r of rows) {
          const o = {};
          st.items.forEach((it, i) => { o[names[i]] = evalExpr(it.expr, r, ctx); });
          const key = JSON.stringify(names.map((n) => (isDate(o[n]) ? o[n].getTime() : o[n])));
          if (!seen.has(key)) { seen.add(key); out.push(o); }
        }
        columns = names;
        rows = out;
        break;
      }
      case 'count':
        rows = [{ Count: rows.length }];
        columns = ['Count'];
        break;
      case 'render': render = st.chart; break;
      default: throw new KqlError(`Unsupported stage ${st.op}`);
    }
  }
  return { columns, rows, render };
}

const suggest = (name, cols) => { const s = didYouMean(name, cols); return s ? ` Did you mean '${s}'?` : ''; };

/** Hash join. A right-side column whose name clashes gets a numeric suffix (BehaviorId -> BehaviorId1), as in Kusto. */
function joinRows(st, lcols, lrows, right, ctx) {
  const keyOf = (row, names) => JSON.stringify(names.map((n) => { const v = row[n]; return isDate(v) ? v.getTime() : isNil(v) ? null : v; }));
  const index = new Map();
  const rKeys = st.keys.map((k) => k.r);
  for (const r of right.rows) {
    tick(ctx);
    const k = keyOf(r, rKeys);
    const bucket = index.get(k);
    if (bucket) bucket.push(r); else index.set(k, [r]);
  }
  const outCols = [...lcols];
  const rename = new Map();
  for (const c of right.columns) {
    let n = c;
    for (let i = 1; outCols.includes(n); i++) n = `${c}${i}`;
    outCols.push(n);
    rename.set(c, n);
  }
  const lKeys = st.keys.map((k) => k.l);
  const out = [];
  for (const l of lrows) {
    tick(ctx);
    const matches = index.get(keyOf(l, lKeys));
    if (!matches) { if (st.kind === 'leftouter') out.push({ ...l }); continue; }
    for (const m of matches) {
      if (out.length >= LIMITS.maxJoinRows) throw new KqlError(`The join produced more than ${LIMITS.maxJoinRows.toLocaleString('en-US')} rows. Filter both sides first.`, 'Limit');
      const o = { ...l };
      for (const [c, n] of rename) o[n] = m[c];
      out.push(o);
    }
  }
  return { columns: outCols, rows: out };
}

function summarize(st, columns, rows, ctx) {
  st.by.forEach((b) => checkColumns(b.expr, columns));
  st.aggs.forEach((a) => a.expr.args.forEach((x) => checkColumns(x, columns)));
  const byNames = st.by.map(defaultName);
  const aggDefs = st.aggs.map((a, i) => {
    const low = a.expr.name.toLowerCase();
    const def = AGGS[low];
    if (def.multi) {
      if (a.expr.args.length < 2) throw new KqlError(`${a.expr.name}() expects a key and at least one column, e.g. ${a.expr.name}(Timestamp, *)`);
      const cols = [];
      for (const x of a.expr.args.slice(1)) {
        if (x.k === 'star') columns.forEach((c) => cols.push(c));
        else if (x.k === 'col') cols.push(x.name);
        else throw new KqlError(`${a.expr.name}() columns must be plain column names`);
      }
      const outCols = [...new Set(cols)].filter((c) => !byNames.includes(c));
      return { def, expr: a.expr, multi: outCols };
    }
    if (a.expr.args.length !== def.argc) throw new KqlError(`${a.expr.name}() expects ${def.argc} argument(s)`);
    const argLabel = a.expr.args[0]?.k === 'col' ? a.expr.args[0].name : `arg${i}`;
    return { def, expr: a.expr, name: a.name || def.name(argLabel) };
  });
  const groups = new Map();
  for (const r of rows) {
    tick(ctx);
    const keyVals = st.by.map((b) => evalExpr(b.expr, r, ctx));
    const key = JSON.stringify(keyVals.map((v) => (isDate(v) ? v.getTime() : v)));
    let g = groups.get(key);
    if (!g) {
      if (groups.size >= 50_000) throw new KqlError('Too many groups for the sandbox (limit 50,000)', 'Limit');
      g = { keyVals, states: aggDefs.map((d) => d.def.mk()) };
      groups.set(key, g);
    }
    aggDefs.forEach((d, i) => {
      const args = d.multi ? [evalExpr(d.expr.args[0], r, ctx)] : d.expr.args.map((x) => evalExpr(x, r, ctx));
      d.def.add(g.states[i], args, r);
    });
  }
  if (!st.by.length && groups.size === 0) {
    groups.set('', { keyVals: [], states: aggDefs.map((d) => d.def.mk()) });
  }
  const out = [];
  for (const g of groups.values()) {
    const o = {};
    byNames.forEach((n, i) => { o[n] = g.keyVals[i]; });
    aggDefs.forEach((d, i) => {
      if (d.multi) d.multi.forEach((c) => { o[c] = g.states[i].row?.[c] ?? null; });
      else o[d.name] = d.def.done(g.states[i]);
    });
    out.push(o);
  }
  const outCols = [...byNames];
  for (const d of aggDefs) {
    if (d.multi) d.multi.forEach((c) => { if (!outCols.includes(c)) outCols.push(c); });
    else outCols.push(d.name);
  }
  return { columns: outCols, rows: out };
}

// ---------------------------------------------------------------- public API

function inferType(rows, name) {
  for (const r of rows) {
    const v = r[name];
    if (isNil(v)) continue;
    if (isDate(v)) return 'datetime';
    if (typeof v === 'number') return Number.isInteger(v) ? 'long' : 'real';
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'object') return 'dynamic';
    return 'string';
  }
  return 'string';
}
const cell = (v) => (isDate(v) ? v.toISOString() : isNil(v) ? null : v);

/**
 * @param {string} text
 * @param {{tables: Map<string,{columns:{name:string,type:string}[],rows:object[]}>, now?: number, maxResultRows?: number}} opts
 */
export function runQuery(text, { tables, now = Date.now(), maxResultRows = LIMITS.maxResultRows, noScanCost = false }) {
  if (typeof text !== 'string' || !text.trim()) throw new KqlError('Query is empty', 'Syntax');
  if (text.length > LIMITS.maxQueryLength) throw new KqlError(`Query is too long (limit ${LIMITS.maxQueryLength} characters)`, 'Limit');
  const started = Date.now();
  const stages = new Parser(lex(text)).parseQuery();
  const ctx = { tables, now, steps: 0, touched: new Set(), noScanCost };
  const { columns, rows, render } = runStages(stages, ctx);
  const truncated = rows.length > maxResultRows;
  const records = truncated ? rows.slice(0, maxResultRows) : rows;
  return {
    columns: columns.map((name) => ({ name, type: inferType(records, name) })),
    rows: records.map((r) => columns.map((c) => cell(r[c]))),
    records, // server-side only (lab validation); the HTTP layer never sends this
    meta: {
      ops: stages.map((s) => s.op),
      tables: [...ctx.touched],
      render,
      rowCount: rows.length,
      truncated,
      elapsedMs: Date.now() - started,
    },
  };
}
