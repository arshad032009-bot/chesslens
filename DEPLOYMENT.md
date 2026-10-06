# ChessLens deployment guide

Status: **static review plus automated Node tests against a fake CDN only.** The real Stockfish download, the browser flow and the Playwright suite have not been run by the author of these files.

## 1. Deployment checklist (in order)

1. [ ] Commit this folder to a GitHub repository.
2. [ ] Run workflow **pins** (Actions → pins → Run). Download artifact `engine-pins`, **review it** (4 lines, 64-hex SHA-256 each), commit as `scripts/engine-pins.json`. The workflow only writes a pin if the file matches cdnjs's published SRI.
3. [ ] Push. Workflow **ci** must be green: pins present → download + SRI cross-check → `sha256sum -c` → copy-drift check → Playwright (4 tests).
4. [ ] Download the `compliance-bundle` artifact (job `legal`). Copy it to `static/legal/` (and `nextjs/public/legal/`). Fill every "TO CONFIRM / UNKNOWN / ADD YOUR CONTACT" marker in `SOURCE-OFFER.md` and `PROVENANCE.md`. Add the missing Stockfish.js port source archive + hash to `source/`.
5. [ ] Put a visible link to `/legal/` in the page footer. Copy `legal/COPYING` to `engine/COPYING`.
6. [ ] Static host: serve `static/` over HTTPS; `.wasm` must be `application/wasm`. Next.js: `cd nextjs && npm install && npm run build`, run `node ../scripts/fetch-engine.mjs --cross-check` first.
7. [ ] If you set a CSP: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'` (the page uses inline scripts/styles: add hashes or nonces if you drop `'unsafe-inline'`). No `blob:`, no `unsafe-eval`.
8. [ ] After deploy open the site: panel shows 3 assets `OK (200)`, "Stockfish ready", **Test engine** → `d1d8`, **Run self-tests** all PASS, sample game says `stockfish`.
9. [ ] Manual browsers: Chrome, Firefox, Safari desktop; Android Chrome; iOS Safari (step 8 on each). Playwright only covers Chromium.
10. [ ] Do not tick "verified" anywhere until steps 3 and 8 pass.

## 2. Expected tree after `node scripts/fetch-engine.mjs`

```
static/
  index.html
  src/lib/engine/StockfishClient.js
  engine/   stockfish-worker.js  stockfish.js  stockfish.wasm.js  stockfish.wasm  SHA256SUMS.txt  SOURCES.txt  LICENSE-NOTICE.txt
  vendor/   chess.min.js  SHA256SUMS.txt  SOURCES.txt
nextjs/
  public/engine/   (same 7 files as static/engine)
  public/chesslens/ index.html  src/lib/engine/StockfishClient.js  vendor/ (chess.min.js SHA256SUMS.txt SOURCES.txt)
scripts/ manifest.mjs fetch-engine.mjs pin-from-sri.mjs test-checksums.mjs build-compliance.mjs serve.mjs engine-pins.json(you commit)
```
The script itself writes **18** files (6 per engine folder ×2, 3 per vendor folder ×2). `stockfish-worker.js` is ours, not downloaded.

## 3. Expected output

Success (`node scripts/fetch-engine.mjs --cross-check`):
```
verified stockfish.js@10.0.2/stockfish.js <bytes> bytes <12 hex>…
cross-checked stockfish.js@10.0.2/stockfish.js against cdnjs API SRI
… (same two lines for stockfish.wasm.js, stockfish.wasm, chess.js@0.10.3/chess.min.js)
Output files:
  <abs path>/static/engine/stockfish.js … (18 paths)
Next: node scripts/test-checksums.mjs
```
`test-checksums.mjs`: four `PASS sha256sum -c <dir> (N files)` lines, then `All checksum tests passed`. Exit code 0.

Failures (exit code 1, nothing copied):
```
ERROR: no pinned hash for stockfish.js@10.0.2/stockfish.js. Generate scripts/engine-pins.json …
ERROR: download failed for <url>: HTTP 404
ERROR: stockfish.wasm is not a WebAssembly binary (bad magic bytes)
ERROR: hash mismatch for <pkg@ver/file>\n  expected <sha256>\n  got      <sha256>
ERROR: SRI mismatch for <pkg@ver/file>\n  cdnjs API sha512-…\n  download  sha512-…
ERROR: manifest entry <pkg>/<file> has no valid source URL
```

## 4. Static code audit

Observed in the author's earlier run (not re-run since): the previous version of this worker reached `State: active`, `uciok`/`readyok`, bestmove `d1d8`, and a sample game reporting `source: stockfish`.

| Area | Finding | Status |
|---|---|---|
| Worker path | `new Worker(base + 'stockfish-worker.js')`, base `engine/` (relative to the page) or `CL_ENGINE_BASE`. No `blob:`. | OK |
| Same-origin URLs | All engine URLs derive from `self.location` in the worker and the page base in the client. No absolute external URL at runtime, except an optional chess.js CDN fallback in `index.html` if `vendor/chess.min.js` is absent. | OK |
| Loader filenames | Worker looks for exactly `stockfish.js`, `stockfish.wasm.js`, `stockfish.wasm`; `manifest.mjs` downloads exactly those. One source of truth would be better: filenames are duplicated in the worker and manifest. | Minor |
| Handshake order | `uci` (re-sent every 1 s until `uciok`) → `isready` → `readyok` → `ucinewgame` → `isready` → `readyok` → ready. **Fixed this round:** the second `isready` after `ucinewgame` was missing. Per search: `setoption MultiPV` → `position fen` → `go depth/movetime` → `stop` only on cancel. | Fixed |
| Race | `uciok` waiter is armed before sending `uci` (fixed earlier; caught by the mock-engine test). | Fixed |
| Timeout cleanup | `uciok` timer and resend interval cleared in `finally`; `readyok` timer cleared on resolve; bestmove timer cleared on `bestmove`; on bestmove timeout the worker sends `stop`, nulls state and sets `ready=false` (engine must be reloaded). Client load watchdog (45 s) cleared by `done()`. | OK |
| Mid-analysis engine loss | Before: analysis silently continued with the fallback and mixed results. **Fixed:** the loop now aborts with a message. | Fixed |
| Duplicated files | Worker/client exist in 3 places. CI now `cmp`s them. | Mitigated |
| Uncaught worker errors | Any uncaught error after load is treated as fatal ("wasm-init") and marks the engine failed. Conservative on purpose. | Known |
| Not verifiable here | Behaviour of the real `stockfish.wasm.js` (how it exposes UCI, `Module.locateFile` handling) is inferred; the worker supports both the `onmessage` and `Stockfish()` shapes. | Unverified |
| cdnjs API | `pin-from-sri.mjs` assumes `GET /libraries/<lib>/<ver>?fields=sri` returns `{sri:{<file>:"sha512-…"}}`. It fails loudly if not. | Unverified |

## 5. Pinning
`engine-pins.json` is mandatory: no trust-on-first-use, and `--allow-unpinned` is refused when `CI` is set. Pins come from `pin-from-sri.mjs`, which writes a pin only if the bytes match the SRI cdnjs publishes through its API (a separate endpoint from the file), and every CI run re-checks that SRI. This guards against a corrupted or swapped file after pinning. It does **not** protect against cdnjs itself publishing a malicious file before you pinned; for that, compare against the npm tarball or a build you made yourself.
