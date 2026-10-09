/* ChessLens same-origin Stockfish worker. No blob: URLs, no eval, no CDN.
 * Loads stockfish.wasm.js (+ stockfish.wasm) from its own directory, else falls back to stockfish.js (asm.js).
 * Protocol (objects via postMessage): in {t:'init'|'go'|'stop'}, emit {t:'log'|'stage'|'assets'|'ready'|'error'|'info'|'result'}. */
'use strict';
const HERE = self.location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
const REAL = self.postMessage.bind(self), emit = m => REAL(m), log = m => emit({ t: 'log', m });
let send = null, ready = false, busy = false, cur = null, pending = null, version = null, waiter = null;
const ERR = (kind, msg) => { emit({ t: 'error', kind, msg }); log('ERROR ' + kind + ': ' + msg); };
self.postMessage = d => { if (typeof d === 'string') onLine(d); else REAL(d); }; // engine output arrives as strings
self.addEventListener('error', e => ERR('wasm-init', 'Uncaught worker error: ' + (e.message || 'unknown')));
self.addEventListener('unhandledrejection', e => ERR('wasm-init', 'Unhandled rejection: ' + (e.reason && e.reason.message || e.reason)));
const mine = e => { const d = e.data; if (d.t === 'init') init(); else if (d.t === 'go') go(d); else if (d.t === 'stop') stop(); };
self.onmessage = mine;
function expect(tok, ms, kind) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => { waiter = null; rej({ kind, msg: 'Timeout (' + ms + 'ms) waiting for ' + tok }); }, ms);
    waiter = { tok, done: s => { clearTimeout(t); waiter = null; res(s); } };
  });
}
async function head(name) {
  try { const r = await fetch(HERE + name, { method: 'HEAD', cache: 'no-store' }); return { url: HERE + name, ok: r.ok || r.status === 405, status: r.status }; }
  catch (e) { return { url: HERE + name, ok: false, status: 'network/CORS error' }; }
}
async function init() {
  emit({ t: 'stage', stage: 'worker', state: 'ok' });
  const a = { 'stockfish.js': await head('stockfish.js'), 'stockfish.wasm.js': await head('stockfish.wasm.js'), 'stockfish.wasm': await head('stockfish.wasm') };
  emit({ t: 'assets', assets: a });
  const hasWasm = typeof WebAssembly === 'object', useWasm = hasWasm && a['stockfish.wasm.js'].ok && a['stockfish.wasm'].ok;
  let file;
  if (useWasm) file = 'stockfish.wasm.js';
  else if (a['stockfish.js'].ok) file = 'stockfish.js';
  else if (hasWasm && a['stockfish.wasm.js'].ok) return ERR('missing-wasm', 'Missing WASM file ' + a['stockfish.wasm'].url + ' (HTTP ' + a['stockfish.wasm'].status + ') and no stockfish.js fallback.');
  else return ERR('missing-file', 'Missing Stockfish file(s): ' + Object.values(a).filter(x => !x.ok).map(x => x.url + ' (HTTP ' + x.status + ')').join(', '));
  if (!useWasm) log(hasWasm ? 'WASM files missing — using asm.js build (slow)' : 'WebAssembly unsupported — using asm.js build (slow)');
  emit({ t: 'stage', stage: 'wasm', state: useWasm ? 'loading ' + file : 'skipped (asm.js: ' + file + ')' });
  self.Module = { locateFile: f => HERE + f, onAbort: w => ERR('wasm-init', 'Engine aborted: ' + w) }; // WASM resolved same-origin
  try { importScripts(HERE + file); } catch (e) { return ERR(useWasm ? 'wasm-init' : 'script-load', 'Could not run ' + HERE + file + ': ' + e.message); }
  if (self.onmessage !== mine && typeof self.onmessage === 'function') { const f = self.onmessage; self.onmessage = mine; send = c => f({ data: c }); }
  else if (typeof self.Stockfish === 'function') { try { const e = await self.Stockfish(); (e.addMessageListener || (l => (e.listener = l)))(onLine); send = c => e.postMessage(c); } catch (x) { return ERR('wasm-init', 'Stockfish() factory failed: ' + x.message); } }
  else return ERR('engine-api', file + ' loaded but exposes no UCI interface (no onmessage / Stockfish()).');
  try {
    const pu = expect('uciok', 20000, 'uciok-timeout'); // arm the waiter BEFORE sending: a synchronous engine can answer immediately
    const iv = setInterval(() => send('uci'), 1000); send('uci'); // re-send: early commands may be dropped while WASM compiles
    try { await pu; } finally { clearInterval(iv); }
    emit({ t: 'stage', stage: 'uci', state: 'ok' });
    const p = expect('readyok', 10000, 'readyok-timeout'); send('isready'); await p;
    emit({ t: 'stage', stage: 'ready', state: 'ok' });
    send('ucinewgame');
    const p2 = expect('readyok', 10000, 'readyok-timeout');
    send('isready'); await p2;
    ready = true; emit({ t: 'ready', version, file });
  } catch (e) { ERR(e.kind || 'init', e.msg || String(e)); }
}
function onLine(s) {
  if (s.startsWith('id name')) version = s.slice(8).trim();
  if (waiter && s.includes(waiter.tok)) waiter.done(s);
  if (!cur) return;
  if (s.startsWith('info') && !/bound/.test(s)) {
    const mp = /multipv (\d+)/.exec(s), m = /depth (\d+).* score (cp|mate) (-?\d+).* pv (.+)/.exec(s);
    if (m) { const n = +(mp ? mp[1] : 1), v = +m[3], sd = cur.side; // normalise to WHITE's perspective
      cur.lines[n] = { rank: n, depth: +m[1], cp: m[2] === 'cp' ? sd * v : null, mate: m[2] === 'mate' ? sd * v : null, pv: m[4].trim().split(' ') };
      cur.depth = Math.max(cur.depth, +m[1]); emit({ t: 'info', id: cur.id, depth: cur.depth }); }
  } else if (s.startsWith('bestmove')) {
    clearTimeout(cur.to); const c = cur; cur = null; busy = false;
    const ls = Object.values(c.lines).sort((x, y) => x.rank - y.rank), best = s.split(' ')[1];
    emit({ t: 'result', id: c.id, cancelled: c.cancelled, best: best === '(none)' ? null : best, lines: ls, depth: c.depth, ms: Math.round(performance.now() - c.t0), side: c.side });
    if (pending) { const p = pending; pending = null; run(p); }
  }
}
function go(d) { if (!ready) return emit({ t: 'result', id: d.id, error: 'Engine not ready' }); if (busy) { pending = d; stop(); } else run(d); }
function run(d) {
  busy = true; const lim = d.timeout || (d.movetime ? d.movetime + 10000 : 60000);
  const to = setTimeout(() => { ERR('bestmove-timeout', 'Timeout waiting for bestmove (' + lim + 'ms)'); send('stop'); emit({ t: 'result', id: d.id, error: 'bestmove-timeout' }); cur = null; busy = false; ready = false; }, lim);
  cur = { id: d.id, side: d.fen.split(' ')[1] === 'w' ? 1 : -1, lines: {}, depth: 0, t0: performance.now(), to };
  send('setoption name MultiPV value ' + (d.multipv || 1)); send('position fen ' + d.fen);
  send(d.movetime ? 'go movetime ' + d.movetime : 'go depth ' + (d.depth || 12));
}
function stop() { if (busy && cur) { cur.cancelled = true; send('stop'); } }
