#!/usr/bin/env node
// Generates scripts/engine-pins.json. Source of truth: the cdnjs API's published SRI (sha512) for each file.
// A pin is written only if the downloaded bytes match that SRI. REVIEW the resulting file in a pull request before trusting it.
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifest, API_BASE } from './manifest.mjs';
const out = process.env.CL_PINS || join(dirname(fileURLToPath(import.meta.url)), 'engine-pins.json'), pins = {};
const die = m => { console.error('ERROR: ' + m); process.exit(1); };
for (const m of manifest) {
  const r1 = await fetch(`${API_BASE}${m.pkg}/${m.version}?fields=sri`).catch(e => die(e.message)); if (!r1.ok) die(`API HTTP ${r1.status} for ${m.pkg}@${m.version}`);
  const want = ((await r1.json()).sri || {})[m.file];
  const r2 = await fetch(m.url).catch(e => die(e.message)); if (!r2.ok) die(`download HTTP ${r2.status}: ${m.url}`);
  const buf = Buffer.from(await r2.arrayBuffer()); if (!buf.length) die(m.file + ' is empty');
  if (want) { const have = 'sha512-' + createHash('sha512').update(buf).digest('base64'); if (have !== want) die(`SRI mismatch for ${m.file}: API ${want} vs download ${have}`); } else if (m.kind !== 'wasm') { die(`no SRI published for ${m.file}`); }
  pins[`${m.pkg}@${m.version}/${m.file}`] = createHash('sha256').update(buf).digest('hex'); console.log('pinned', m.file, pins[`${m.pkg}@${m.version}/${m.file}`], '(matches cdnjs API SRI when published)');
}
writeFileSync(out, JSON.stringify(Object.fromEntries(Object.entries(pins).sort()), null, 2) + '\n'); console.log('wrote', out);
