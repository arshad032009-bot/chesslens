export interface EngineLine { rank: number; depth: number; cp: number | null; mate: number | null; pv: string[] }
export interface EngineResult { fen: string; side: 1 | -1; best: string | null; lines: EngineLine[]; depth: number; ms: number; src: 'stockfish' }
export interface EngineStatus { state: 'idle' | 'loading' | 'verifying' | 'active' | 'failed'; workerUrl: string; assets: Record<string, { url: string; ok: boolean; status: number | string }>; worker: string; wasm: string; uci: string; ready: string; version: string | null; lastError: string | null; lastBestmove: string | null; lastDepth: number | null; log: string[] }
export default class StockfishClient {
  constructor(o?: { base?: string }); onchange: ((s: EngineStatus) => void) | null;
  load(): Promise<boolean>; test(): Promise<{ ok: boolean; best: string | null; depth: number | null; error: string | null }>;
  analyze(fen: string, o?: { depth?: number; movetime?: number; multipv?: number; timeout?: number }): Promise<EngineResult>;
  stop(): void; destroy(): void; getStatus(): EngineStatus; clearLog(): void;
}
