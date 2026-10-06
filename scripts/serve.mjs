// Tiny static server with correct MIME types (.wasm => application/wasm). Usage: node scripts/serve.mjs <dir> <port>
import { createServer } from 'node:http'; import { readFile, stat } from 'node:fs/promises'; import { join, normalize, extname, resolve } from 'node:path';
const dir = resolve(process.argv[2] || 'static'), port = +process.argv[3] || 8080;
const T = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
createServer(async (q, r) => {
  let p = normalize(decodeURIComponent(new URL(q.url, 'http://x').pathname)).replace(/^(\.\.[\/\\])+/, ''); if (p.endsWith('/')) p += 'index.html';
  const f = join(dir, p); if (!f.startsWith(dir)) { r.writeHead(403).end(); return; }
  try { if (!(await stat(f)).isFile()) throw 0; const b = await readFile(f); r.writeHead(200, { 'Content-Type': T[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(q.method === 'HEAD' ? undefined : b); }
  catch { r.writeHead(404).end('not found'); }
}).listen(port, () => console.log(`serving ${dir} on http://localhost:${port}`));
