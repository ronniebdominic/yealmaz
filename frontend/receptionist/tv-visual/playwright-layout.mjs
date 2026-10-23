// Playwright: render every TV screen and detect layout defects (overflow past the screen area, clipped or
// overlapping content). Usage: node layout.mjs <outDir> <demoJson> [width] [height]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [outDir, demoFile, W = '1920', H = '1080'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const demo = JSON.parse(fs.readFileSync(demoFile, 'utf8'));
const API = `http://127.0.0.1:${demo.port}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const put = (cfg) => fetch(`${API}/api/tv/config`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${demo.adminJwt}` }, body: JSON.stringify(cfg) });
const ORDER = ['command', 'dispatch', 'statusboard', 'employees', 'labscans', 'hr', 'delivery', 'performance', 'pipeline', 'critical', 'achievements'];

await put({ autoRotate: false, interstitialEvery: 0, employeesPerPage: 8, screens: ORDER.map(id => ({ id, enabled: true, seconds: 30 })),
  performance: { dailyTargets: { DESIGNING: 6, MILLING: 5, CERAMIC: 4, SCANNING: 8, GLAZING: 6, PLASTER: 7 }, minSample: 8 } });

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: Number(W), height: Number(H) } });
await ctx.addInitScript((t) => localStorage.setItem('ya_tv_token', t), demo.displayToken);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.goto('http://127.0.0.1:4173/tv/live', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.tv-conn.live', { timeout: 20000 });
await sleep(3800); // intro

const problems = [];
for (let i = 0; i < ORDER.length; i++) {
  if (i < 9) await page.keyboard.press(String(i + 1)); else await page.keyboard.press('ArrowRight'); // 1-9 jump; 10th/11th step on
  await sleep(2600);
  const id = ORDER[i];
  const title = await page.locator('.tv-screen-title').textContent();
  await page.screenshot({ path: `${outDir}/${String(i + 1).padStart(2, '0')}-${id}.png` });

  // layout checks, in stage coordinates (the stage is a fixed 1920x1080 canvas scaled to fit)
  const res = await page.evaluate(() => {
    const stage = document.querySelector('.tv-stage').getBoundingClientRect();
    const scale = stage.width / 1920;
    const main = document.querySelector('.tv-main').getBoundingClientRect();
    const footerTop = document.querySelector('.tv-footer').getBoundingClientRect().top;
    const screen = [...document.querySelectorAll('.tv-screen')].pop();
    const out = { outside: [], clipped: [], overlap: [] };
    const nodes = [...screen.querySelectorAll('*')].filter(e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0);
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      if (el.closest('.tv-confetti')) continue; // decorative falling pieces
      const where = `${el.tagName.toLowerCase()}.${(el.className && el.className.baseVal === undefined ? el.className : '').toString().split(' ')[0]}`;
      if (r.bottom > footerTop + 1 || r.right > stage.right + 1 || r.left < stage.left - 1) out.outside.push(`${where} "${(el.textContent || '').trim().slice(0, 30)}" bottom=${Math.round((r.bottom - stage.top) / scale)}`);
      const cs = getComputedStyle(el);
      if (el.children.length === 0 && el.textContent.trim() && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2 && cs.display !== 'inline') out.clipped.push(`${where} "${el.textContent.trim().slice(0, 40)}"`);
    }
    // content spilling out of its own card (text escaping a row/tile/column)
    for (const sel of ['.tv-emp', '.tv-dsp-tile', '.tv-node', '.tv-hr-col', '.tv-crit-col', '.tv-list-row', '.tv-perf-row', '.tv-kpi', '.tv-hr-row', '.tv-panel']) {
      for (const card of screen.querySelectorAll(sel)) {
        const C = card.getBoundingClientRect();
        for (const el of card.querySelectorAll('*')) {
          if (el.closest('.tv-confetti')) continue;
          const R = el.getBoundingClientRect();
          if (R.width === 0 || R.height === 0) continue;
          if (R.top < C.top - 2 || R.bottom > C.bottom + 2 || R.left < C.left - 2 || R.right > C.right + 2) {
            if (el.closest('.tv-hr-col') && sel === '.tv-hr-row') continue;
            out.clipped.push(`${sel} spills: ${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent || '').trim().slice(0, 24)}"`);
          }
        }
      }
    }
    // sibling cards overlapping each other
    for (const sel of ['.tv-emp', '.tv-dsp-tile', '.tv-node', '.tv-hr-col', '.tv-crit-col', '.tv-list-row', '.tv-perf-row', '.tv-sbd-row', '.tv-kpi', '.tv-hr-row']) {
      const els = [...screen.querySelectorAll(sel)];
      for (let a = 0; a < els.length; a++) for (let b = a + 1; b < els.length; b++) {
        const A = els[a].getBoundingClientRect(), B = els[b].getBoundingClientRect();
        const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left), oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
        if (ox > 4 && oy > 4) out.overlap.push(`${sel} #${a} x #${b}`);
      }
    }
    return out;
  });
  const bad = res.outside.length + res.clipped.length + res.overlap.length;
  console.log(`${bad ? 'ISSUES' : 'ok    '} ${String(i + 1).padStart(2)} ${id.padEnd(12)} "${title}"${bad ? `  outside:${res.outside.length} clipped:${res.clipped.length} overlap:${res.overlap.length}` : ''}`);
  for (const k of ['outside', 'clipped', 'overlap']) for (const line of res[k].slice(0, 6)) console.log(`        ${k}: ${line}`);
  if (bad) problems.push(id);
}
console.log(errors.length ? `PAGE ERRORS: ${errors.slice(0, 3).join(' | ')}` : 'no page errors');
await browser.close();
process.exit(problems.length || errors.length ? 1 : 0);
