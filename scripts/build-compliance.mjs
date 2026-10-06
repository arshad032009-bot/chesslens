#!/usr/bin/env node
// Builds compliance/ evidence: GPLv3 text (cross-verified against two independent sources), cdnjs metadata, Stockfish source archive + hashes.
import { writeFileSync, mkdirSync } from 'node:fs'; import { createHash } from 'node:crypto';
const OUT = new URL('../compliance/', import.meta.url).pathname, die = m => { console.error('ERROR: ' + m); process.exit(1); };
const get = async u => { const r = await fetch(u).catch(e => die(u + ': ' + e.message)); if (!r.ok) die(`${u}: HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
const norm = b => b.toString('utf8').replace(/\r/g, '').replace(/\s+/g, ' ').trim(), sha = b => createHash('sha256').update(b).digest('hex');
mkdirSync(OUT + 'source', { recursive: true });
const gnu = await get('https://www.gnu.org/licenses/gpl-3.0.txt'), sfc = await get('https://raw.githubusercontent.com/official-stockfish/Stockfish/sf_10/Copying.txt');
if (norm(gnu) !== norm(sfc)) die('GPLv3 text from gnu.org differs from Stockfish sf_10 Copying.txt — review manually before shipping');
if (!/GNU GENERAL PUBLIC LICENSE/.test(gnu.toString()) || !/Version 3, 29 June 2007/.test(gnu.toString())) die('text is not GPL version 3');
writeFileSync(OUT + 'COPYING', gnu);
writeFileSync(OUT + 'cdnjs-metadata.json', await get('https://api.cdnjs.com/libraries/stockfish.js?fields=name,version,license,repository,homepage,autoupdate'));
const tar = await get('https://github.com/official-stockfish/Stockfish/archive/refs/tags/sf_10.tar.gz'); if (!tar.length) die('empty source archive');
writeFileSync(OUT + 'source/Stockfish-sf_10.tar.gz', tar); writeFileSync(OUT + 'source/SHA256SUMS.txt', `${sha(tar)}  Stockfish-sf_10.tar.gz\n`);
console.log('GPLv3 text verified against two sources, sha256', sha(gnu)); console.log('wrote', OUT);
