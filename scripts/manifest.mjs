// Single source of truth for what gets downloaded. Edit versions here only.
export const BASE = process.env.CL_CDN_BASE || 'https://cdnjs.cloudflare.com/ajax/libs/';
export const API_BASE = process.env.CL_CDN_API || 'https://api.cdnjs.com/libraries/'; // publishes per-file SRI (sha512) = independent integrity source
const E = ['static/engine', 'nextjs/public/engine'], V = ['static/vendor', 'nextjs/public/chesslens/vendor'];
const sf = (file, kind) => ({ pkg: 'stockfish.js', version: '10.0.2', file, kind, url: BASE + 'stockfish.js/10.0.2/' + file, dests: E });
export const manifest = [sf('stockfish.js', 'js'), sf('stockfish.wasm.js', 'js'), sf('stockfish.wasm', 'wasm'),
  { pkg: 'chess.js', version: '0.10.3', file: 'chess.min.js', kind: 'js', url: BASE + 'chess.js/0.10.3/chess.min.js', dests: V }];
