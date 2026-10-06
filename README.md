# ChessLens — same-origin Stockfish build

Two deployable versions share one engine setup:

- `static/` — the full single-page analyzer (`index.html`). Serve from any static host.
- `nextjs/` — Next.js 14 (App Router, TypeScript). `/` is a client-only engine diagnostics + FEN-analysis page; `/chesslens/index.html` is the full analyzer (the same file as `static/`). **The full analyzer is not ported to React components.**

**Status: not yet verified in a browser.** The worker's UCI state machine was smoke-tested against a mock engine in Node, and all scripts pass syntax checks. Nothing here proves real Stockfish runs until the in-app **Test engine** passes. Do not treat the engine as working before that.

## Engine files (exact layout)

```
engine/
  stockfish-worker.js   # ours (ChessLens wrapper, same origin, no blob:, no eval)
  stockfish.js          # Stockfish.js 10.0.2, asm.js build (fallback if WASM is unavailable)
  stockfish.wasm.js     # Stockfish.js 10.0.2, WASM loader
  stockfish.wasm        # Stockfish.js 10.0.2, WASM binary
```

The three Stockfish files are **not bundled** (this build environment had no network). Download them once:

```
node scripts/fetch-engine.mjs      # Node 18+
```

It downloads from cdnjs (`ajax/libs/stockfish.js/10.0.2/`, `chess.js/0.10.3/`) into a temp folder, verifies every file, and only then copies it into `static/engine`, `nextjs/public/engine` and the two `vendor` folders. At runtime nothing loads from a CDN, except an optional chess.js fallback in `static/index.html` if `vendor/chess.min.js` is missing.

Each output folder also gets `SHA256SUMS.txt` (standard `sha256sum` format: `<hash>␠␠<filename>`, no URLs), `SOURCES.txt` (package, version, download date, URL) and, for engine folders, `LICENSE-NOTICE.txt` (never overwritten if it exists). The script exits non-zero if a download fails, a file is empty or is not what it claims (HTML error page, bad WASM magic bytes), a pinned hash mismatches, or a manifest entry has no source URL. Nothing is copied unless every file passes.

**Pin the hashes:** the first run has no reference hash for the engine files ("trust on first use"). After you have checked the files against a second source (e.g. the npm `stockfish` package or the project's GitHub release), run `node scripts/fetch-engine.mjs --pin` once and commit `scripts/engine-pins.json`; later runs then fail on any change.

Verify the result:

```
node scripts/test-checksums.mjs                       # runs sha256sum -c in every output folder, plus a tamper check
cd static/engine && sha256sum -c SHA256SUMS.txt       # macOS: shasum -a 256 -c SHA256SUMS.txt
```

If you use a different Stockfish build (e.g. the npm `stockfish` package 16+, which ships `stockfish-nnue-16-single.js/.wasm`), edit the filenames in `init()` in `stockfish-worker.js` and document them here.

## Licenses

Stockfish and the Stockfish.js ports are **GPLv3**. If you distribute these files you must ship the GPLv3 text and offer the corresponding source (Stockfish: github.com/official-stockfish/Stockfish; Stockfish.js: github.com/nmrugg/stockfish.js). chess.js is BSD-2-Clause. ChessLens code is yours to license; combining it with GPL engine files in one distribution has GPL implications, so get legal advice if that matters to you.

## Run locally

```
node scripts/fetch-engine.mjs
cd static && python3 -m http.server 8080      # open http://localhost:8080
# or
cd nextjs && npm install && npm run dev       # open http://localhost:3000
```
Workers and `fetch` do not work from `file://`; use a server.

## Verify the engine

1. Open the page. The diagnostics panel should list all three asset URLs as **OK**.
2. Wait for **Stockfish ready** (shown only after the test position returns a bestmove).
3. Press **Test engine**: it analyzes `6k1/5ppp/8/8/8/8/5PPP/3R2K1 w` and must return `d1d8`.
4. In the static app press **Run self-tests**: every line should say PASS, including "engine verified".
5. Analyze the sample game; the eval panel should show `stockfish`, not `fallback`.

## Troubleshooting

| Symptom (diagnostics / debug log) | Cause and fix |
|---|---|
| `Missing worker file …/stockfish-worker.js (HTTP 404)` | Wrong base path. Static: keep `engine/` next to `index.html`. Next: file must be in `public/engine/`. |
| `Missing Stockfish file(s): …` / `Missing WASM file …` | Run `scripts/fetch-engine.mjs`, check the deploy copied `engine/`. A missing `.wasm` falls back to the slow asm.js build if `stockfish.js` exists. |
| `Worker creation failed` | CSP `worker-src` must allow `'self'`; the page must be served over http(s), not `file://`. |
| `wasm-init` error / `Engine aborted` | Serve `.wasm` as `application/wasm`; CSP may need `'wasm-unsafe-eval'` in `script-src`. Check `WebAssembly` is enabled (some locked-down browsers disable it). |
| `Timeout … waiting for uciok` (20 s) | Engine script loaded but did not answer: wrong build/API, blocked WASM compile, or very slow device. Read the log above it. |
| `Timeout … waiting for readyok` (10 s) | Same causes; try Reload engine. |
| `Timeout … waiting for bestmove` (60 s) | Depth too high for the device (asm.js is slow). Use Quick (10); reload the engine. |
| Test returns a move other than `d1d8` | Engine is not behaving as Stockfish; do not use. |

Stockfish.js 10 can be slow to honor `stop`; cancelling mid-search may lag a few seconds.

## Deployment requirements

- Same-origin hosting of `engine/*` and the worker. No special COOP/COEP headers needed (single-threaded build).
- `.wasm` served as `application/wasm` (Next config does this; on nginx/Apache/S3 set it yourself).
- If you set a CSP: `worker-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'`, `connect-src 'self'`. No `blob:` or `unsafe-eval` required.
- No cache-busting is used. If you replace engine files, rename them or change cache headers (`next.config.js` caches `.wasm` for a year).
- Lichess/Chess.com URL import is still unavailable without a server route.

## Browser support

Needs Web Workers. WebAssembly builds need a modern Chrome, Edge, Firefox or Safari (Safari 11+, iOS 11+). Without WASM the asm.js build is used and is much slower. Low-memory phones may fail to compile the WASM. Untested on any browser so far; manual checklist: Chrome, Firefox, Safari desktop; Android Chrome; iOS Safari — run steps 1–5 above on each.
