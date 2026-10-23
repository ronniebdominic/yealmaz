// Playwright: TV behaviour checks beyond layout. Usage: node bugs.mjs <demoJson> <outDir>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [demoFile, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const demo = JSON.parse(fs.readFileSync(demoFile, 'utf8'));
const API = `http://127.0.0.1:${demo.port}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };
const put = (cfg) => fetch(`${API}/api/tv/config`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${demo.adminJwt}` }, body: JSON.stringify(cfg) });
await put({ autoRotate: false, interstitialEvery: 0 });

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const ctxFor = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, ...opts });
  await ctx.addInitScript((t) => localStorage.setItem('ya_tv_token', t), demo.displayToken);
  return ctx;
};

// ── 1. the server is down while the TV loads (power cut, deploy): it must come up by itself, with its settings
{
  await fetch(`${API}/demo/outage?ms=9000`, { method: 'POST' });
  const ctx = await ctxFor(); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://127.0.0.1:4174/tv/live', { waitUntil: 'domcontentloaded' });
  await sleep(4500);
  const during = await page.locator('.tv-conn').textContent();
  check('while the server is down the header does not claim LIVE', !/LIVE/.test(during), during.trim());
  await sleep(16000);
  const live = await page.locator('.tv-conn.live').count();
  const title = await page.locator('.tv-screen-title').textContent();
  const loading = await page.locator('.tv-loading').count();
  check('after the server returns the TV is LIVE and showing a real screen (not stuck "Connecting…")', live === 1 && loading === 0, `${title.trim()}`);
  check('rotation settings were loaded after the late start', (await page.$$eval('.tv-tabs button', b => b.length)) >= 6);
  check('no page errors during a down-then-up start', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// ── 2. resizing the window must not animate the whole stage (it used to zoom slowly for 2 s)
{
  const ctx = await ctxFor(); const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4174/tv/live', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tv-conn.live', { timeout: 20000 }); await sleep(3800);
  await page.setViewportSize({ width: 1280, height: 720 });
  await sleep(120);
  const w = await page.$eval('.tv-stage', e => Math.round(e.getBoundingClientRect().width));
  check('stage is already at the new size 120 ms after a resize (no slow zoom)', Math.abs(w - 1280) <= 4, `${w}px`);
  await ctx.close();
}

// ── 3. the "reconnecting" banner must not cover content
{
  const ctx = await ctxFor(); const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4174/tv/live', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tv-conn.live', { timeout: 20000 }); await sleep(3800);
  await fetch(`${API}/demo/outage?ms=12000`, { method: 'POST' });
  await sleep(3500);
  const r = await page.evaluate(() => {
    const banner = document.querySelector('.tv-stale'); if (!banner) return null;
    const b = banner.getBoundingClientRect();
    const main = document.querySelector('.tv-main').getBoundingClientRect();
    const footer = document.querySelector('.tv-footer').getBoundingClientRect();
    return { text: banner.textContent, bannerTop: b.top, mainBottom: main.bottom, footerTop: footer.top };
  });
  check('stale banner is shown with the required wording', r?.text === 'RECONNECTING — DATA MAY BE OUTDATED', r?.text);
  check('stale banner sits over the footer, not over the screen content', r && r.bannerTop >= r.mainBottom - 1, JSON.stringify(r));
  await page.screenshot({ path: `${out}/stale-banner.png` });
  await ctx.close();
}

// ── 4. reduced-motion viewers get no running animations on the stage
{
  const ctx = await ctxFor({ reducedMotion: 'reduce' }); const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4174/tv/live', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tv-conn.live', { timeout: 20000 }); await sleep(4200);
  const n = await page.evaluate(() => [...document.querySelectorAll('.tv-stage *')].filter(e => { const a = getComputedStyle(e).animationName; return a && a !== 'none' && !/tvPulse|tvProgress/.test(a); }).length);
  check('reduced motion: decorative animations are off (only the progress bar / live dot may move)', n === 0, `${n} animated elements`);
  await ctx.close();
}

// ── 5. fullscreen toggle and keyboard do not throw
{
  const ctx = await ctxFor(); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://127.0.0.1:4174/tv/live', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tv-conn.live', { timeout: 20000 }); await sleep(3800);
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowLeft', ' ', ' ', 'f', 'f', '3', '1']) { await page.keyboard.press(k); await sleep(250); }
  check('keyboard controls and fullscreen toggle raise no errors', errs.length === 0, errs[0] || '');
  await ctx.close();
}
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
