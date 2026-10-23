// Playwright: the new login page keeps every behaviour of the old one. Usage: node loginflow.mjs <outDir>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const URL = 'http://127.0.0.1:4174';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });

for (const [name, w, h] of [['desktop', 1400, 820], ['phone', 390, 844], ['tablet', 820, 1100]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`${URL}/login`, { waitUntil: 'networkidle' }).catch(() => {});
  await sleep(1500);
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, font: getComputedStyle(document.querySelector('.form-title')).fontFamily.split(',')[0] }));
  check(`${name}: no sideways scrolling`, o.sw <= o.iw + 1, `${o.sw}/${o.iw}`);
  check(`${name}: email field is focused on load`, await page.evaluate(() => document.activeElement?.id === 'login-email'));
  await page.screenshot({ path: `${out}/login-${name}.png` });
  check(`${name}: no page errors`, errs.length === 0, errs[0] || '');
  await ctx.close();
}

// behaviour (desktop)
const ctx = await browser.newContext({ viewport: { width: 1400, height: 820 } });
await ctx.addInitScript(() => localStorage.setItem('ya_theme', 'dark')); // the app default; the login page stays light
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto(`${URL}/login`, { waitUntil: 'networkidle' }).catch(() => {});
await sleep(1200);

// the squad reacts to typing and to the password field
await page.fill('#login-email', ''); await page.keyboard.type('hr_manager@role', { delay: 40 });
const bubbleEmail = await page.locator('.robot-bubble').textContent();
check('squad reacts while typing the email', /email|looking/i.test(bubbleEmail), bubbleEmail.trim());
await page.screenshot({ path: `${out}/login-typing.png` });
await page.click('#login-password');
await sleep(400);
const bubblePw = await page.locator('.robot-bubble').textContent();
check('squad covers its eyes on the password field', /peek/i.test(bubblePw), bubblePw.trim());
await page.screenshot({ path: `${out}/login-password.png` });

// show / hide password
await page.fill('#login-password', 'Test1234!');
check('password is hidden by default', (await page.getAttribute('#login-password', 'type')) === 'password');
await page.click('.password-toggle-btn');
check('eye button reveals the password', (await page.getAttribute('#login-password', 'type')) === 'text');
await page.click('.password-toggle-btn');

// wrong password -> the same server error as before, no navigation
await page.fill('#login-email', 'hr_manager@role.test'); await page.fill('#login-password', 'wrong-password');
await page.click('button[type=submit]');
await page.waitForSelector('.login-error', { timeout: 10000 });
const err = await page.locator('.login-error').textContent();
check('wrong password shows the server\'s error and stays on /login', /invalid|incorrect|password/i.test(err) && page.url().endsWith('/login'), err.trim());
await page.screenshot({ path: `${out}/login-error.png` });

// required fields: browser validation blocks an empty submit
await page.fill('#login-email', ''); await page.fill('#login-password', '');
await page.click('button[type=submit]');
check('empty form is blocked by field validation (no request, still on /login)', page.url().endsWith('/login'));

// keyboard-only: Enter submits, then lands on the role home
await page.fill('#login-email', 'hr_manager@role.test'); await page.fill('#login-password', 'Test1234!');
await page.press('#login-password', 'Enter');
await page.waitForURL(u => !u.pathname.endsWith('/login'), { timeout: 15000 });
await sleep(1500);
check('Enter key signs in and opens the role dashboard', !page.url().endsWith('/login'), page.url());
check('signed-in HR dashboard renders', (await page.locator('text=HR & Payroll').count()) > 0);
check('no page errors in the whole flow', errs.length === 0, errs[0] || '');
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
