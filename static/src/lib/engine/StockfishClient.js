/* StockfishClient — same-origin Web Worker client. UMD: window.StockfishClient or require(). */
(function (g, f) { if (typeof module === 'object' && module.exports) module.exports = f(); else g.StockfishClient = f(); })(this, function () {
  const TEST_FEN = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', TEST_BEST = 'd1d8'; // mate in 1: the only winning legal move
  class StockfishClient {
    constructor(o = {}) { this.base = o.base || '/engine/'; this.workerUrl = this.base + 'stockfish-worker.js'; this.w = null; this.n = 0; this.jobs = new Map(); this.logs = []; this.onchange = null; this._lp = null; this.s = this._fresh(); }
    _fresh() { return { state: 'idle', workerUrl: this.workerUrl, assets: {}, worker: 'not started', wasm: 'not started', uci: 'pending', ready: 'pending', version: null, lastError: null, lastBestmove: null, lastDepth: null }; }
    getStatus() { return { ...this.s, log: this.logs.slice() }; }
    _set(p) { Object.assign(this.s, p); this.onchange && this.onchange(this.getStatus()); }
    _log(m) { this.logs.push(new Date().toLocaleTimeString() + ' ' + m); if (this.logs.length > 300) this.logs.shift(); this.onchange && this.onchange(this.getStatus()); }
    clearLog() { this.logs = []; this.onchange && this.onchange(this.getStatus()); }
    _fail(msg) { this._log('FAILED: ' + msg); this._set({ state: 'failed', lastError: msg }); }
    load() {
      if (this._lp) return this._lp;
      this._set({ ...this._fresh(), state: 'loading', worker: 'creating…' });
      this._lp = new Promise(resolve => {
        let w; const done = ok => { clearTimeout(wd); resolve(ok); };
        const wd = setTimeout(() => { this._fail('Worker did not become ready within 45s'); done(false); }, 45000);
        try { w = new Worker(this.workerUrl); } catch (e) { this._set({ worker: 'creation failed' }); this._fail('Worker creation failed: ' + e.message); return done(false); }
        this.w = w; this._set({ worker: 'created (script requested)' });
        w.onerror = async e => { // 404 / MIME / CORS on the worker file arrives with no detail; probe it
          let why = e.message || 'script error'; try { const r = await fetch(this.workerUrl, { method: 'HEAD' }); if (!r.ok) why = 'Missing worker file ' + this.workerUrl + ' (HTTP ' + r.status + ')'; } catch (_) { why += ' (could not fetch worker URL)'; }
          this._set({ worker: 'failed' }); this._fail(why); done(false); };
        w.onmessage = async e => {
          const d = e.data;
          if (d.t === 'log') this._log(d.m);
          else if (d.t === 'assets') this._set({ assets: d.assets });
          else if (d.t === 'stage') this._set(d.stage === 'worker' ? { worker: 'running' } : d.stage === 'wasm' ? { wasm: d.state } : d.stage === 'uci' ? { uci: 'uciok received' } : { ready: 'readyok received' });
          else if (d.t === 'error') { this._set({ [/wasm|missing|script|engine/.test(d.kind) ? 'wasm' : d.kind.startsWith('uci') ? 'uci' : 'ready']: 'ERROR: ' + d.kind }); this._fail(d.msg); this._rejectAll(new Error(d.msg)); done(false); }
          else if (d.t === 'info') this._set({ lastDepth: d.depth });
          else if (d.t === 'result') { const j = this.jobs.get(d.id); if (j) { this.jobs.delete(d.id); d.error ? j.rej(new Error(d.error)) : d.cancelled ? j.rej(Object.assign(new Error('cancelled'), { cancelled: true })) : j.res(d); } }
          else if (d.t === 'ready') { this._set({ version: d.version, state: 'verifying' }); this._log('Engine file: ' + d.file + (d.version ? ' · ' + d.version : '')); done(await this._verify()); }
        };
        w.postMessage({ t: 'init' });
      });
      return this._lp;
    }
    async _verify() { // Stockfish counts as "active" ONLY after the expected legal bestmove comes back
      try { const r = await this._go(TEST_FEN, { depth: 6, multipv: 1 }); this._set({ lastBestmove: r.best, lastDepth: r.depth });
        if (r.best !== TEST_BEST) { this._fail('Test position returned ' + r.best + ', expected ' + TEST_BEST); return false; }
        this._set({ state: 'active' }); this._log('Test passed: bestmove ' + r.best + ' at depth ' + r.depth); return true; }
      catch (e) { this._fail('Engine test failed: ' + e.message); return false; }
    }
    async test() { if (!this.w) await this.load(); const ok = this.w ? await this._verify() : false; return { ok, best: this.s.lastBestmove, depth: this.s.lastDepth, error: ok ? null : this.s.lastError }; }
    _go(fen, o) { return new Promise((res, rej) => { const id = ++this.n; this.jobs.set(id, { res, rej }); this.w.postMessage({ t: 'go', id, fen, depth: o.depth, movetime: o.movetime, multipv: o.multipv, timeout: o.timeout }); }); }
    async analyze(fen, o = {}) {
      if (this.s.state !== 'active') throw new Error('Stockfish is not active (' + this.s.state + ')');
      this._rejectAll(Object.assign(new Error('cancelled'), { cancelled: true })); // a newer request supersedes older ones
      const r = await this._go(fen, o); this._set({ lastBestmove: r.best, lastDepth: r.depth }); return { fen, side: r.side, best: r.best, lines: r.lines, depth: r.depth, ms: r.ms, src: 'stockfish' };
    }
    stop() { this.w && this.w.postMessage({ t: 'stop' }); }
    _rejectAll(err) { if (this.jobs.size && this.w) this.w.postMessage({ t: 'stop' }); for (const [, j] of this.jobs) j.rej(err); this.jobs.clear(); }
    destroy() { this._rejectAll(new Error('destroyed')); if (this.w) { this.w.terminate(); this.w = null; } this._lp = null; this._set({ ...this._fresh() }); }
  }
  return StockfishClient;
});
