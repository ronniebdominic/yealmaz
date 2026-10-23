// Playwright: automatic rotation visits all 11 screens, paging shows every HR name, one socket only.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const demo = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const API = `http://127.0.0.1:${demo.port}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ORDER = ['command', 'dispatch', 'statusboard', 'employees', 'labscans', 'hr', 'delivery', 'performance', 'pipeline', 'critical', 'achievements'];
await fetch(`${API}/api/tv/config`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${demo.adminJwt}` }, body: JSON.stringify({ autoRotate: true, interstitialEvery: 0, transitionMs: 600, employeesPerPage: 8, screens: ORDER.map(id => ({ id, enabled: true, seconds: 5 })) }) });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript((t) => localStorage.setItem('ya_tv_token', t), demo.displayToken);
const page = await ctx.newPage();
let sockets = 0; page.on('websocket', () => { sockets += 1; });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto('http://127.0.0.1:4173/tv/live', { waitUntil: 'domcontentloaded' });
await sleep(4500);
const visited = []; const hrNames = new Set();
const t0 = Date.now();
while (Date.now() - t0 < 230000) {
  const t = await page.locator('.tv-screen-title').textContent();
  if (visited[visited.length - 1] !== t) visited.push(t);
  if (t.startsWith('HR')) (await page.$$eval('.tv-hr-col.green .tv-hr-who b', n => n.map(e => e.textContent))).forEach(x => hrNames.add(x));
  await sleep(700);
}
const snap = await (await fetch(`${API}/api/tv/snapshot`, { headers: { authorization: `Bearer ${demo.displayToken}` } })).json();
const unique = new Set(visited);
console.log(`${unique.size === 11 ? 'PASS' : 'FAIL'}  rotation visited ${unique.size}/11 screens: ${visited.join(' > ')}`);
console.log(`${hrNames.size === new Set(snap.hr.present.map(p => p.name)).size ? 'PASS' : 'FAIL'}  HR present list paged fully: saw ${hrNames.size} of ${snap.hr.present.length} names`);
console.log(`${sockets <= 1 ? 'PASS' : 'FAIL'}  websocket connections opened: ${sockets}`);
console.log(`${errors.length === 0 ? 'PASS' : 'FAIL'}  page errors: ${errors.length} ${errors.slice(0, 2).join(' | ')}`);
await browser.close();
process.exit(unique.size === 11 && errors.length === 0 && sockets <= 1 ? 0 : 1);
