import { test, expect } from '@playwright/test';

const ASSETS = ['stockfish-worker.js', 'stockfish.js', 'stockfish.wasm.js', 'stockfish.wasm'];
const ready = (page: any) => expect(page.locator('#est')).toHaveText('Stockfish ready');

test('engine assets return HTTP 200 from the same origin', async ({ request, baseURL }) => {
  for (const f of ASSETS) {
    const r = await request.get(`${baseURL}/engine/${f}`);
    expect(r.status(), f).toBe(200);
    expect((await r.body()).length, f + ' not empty').toBeGreaterThan(0);
  }
  expect((await request.get(`${baseURL}/engine/stockfish.wasm`)).headers()['content-type']).toContain('application/wasm');
});

test('Stockfish reports uciok and readyok, then passes the mate-in-one test (d1d8)', async ({ page }) => {
  await page.goto('/index.html');
  await ready(page);
  const diag = await page.locator('#dgn').innerText();
  expect(diag).toContain('uciok received');
  expect(diag).toContain('readyok received');
  expect(diag).toMatch(/State:\s+active/);
  for (const f of ['stockfish.js', 'stockfish.wasm.js', 'stockfish.wasm']) expect(diag).toMatch(new RegExp(f.replace(/\./g, '\\.') + ' → OK \\(200\\)'));
  const t = await page.evaluate('ENG.test()'); // ENG is a top-level const in the page
  expect(t).toMatchObject({ ok: true, best: 'd1d8' });
  expect(await page.locator('#dgn').innerText()).toContain('Last bestmove: d1d8');
});

test('sample game is analyzed by Stockfish and 17.Rd8# shows a mate score', async ({ page }) => {
  await page.goto('/index.html');
  await ready(page);
  await page.selectOption('#dp', '10');                 // Quick, keeps CI fast
  await page.click('#smp');
  await expect(page.locator('#st')).toHaveText('Complete');
  await page.click('[data-a="first"]'); await page.click('[data-a="next"]');
  await expect(page.locator('#dep')).toContainText('stockfish');
  await expect(page.locator('#dep')).not.toContainText('fallback');
  await expect(page.locator('#pv button[data-ln]')).toHaveCount(3);  // MultiPV lines
  await page.click('[data-a="last"]');
  await expect(page.locator('#ev')).toHaveText('#');
  await expect(page.locator('#sum .card').first()).toHaveText(/White accuracy\s*\d/);  // accuracy is shown
  const lbl = await page.locator('.mv span[data-i]').evaluateAll(els => els.map(e => e.className));
  expect(lbl.some(c => /best|good|inaccuracy|mistake|blunder/.test(c))).toBe(true);
});

test('if the engine fails to load, results stay unrated and puzzles are disabled', async ({ page }) => {
  await page.addInitScript(() => { (window as any).CL_ENGINE_BASE = '/no-such-engine/'; });
  await page.goto('/index.html');
  await expect(page.locator('#est')).toHaveText('Stockfish unavailable — fallback engine active');
  await expect(page.locator('#apx')).toBeVisible();
  await expect(page.locator('#dgn')).toContainText('Missing worker file');
  await page.selectOption('#dp', '10');
  await page.click('#smp');
  await expect(page.locator('#st')).toContainText('Complete (approximate');
  const lbl = await page.locator('.mv span[data-i]').evaluateAll(els => els.map(e => e.className));
  expect(lbl.every(c => !/best|good|inaccuracy|mistake|blunder/.test(c))).toBe(true);   // every move unrated
  await expect(page.locator('#sum .card').first()).toContainText('…');                  // accuracy stays blank
  let msg = ''; page.once('dialog', d => { msg = d.message(); d.accept(); });
  await page.click('#prac');
  await expect.poll(() => msg).toContain('Puzzles need completed real-Stockfish analysis');
});
