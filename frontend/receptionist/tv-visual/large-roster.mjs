// Large roster: every employee must appear through paging (none dropped). Usage: node large.mjs <outDir> <demoJson> <expectedEmployees>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [outDir, demoFile, expected] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const demo = JSON.parse(fs.readFileSync(demoFile, 'utf8'));
const API = `http://127.0.0.1:${demo.port}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await fetch(`${API}/api/tv/config`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${demo.adminJwt}` }, body: JSON.stringify({ autoRotate: true, employeesPerPage: 12, interstitialEvery: 0, screens: ['command','employees','performance','pipeline','critical','achievements'].map(id => ({ id, enabled: ['employees','command'].includes(id), seconds: 10 })) }) });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
await page.evaluateOnNewDocument((t) => localStorage.setItem('ya_tv_token', t), demo.displayToken);
await page.goto('http://127.0.0.1:4173/tv/live', { waitUntil: 'domcontentloaded' });
await sleep(4000);
const seen = new Set(); let pagesSeen = new Set(); let shot = false;
const pageCount = Math.ceil(Number(expected) / 12);
for (let t = 0; t < (pageCount * 8 + 30) * 2; t++) {
  const names = await page.$$eval('.tv-emp h4', n => n.map(e => e.textContent));
  names.forEach(n => seen.add(n));
  const dots = await page.$$eval('.tv-pager span', n => n.findIndex(e => e.classList.contains('on')));
  if (dots >= 0) pagesSeen.add(dots);
  if (!shot && dots === 2) { await page.screenshot({ path: `${outDir}/10-large-roster-page3.png` }); shot = true; }
  await sleep(500);
}
const total = await page.evaluate(async (api, tok) => (await (await fetch(`${api}/api/tv/snapshot`, { headers: { authorization: `Bearer ${tok}` } })).json()).employees.length, API, demo.displayToken);
const unique = new Set();
const all = await page.evaluate(async (api, tok) => (await (await fetch(`${api}/api/tv/snapshot`, { headers: { authorization: `Bearer ${tok}` } })).json()).employees.map(e => e.name), API, demo.displayToken);
all.forEach(n => unique.add(n));
// names can repeat in synthetic data; compare against the snapshot's own list
const missing = all.filter(n => !seen.has(n));
console.log(`employees in snapshot: ${total}; pages shown: ${[...pagesSeen].sort().join(',')} of ${pageCount}; names seen on screen: ${seen.size}; missing: ${missing.length}`);
await browser.close();
const ok = missing.length === 0 && pagesSeen.size === pageCount;
console.log(ok ? 'PASS  every employee appeared through paging' : 'FAIL  some employees never appeared');
process.exit(ok ? 0 : 1);
