#!/usr/bin/env node
// Verifies generated files with the real `sha256sum -c` (falls back to `shasum -a 256 -c` on macOS). Exits non-zero on any failure.
import { readFileSync, existsSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(process.env.CL_OUT_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'));
const DIRS = ['static/engine', 'nextjs/public/engine', 'static/vendor', 'nextjs/public/chesslens/vendor'];
let bad = 0; const fail = m => { console.error('FAIL', m); bad++; };
function check(cwd) { let r = spawnSync('sha256sum', ['-c', 'SHA256SUMS.txt'], { cwd, encoding: 'utf8' }); if (r.error && r.error.code === 'ENOENT') r = spawnSync('shasum', ['-a', '256', '-c', 'SHA256SUMS.txt'], { cwd, encoding: 'utf8' }); return r; }
for (const d of DIRS) {
  const dir = join(ROOT, d), f = join(dir, 'SHA256SUMS.txt');
  if (!existsSync(f)) { fail(d + ': SHA256SUMS.txt missing'); continue; }
  const lines = readFileSync(f, 'utf8').trimEnd().split('\n');
  if (!lines.every(l => /^[0-9a-f]{64}  [^\/\\\s]+$/.test(l))) fail(d + ': SHA256SUMS.txt is not exactly "<64-hex>␠␠<filename>" lines');
  if (/https?:/.test(readFileSync(f, 'utf8'))) fail(d + ': SHA256SUMS.txt contains a URL');
  const src = join(dir, 'SOURCES.txt');
  if (!existsSync(src) || !/^url: https?:\/\//m.test(readFileSync(src, 'utf8'))) fail(d + ': SOURCES.txt missing or has no url');
  const r = check(dir); r.status === 0 ? console.log('PASS sha256sum -c', d, '(' + lines.length + ' files)') : fail(d + ': checksum verification failed\n' + r.stdout + r.stderr);
  if (d.endsWith('/engine') && !existsSync(join(dir, 'LICENSE-NOTICE.txt'))) fail(d + ': LICENSE-NOTICE.txt missing');
  // negative control: a tampered copy must FAIL verification, proving the check is real
  const t = mkdtempSync(join(tmpdir(), 'cl-neg-')); cpSync(dir, t, { recursive: true });
  writeFileSync(join(t, lines[0].split('  ')[1]), 'tampered'); if (check(t).status === 0) fail(d + ': tampered file was NOT detected'); rmSync(t, { recursive: true, force: true });
}
console.log(bad ? `\n${bad} failure(s)` : '\nAll checksum tests passed'); process.exit(bad ? 1 : 0);
