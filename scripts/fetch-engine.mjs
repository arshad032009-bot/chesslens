#!/usr/bin/env node
// Usage: node scripts/fetch-engine.mjs [--cross-check] [--allow-unpinned (dev only, refused when CI is set)] [--manifest file.json]   (Node 18+)
// Build-time download only. Every file is downloaded to a temp dir and VERIFIED before anything is copied into the project.
// Exit code is non-zero if: a download fails, a file is empty/looks wrong, a pinned hash mismatches, or a manifest entry has no source URL.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.CL_OUT_ROOT || join(here, '..'));
const PINS = process.env.CL_PINS || join(here, 'engine-pins.json');
const args = process.argv.slice(2), flag = n => args.includes(n), opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const die = m => { console.error('ERROR: ' + m); process.exit(1); };
const sha = b => createHash('sha256').update(b).digest('hex');

import { manifest as DEFAULT, API_BASE } from './manifest.mjs';
const manifest = opt('--manifest') ? JSON.parse(readFileSync(opt('--manifest'), 'utf8')) : DEFAULT;

// 1. manifest validation (before any network use)
for (const m of manifest) {
  const id = (m.pkg || '?') + '/' + (m.file || '?');
  if (!m.url || !/^https?:\/\//.test(m.url)) die(`manifest entry ${id} has no valid source URL`);
  if (!m.pkg || !m.version || !m.file || /[\/\\]/.test(m.file) || !Array.isArray(m.dests) || !m.dests.length) die(`manifest entry ${id} is incomplete (needs pkg, version, file, dests)`);
}
const pins = existsSync(PINS) ? JSON.parse(readFileSync(PINS, 'utf8')) : {};
const date = new Date().toISOString();

// 2. download + verify into a temp dir
const tmp = mkdtempSync(join(tmpdir(), 'cl-engine-')), got = new Map(); // url -> {buf, hash}
try {
  for (const m of manifest) {
    if (got.has(m.url)) continue;
    let r; try { r = await fetch(m.url); } catch (e) { die(`download failed for ${m.url}: ${e.message}`); }
    if (!r.ok) die(`download failed for ${m.url}: HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length === 0) die(`${m.file} is empty (${m.url})`);
    if (m.kind === 'wasm' && !(buf[0] === 0 && buf[1] === 0x61 && buf[2] === 0x73 && buf[3] === 0x6d)) die(`${m.file} is not a WebAssembly binary (bad magic bytes)`);
    if (m.kind === 'js' && buf.subarray(0, 64).toString('utf8').trimStart().startsWith('<')) die(`${m.file} looks like an HTML error page, not JavaScript`);
    const hash = sha(buf), key = `${m.pkg}@${m.version}/${m.file}`;
    if (pins[key] && pins[key] !== hash) die(`hash mismatch for ${key}\n  expected ${pins[key]}\n  got      ${hash}`);
    if (!pins[key]) { // NO trust-on-first-use: a committed, reviewed pin is mandatory (dev escape hatch is refused in CI)
      if (!flag('--allow-unpinned') || process.env.CI) die(`no pinned hash for ${key}. Generate scripts/engine-pins.json with scripts/pin-from-sri.mjs (or the "Generate pins" workflow), review it, commit it.`);
      console.warn(`WARNING: ${key} unpinned (--allow-unpinned, local development only)`);
    }
    if (flag('--cross-check')) { // independent source: cdnjs API SRI (sha512) must match the downloaded bytes
      let j; try { const r = await fetch(`${API_BASE}${m.pkg}/${m.version}?fields=sri`); if (!r.ok) throw new Error('HTTP ' + r.status); j = await r.json(); } catch (e) { die(`cross-check metadata fetch failed for ${m.pkg}@${m.version}: ${e.message}`); }
      const want = j && j.sri && j.sri[m.file], have = 'sha512-' + createHash('sha512').update(buf).digest('base64');
      if (!want) { if (m.kind !== 'wasm') die(`cdnjs API has no SRI for ${m.file} (unexpected response shape)`); console.warn(`cdnjs API has no SRI for ${m.file}; relying on the committed SHA-256 pin and WASM magic-byte validation`); }
      if (want && want !== have) die(`SRI mismatch for ${key}\n  cdnjs API ${want}\n  download  ${have}`);
      if (want) console.log('cross-checked', key, 'against cdnjs API SRI'); else console.log('validated', key, 'with SHA-256 pin and WASM magic-byte check');
    }
    writeFileSync(join(tmp, hash), buf); got.set(m.url, { hash });
    console.log('verified', key, buf.length, 'bytes', hash.slice(0, 12) + '…');
  }

  // 3. copy verified files, re-check each copy, write checksum + source files per destination
  const NOTICE = 'Stockfish and Stockfish.js are licensed under GPLv3. Source: https://github.com/official-stockfish/Stockfish and the Stockfish.js project (https://github.com/nmrugg/stockfish.js). If you distribute these files you must provide the GPLv3 text and corresponding source. chess.js is BSD-2-Clause.\n';
  const byDest = new Map();
  for (const m of manifest) for (const d of m.dests) (byDest.get(d) || byDest.set(d, []).get(d)).push(m);
  const written = [];
  for (const [d, ms] of byDest) {
    const dir = join(ROOT, d); mkdirSync(dir, { recursive: true });
    ms.sort((a, b) => a.file.localeCompare(b.file));
    for (const m of ms) {
      const { hash } = got.get(m.url), dest = join(dir, m.file);
      copyFileSync(join(tmp, hash), dest);
      if (sha(readFileSync(dest)) !== hash) die(`copy of ${m.file} to ${dest} does not match its verified hash`);
      written.push(dest);
    }
    // standard `sha256sum` format: "<hash>␠␠<filename>" (filename relative to this folder, no URLs)
    writeFileSync(join(dir, 'SHA256SUMS.txt'), ms.map(m => `${got.get(m.url).hash}  ${m.file}`).join('\n') + '\n');
    writeFileSync(join(dir, 'SOURCES.txt'), ms.map(m => [`file: ${m.file}`, `package: ${m.pkg}`, `version: ${m.version}`, `downloaded: ${date}`, `url: ${m.url}`, `pinned: ${pins[`${m.pkg}@${m.version}/${m.file}`] ? 'yes' : 'NO (development only)'}`].join('\n')).join('\n\n') + '\n');
    written.push(join(dir, 'SHA256SUMS.txt'), join(dir, 'SOURCES.txt'));
    if (d.endsWith('/engine')) { const n = join(dir, 'LICENSE-NOTICE.txt'); if (!existsSync(n)) writeFileSync(n, NOTICE); written.push(n); } // existing notice is preserved
  }
  console.log('\nOutput files:\n' + written.map(p => '  ' + p).join('\n'));
  console.log('\nNext: node scripts/test-checksums.mjs');
} finally { rmSync(tmp, { recursive: true, force: true }); }
