import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const OUT = 'ci-artifacts';
const consoleLines: string[] = [];

test.beforeEach(({ page }) => {
  consoleLines.length = 0;
  page.on('console', m => consoleLines.push(`[console.${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleLines.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', r => consoleLines.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.url().includes('/engine/')) consoleLines.push(`[response] ${r.status()} ${r.url()}`); });
  page.on('worker', w => consoleLines.push(`[worker] created ${w.url()}`));
});

// Runs on success AND failure: always leave evidence for the CI artifacts.
test.afterEach(async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/browser-console.log`, consoleLines.join('\n') + '\n');
  const grab = async (expr: string) => { try { return String(await page.evaluate(expr)); } catch (e: any) { return `(unavailable: ${e.message})`; } };
  fs.writeFileSync(`${OUT}/diagnostics-report.txt`, await grab('diagReport()'));
  fs.writeFileSync(`${OUT}/debug-log.txt`, await grab("document.querySelector('#dbg').textContent"));
  fs.writeFileSync(`${OUT}/diagnostics-panel.txt`, await grab("document.querySelector('#dgn').textContent"));
  await page.screenshot({ path: `${OUT}/final.png`, fullPage: true }).catch(() => {});
});

test('Stockfish is verified end to end (no fallback accepted)', async ({ page }) => {
  await test.step('open page, diagnostics panel visible', async () => {
    await page.goto('/index.html');
    await expect(page.locator('#dgn')).toBeVisible();
  });

  await test.step('Stockfish ready within 30s; fallback fails immediately', async () => {
    await page.waitForFunction(() => /Stockfish ready|fallback/i.test(document.querySelector('#est')?.textContent || ''), null, { timeout: 30_000 });
    const status = (await page.locator('#est').innerText()).trim();
    expect(status, 'engine must not be in fallback mode').toBe('Stockfish ready');
    await page.screenshot({ path: `${OUT}/01-ready.png` });
  });

  await test.step('Test engine → uciok, readyok, active, d1d8', async () => {
    let msg = ''; page.once('dialog', d => { msg = d.message(); void d.accept(); });
    await page.click('#te');
    await expect.poll(() => msg, { timeout: 60_000 }).not.toBe('');
    expect(msg).toContain('passed'); expect(msg).toContain('d1d8');
    const diag = await page.locator('#dgn').innerText();
    expect(diag).toContain('uciok received');
    expect(diag).toContain('readyok received');
    expect(diag).toMatch(/State:\s+active/);
    expect(diag).toMatch(/Last bestmove:\s*d1d8/);
    await page.screenshot({ path: `${OUT}/02-engine-test.png` });
  });

  await test.step('Run self-tests → every line PASS', async () => {
    let msg = ''; page.once('dialog', d => { msg = d.message(); void d.accept(); });
    await page.click('#tt');
    await expect.poll(() => msg, { timeout: 60_000 }).not.toBe('');
    const lines = msg.split('\n').filter(Boolean);
    expect(lines.length, 'self-test output').toBeGreaterThanOrEqual(10);
    expect(lines.filter(l => !l.startsWith('PASS ')), 'non-PASS self-test lines').toEqual([]);
    expect(msg).toContain('engine verified');
  });

  await test.step('sample game: Stockfish source, MultiPV 3, final move 17.Rd8#', async () => {
    await page.selectOption('#dp', '10'); // Quick (10) keeps CI bounded; the engine is still real Stockfish
    await page.click('#smp');
    await expect(page.locator('#st')).toHaveText('Complete', { timeout: 480_000 });
    await expect(page.locator('#est')).toHaveText('Stockfish ready'); // still not fallback after the run
    await page.screenshot({ path: `${OUT}/03-analysis-complete.png`, fullPage: true });

    const src = await page.evaluate("ev.filter(Boolean).map(e => e.src)") as string[];
    expect(src.length).toBeGreaterThan(30);
    expect(src.filter(s => s === 'fallback'), 'fallback results present').toEqual([]);
    expect(src.filter(s => s === 'stockfish').length).toBeGreaterThan(30); // 'rules' is only the checkmated final position

    await page.click('[data-a="first"]'); for (let i = 0; i < 10; i++) await page.click('[data-a="next"]');
    await expect(page.locator('#dep')).toContainText('stockfish');
    await expect(page.locator('#dep')).not.toContainText('fallback');
    await expect(page.locator('#pv button[data-ln]')).toHaveCount(3);
    expect(await page.evaluate('ev[10].lines.length')).toBe(3);
    expect(await page.evaluate('ev[1].lines.length')).toBe(3);

    expect(await page.evaluate('G.ms[G.ms.length - 1].san')).toBe('Rd8#');
    const last = page.locator('.mv').last();
    await expect(last).toContainText('17.');
    await expect(last).toContainText('Rd8#');
    await page.click('[data-a="last"]');
    await expect(page.locator('#ev')).toHaveText('#');
    await page.screenshot({ path: `${OUT}/04-final-position.png` });
  });
});
