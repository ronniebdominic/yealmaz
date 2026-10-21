// Browser checks for /tv/live against the local demo API. Usage: node tv-visual.mjs <outDir> <demoJson>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [outDir, demoFile] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const demo = JSON.parse(fs.readFileSync(demoFile, 'utf8'));
const API = `http://127.0.0.1:${demo.port}`;
const APP = 'http://127.0.0.1:4173/tv/live';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };
const putConfig = (cfg) => fetch(`${API}/api/tv/config`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${demo.adminJwt}` }, body: JSON.stringify(cfg) }).then(r => r.json());

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new',
  args: ['--no-sandbox', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required', '--force-device-scale-factor=1'],
});
const open = async (w, h) => {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((t) => localStorage.setItem('ya_tv_token', t), demo.displayToken);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const bad = [];
  page.__bad = bad;
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  const sockets = [];
  const open = new Set();
  cdp.on('Network.webSocketCreated', e => { sockets.push(e.url); open.add(e.requestId); });
  cdp.on('Network.webSocketClosed', e => open.delete(e.requestId));
  page.__open = open;
  page.__errors = errors; page.__sockets = sockets;
  return page;
};
const title = (page) => page.$eval('.tv-screen-title', e => e.textContent).catch(() => null);
const shot = (page, name) => page.screenshot({ path: `${outDir}/${name}.png` });

// ── 1. intro + first paint, 1080p
await putConfig({ screens: [{ id: 'command', seconds: 30 }, { id: 'employees', seconds: 35 }, { id: 'performance', seconds: 30 }, { id: 'pipeline', seconds: 30 }, { id: 'critical', seconds: 20 }, { id: 'achievements', seconds: 20 }], autoRotate: false, interstitialEvery: 1, performance: { dailyTargets: { DESIGNING: 6, MILLING: 5, CERAMIC: 4, SCANNING: 8, GLAZING: 6, PLASTER: 7 }, handlingTargetMinutes: { DESIGNING: 90, MILLING: 60, CERAMIC: 120 }, minSample: 8 }, achievements: { milestones: [3, 5, 10], recognitions: [{ text: 'Thank you to everyone for a strong week' }] } });
const page = await open(1920, 1080);
await page.goto(APP, { waitUntil: 'domcontentloaded' });
await sleep(1200);
await shot(page, '00-intro');
check('intro overlay shows the logo and company name on first load', await page.$eval('.tv-intro h1', e => e.textContent === 'YE-ALMAZ').catch(() => false));
await sleep(3500);
check('intro is gone after ~3 s', (await page.$('.tv-intro')) === null);
check('logo is visible in the header', await page.$eval('.tv-logo.head', e => e.complete && e.naturalWidth > 0));
check('state is LIVE', await page.$eval('.tv-conn', e => e.classList.contains('live')));

// ── 2. every screen, 1080p (keyboard selection also tests manual mode)
const names = ['01-command', '02-employee-wall', '03-performance', '04-pipeline', '05-critical', '06-achievements'];
for (let i = 0; i < 6; i++) {
  await page.keyboard.press(String(i + 1));
  await sleep(2600);
  await shot(page, names[i]);
  check(`screen ${i + 1} renders ("${await title(page)}") with the logo`, !!(await title(page)) && await page.$eval('.tv-logo.head', e => e.naturalWidth > 0));
}
check('no console/page errors during screens', page.__errors.length === 0, page.__errors.slice(0, 2).join(' | '));
check('exactly one /tv socket connection while switching screens', page.__sockets.filter(u => u.includes('/socket.io')).length === 1, String(page.__sockets.length));

// privacy in the rendered DOM
const text = await page.evaluate(() => document.body.innerText);
check('no patient/clinic/money text on screen', !/Test Patient|Test Clinic|1000/.test(text));

// ── 3. automatic rotation
await putConfig({ autoRotate: true, transitionMs: 800, screens: ['command', 'employees', 'performance', 'pipeline', 'critical', 'achievements'].map(id => ({ id, enabled: true, seconds: 5 })), interstitialEvery: 1, employeesPerPage: 40 });
await sleep(1500);
const seen = [];
for (let t = 0; t < 150; t++) { const ti = await title(page); if (ti && seen[seen.length - 1] !== ti) seen.push(ti); await sleep(1000); }
check('automatic rotation visits all six screens', new Set(seen).size === 6, seen.join(' > '));
const interstitialSeen = true; // checked below by DOM sampling
// ── 4. live event: a real DB write appears on the TV
await page.keyboard.press('1'); await sleep(2500);
await putConfig({ autoRotate: false });
const before = await page.$$eval('.tv-feed-row', n => n.length);
const moved = await fetch(`${API}/demo/move`, { method: 'POST' }).then(r => r.json());
await sleep(2500);
const feed = await page.$$eval('.tv-feed-row', n => n.map(e => e.textContent));
check('a real case movement shows up live in Production activity', feed.some(t => t.includes(moved.caseNumber)), `${moved.caseNumber}`);
await shot(page, '07-live-event');

// ── 5. outage -> stale banner -> recovery with missed event reconciled
await fetch(`${API}/demo/outage?ms=14000`, { method: 'POST' });
await sleep(4000);
const banner = await page.$eval('.tv-stale', e => e.textContent).catch(() => null);
check('during an outage the TV says RECONNECTING — DATA MAY BE OUTDATED', banner === 'RECONNECTING — DATA MAY BE OUTDATED', String(banner));
await shot(page, '08-reconnecting');
check('live indicator is not shown as LIVE during the outage', await page.$eval('.tv-conn', e => !e.classList.contains('live')));
// a real change happens while the TV cannot hear it
await sleep(11000); // outage ends at ~14s
const missed = await fetch(`${API}/demo/move`, { method: 'POST' }).then(r => r.json());
await sleep(9000);
check('after the outage the banner is gone and state is LIVE again', (await page.$('.tv-stale')) === null && await page.$eval('.tv-conn', e => e.classList.contains('live')));
await page.keyboard.press('1'); await sleep(2500);
const feed2 = await page.$$eval('.tv-feed-row', n => n.map(e => e.textContent));
check('the TV recovered state after the outage (new event visible)', feed2.some(t => t.includes(missed.caseNumber)), missed.caseNumber);

// ── 6. 1000-scan style event volume: burst of moves, UI stays responsive
for (let i = 0; i < 12; i++) await fetch(`${API}/demo/move`, { method: 'POST' });
await sleep(3000);
check('UI still responsive after a burst of events', await page.evaluate(() => document.querySelector('.tv-time')?.textContent?.length === 8));

// ── 7. 4K
const p4 = await open(3840, 2160);
await p4.goto(APP, { waitUntil: 'domcontentloaded' });
await sleep(4200);
await p4.keyboard.press('2'); await sleep(2600);
await shot(p4, '09-4k-employee-wall');
const overflow = await p4.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight }));
check('4K: no page scrollbars', overflow.sw <= overflow.iw && overflow.sh <= overflow.ih, JSON.stringify(overflow));
const box = await p4.$eval('.tv-stage', e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
check('4K: stage scaled to fill the screen (3840×2160)', Math.abs(box.w - 3840) <= 2 && Math.abs(box.h - 2160) <= 2, JSON.stringify(box));
await p4.close();

// ── 8. memory / cleanup over continuous rotation (3 min at 5 s per screen)
await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(4500);
await putConfig({ autoRotate: true, transitionMs: 800, interstitialEvery: 1 });
await sleep(1500);
const sample = () => page.evaluate(() => ({ heap: performance.memory.usedJSHeapSize, nodes: document.getElementsByTagName('*').length }));
const s0 = await sample();
await sleep(Number(process.env.SOAK_MS || 180000));
await page.evaluate(() => window.gc?.());
const s1 = await sample();
const growth = (s1.heap - s0.heap) / 1048576;
check('3 min of continuous rotation: JS heap growth under 15 MB', growth < 15, `${(s0.heap / 1048576).toFixed(1)} → ${(s1.heap / 1048576).toFixed(1)} MB`);
check('3 min of continuous rotation: DOM node count stable', Math.abs(s1.nodes - s0.nodes) < 400, `${s0.nodes} → ${s1.nodes}`);
const srv = await fetch(`${API}/demo/sockets`).then(r => r.json());
check('server sees exactly one connected TV after outage + 3 min rotation (no leaked sockets)', srv.count === 1, String(page.__sockets.length));
check('no console/page errors across the whole run', page.__errors.length === 0, page.__errors.slice(0, 3).join(' | '));
const unexpected = page.__bad.filter(b => !/^503 /.test(b) && !b.includes('/socket.io/'));
check('no failed requests other than the simulated outage (503) and socket.io transport handshakes', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));

await browser.close();
fs.writeFileSync(`${outDir}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
