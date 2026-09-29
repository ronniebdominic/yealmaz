#!/usr/bin/env node
// Ye-Almaz — one-off diagnostic: list everyone currently enrolled on the
// Hikvision terminal, with their Employee No. as the terminal has it set
// right now. Read-only, changes nothing.
//
// Run this to see whether the terminal's Employee No. values already match
// Ye-Almaz codes (EMP001 etc.) or are still the terminal's own auto-assigned
// numbers (00000001, 00000002, ...) — which is what backfill-events.js was
// finding as "no matching employee code."
//
//   $env:DEVICE_IP = "192.168.0.198"
//   $env:DEVICE_USER = "admin"
//   $env:DEVICE_PASSWORD = "<terminal admin password>"
//
//   node list-terminal-users.js
'use strict';

const crypto = require('crypto');

const ip = process.env.DEVICE_IP;
const user = process.env.DEVICE_USER;
const password = process.env.DEVICE_PASSWORD;

if (!ip || !user || !password) {
  console.error('DEVICE_IP, DEVICE_USER and DEVICE_PASSWORD must all be set.');
  process.exit(1);
}

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

function digestHeader({ username, password, method, uri, challenge }) {
  const get = (k) => (challenge.match(new RegExp(`${k}="?([^",]+)"?`)) || [])[1];
  const realm = get('realm'), nonce = get('nonce'), qop = get('qop'), opaque = get('opaque');
  const algorithm = get('algorithm') || 'MD5';
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);
  let h = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}", algorithm=${algorithm}`;
  if (qop) h += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  if (opaque) h += `, opaque="${opaque}"`;
  return h;
}

async function isapi(pathname, body) {
  const url = `http://${ip}${pathname}`;
  const method = body ? 'POST' : 'GET';
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  let res = await fetch(url, init);
  if (res.status === 401) {
    const challenge = res.headers.get('www-authenticate') || '';
    init.headers.Authorization = digestHeader({ username: user, password, method, uri: pathname, challenge });
    res = await fetch(url, init);
  }
  if (!res.ok) throw new Error(`ISAPI ${pathname} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  let position = 0;
  const all = [];
  for (;;) {
    const data = await isapi('/ISAPI/AccessControl/UserInfo/Search?format=json', {
      UserInfoSearchCond: {
        searchID: 'yealmaz-list-users',
        searchResultPosition: position,
        maxResults: 30,
      },
    });
    const result = data.UserInfoSearch || {};
    const list = result.UserInfo || [];
    all.push(...list);
    position += list.length;
    if (list.length < 30 || result.responseStatusStrg === 'OK') break;
    if (position > 2000) break;
  }

  console.log(`${all.length} user(s) enrolled on the terminal:\n`);
  console.log('employeeNo'.padEnd(14), 'name');
  console.log('-'.repeat(40));
  for (const u of all) {
    console.log(String(u.employeeNo ?? '').padEnd(14), u.name || '(no name set)');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
