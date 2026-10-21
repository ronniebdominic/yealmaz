// Browser: (1) the logo interstitial appears after a full rotation, (2) revoking a display drops it to the pairing page.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const demo = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outDir = process.argv[3];
const API = `http://127.0.0.1:${demo.port}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const put = (cfg) => fetch(`${API}/api/tv/config`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${demo.adminJwt}` }, body: JSON.stringify(cfg) });
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };

await put({ autoRotate: true, transitionMs: 800, interstitialEvery: 1, interstitialSlogan: '', screens: ['command', 'critical'].map(id => ({ id, enabled: true, seconds: 5 })) });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
await page.evaluateOnNewDocument((t) => localStorage.setItem('ya_tv_token', t), demo.displayToken);
await page.goto('http://127.0.0.1:4173/tv/live', { waitUntil: 'domcontentloaded' });
await sleep(4500);
let inter = false;
for (let i = 0; i < 40 && !inter; i++) { inter = !!(await page.$('.tv-intro.inter')); if (inter) await page.screenshot({ path: `${outDir}/11-interstitial.png` }); await sleep(500); }
check('branded interstitial shows after a full rotation', inter);
await sleep(4200);
check('interstitial clears and rotation continues', (await page.$('.tv-intro')) === null);

// revoke from the admin side
const list = await fetch(`${API}/api/tv/displays`, { headers: { authorization: `Bearer ${demo.adminJwt}` } }).then(r => r.json());
const paired = list.find(d => d.status === 'PAIRED');
await fetch(`${API}/api/tv/displays/${paired.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${demo.adminJwt}` } });
let pairing = false;
for (let i = 0; i < 20 && !pairing; i++) { pairing = !!(await page.$('.tv-pairing')); await sleep(500); }
check('revoked display drops to the pairing page within seconds', pairing);
if (pairing) await page.screenshot({ path: `${outDir}/12-pairing.png` });
check('token removed from the TV after revocation', (await page.evaluate(() => localStorage.getItem('ya_tv_token'))) === null);
const stillConnected = await fetch(`${API}/demo/sockets`).then(r => r.json());
check('revoked TV holds no live connection', stillConnected.count === 0, String(stillConnected.count));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
