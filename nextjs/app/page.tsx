'use client'; // client-only: Workers do not exist during server rendering
import { useEffect, useRef, useState } from 'react';
import StockfishClient, { EngineResult, EngineStatus } from '@/lib/engine/StockfishClient';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const fmt = (l: { cp: number | null; mate: number | null }) => (l.mate != null ? `M${l.mate}` : `${l.cp! >= 0 ? '+' : ''}${(l.cp! / 100).toFixed(2)}`);

export default function Page() {
  const eng = useRef<StockfishClient | null>(null);
  const [st, setSt] = useState<EngineStatus | null>(null);
  const [fen, setFen] = useState(START);
  const [depth, setDepth] = useState(14);
  const [res, setRes] = useState<EngineResult | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const e = new StockfishClient({ base: '/engine/' });
    eng.current = e; e.onchange = setSt; e.load();
    return () => e.destroy();
  }, []);
  const run = async () => {
    setErr(''); setRes(null);
    try { setRes(await eng.current!.analyze(fen.trim(), { depth, multipv: 3 })); }
    catch (e: any) { if (!e.cancelled) setErr(e.message); }
  };
  const active = st?.state === 'active';
  return (
    <main style={{ maxWidth: 760, margin: 'auto', padding: 16 }}>
      <h1>ChessLens</h1>
      <p><a style={{ color: '#e9b44c' }} href="/chesslens/index.html">Open the full game analyzer →</a></p>
      <section aria-label="Engine diagnostics" style={{ border: '1px solid #27403e', borderRadius: 12, padding: 12 }}>
        <b>{active ? 'Stockfish ready' : st?.state === 'failed' ? 'Stockfish unavailable' : 'Stockfish loading'}</b>
        <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{st && [`Worker URL: ${st.workerUrl}`, ...Object.values(st.assets).map(a => `${a.url} → ${a.ok ? 'OK' : 'MISSING'} (${a.status})`), `Worker: ${st.worker}`, `WASM: ${st.wasm}`, `UCI: ${st.uci}`, `Ready: ${st.ready}`, `Engine: ${st.version ?? 'n/a'}`, `Last error: ${st.lastError ?? 'none'}`, `Last bestmove: ${st.lastBestmove ?? 'n/a'}`, `Last depth: ${st.lastDepth ?? 'n/a'}`].join('\n')}</pre>
        <button onClick={async () => alert(JSON.stringify(await eng.current!.test()))}>Test engine</button>{' '}
        <button onClick={() => { eng.current!.destroy(); eng.current!.load(); }}>Reload engine</button>{' '}
        <button onClick={() => eng.current!.clearLog()}>Clear debug log</button>
        <details><summary>Debug log</summary><pre style={{ fontSize: 12 }}>{st?.log.join('\n')}</pre></details>
      </section>
      <h2>FEN analysis</h2>
      <input aria-label="FEN" value={fen} onChange={e => setFen(e.target.value)} style={{ width: '100%', padding: 8 }} />
      <p><label>Depth <select value={depth} onChange={e => setDepth(+e.target.value)}><option value={10}>Quick (10)</option><option value={14}>Standard (14)</option><option value={18}>Deep (18)</option></select></label>{' '}
        <button disabled={!active} onClick={run}>Analyze position</button> {!active && <small>Disabled until the engine test passes.</small>}</p>
      {err && <p role="alert" style={{ color: '#ff8a80' }}>{err}</p>}
      {res && <ol>{res.lines.map(l => <li key={l.rank}><b>{fmt(l)}</b> d{l.depth}: {l.pv.slice(0, 8).join(' ')}</li>)}</ol>}
    </main>
  );
}
