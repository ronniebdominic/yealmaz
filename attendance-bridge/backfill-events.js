#!/usr/bin/env node
// Ye-Almaz — one-off historical backfill from the Hikvision terminal's own
// event log into the attendance API.
//
// NOT part of the always-on bridge. Run this once to pull a date range the
// bridge's normal 72h catch-up poll never covered (this bridge only started
// running in August, so May-August predates it entirely on the terminal's
// side — its event log is the only surviving copy of those punches).
//
// Needs the same credentials as the bridge's polling backstop, plus the API
// secret:
//
//   $env:DEVICE_IP               = "192.168.0.198"
//   $env:DEVICE_USER             = "admin"
//   $env:DEVICE_PASSWORD         = "<terminal admin password>"
//   $env:ATTENDANCE_DEVICE_SECRET = "<same value as on Railway>"
//   $env:API_BASE                = "https://yealmaz-production.up.railway.app"
//   $env:START_DATE              = "2026-05-01"   # optional, defaults below
//   $env:END_DATE                = "2026-09-23"   # optional, defaults to now
//
//   node backfill-events.js
//
// Safe to re-run: every punch is re-sent with its ORIGINAL timestamp, so the
// API's duplicate guard returns 409 for anything already recorded (treated
// as success here, not an error).
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Some employees were enrolled on the terminal before the EMP0xx convention
// was adopted, so the terminal still reports its own auto-assigned number
// for them. Same map the live bridge uses — see hikvision-bridge.js.
let EMPLOYEE_CODE_MAP = {};
try {
  EMPLOYEE_CODE_MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'employee-code-map.json'), 'utf8'));
} catch { /* optional - falls back to passing codes through unchanged */ }

const CONFIG = {
  API_BASE: process.env.API_BASE || 'https://yealmaz-production.up.railway.app',
  DEVICE_SECRET: process.env.ATTENDANCE_DEVICE_SECRET || '',
  DEVICE_ID: process.env.BRIDGE_DEVICE_ID || 'hikvision-ds-k1t321',
  ip: process.env.DEVICE_IP,
  user: process.env.DEVICE_USER,
  password: process.env.DEVICE_PASSWORD,
  maxResults: 200,
};

if (!CONFIG.DEVICE_SECRET) { console.error('ATTENDANCE_DEVICE_SECRET is not set.'); process.exit(1); }
if (!CONFIG.ip || !CONFIG.user || !CONFIG.password) {
  console.error('DEVICE_IP, DEVICE_USER and DEVICE_PASSWORD must all be set.');
  process.exit(1);
}

const START = new Date(process.env.START_DATE || '2026-05-01T00:00:00');
const END = process.env.END_DATE ? new Date(process.env.END_DATE) : new Date();
if (isNaN(START) || isNaN(END) || START >= END) {
  console.error('Bad START_DATE/END_DATE.');
  process.exit(1);
}

function log(...args) { console.log(new Date().toISOString(), ...args); }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── same parsing helpers as hikvision-bridge.js, duplicated on purpose so
// this stays a standalone, zero-dependency file that can be deleted after
// use without touching the live bridge ──
function deepFind(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const found = deepFind(v, keys);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function parseEvent(payload) {
  const ac = payload.AccessControllerEvent || {};
  const employeeNo = deepFind(payload, ['employeeNoString', 'employeeNo', 'cardNo']);
  const dateTime = deepFind(payload, ['dateTime', 'time']);
  const name = deepFind(payload, ['name', 'userName']);
  const attendanceStatus = deepFind(payload, ['attendanceStatus', 'checkInOut']);
  const rawEmployeeNo = employeeNo != null ? String(employeeNo).trim() : null;
  return {
    employeeNo: rawEmployeeNo != null ? (EMPLOYEE_CODE_MAP[rawEmployeeNo] || rawEmployeeNo) : null,
    dateTime: dateTime || null,
    name: name || null,
    attendanceStatus: attendanceStatus != null ? String(attendanceStatus).toLowerCase() : null,
    major: ac.majorEventType ?? deepFind(payload, ['majorEventType']),
  };
}

function isAuthenticatedEntry(ev) {
  if (!ev.employeeNo || !ev.dateTime) return false;
  if (/^0+$/.test(ev.employeeNo)) return false;
  if (ev.major !== undefined && Number(ev.major) !== 5) return false;
  return true;
}

function dayKey(iso) { return new Date(iso).toLocaleDateString('en-CA'); }

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
  const url = `http://${CONFIG.ip}${pathname}`;
  const method = body ? 'POST' : 'GET';
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  let res = await fetch(url, init);
  if (res.status === 401) {
    const challenge = res.headers.get('www-authenticate') || '';
    init.headers.Authorization = digestHeader({ username: CONFIG.user, password: CONFIG.password, method, uri: pathname, challenge });
    res = await fetch(url, init);
  }
  if (!res.ok) throw new Error(`ISAPI ${pathname} -> HTTP ${res.status}`);
  return res.json();
}

function isapiTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(off) / 60)), om = pad(Math.abs(off) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${oh}:${om}`;
}

// Queried a day at a time so a single ISAPI search never has to cover the
// whole multi-month range — keeps each query well clear of the pagination
// cap below even with many employees punching twice a day.
async function fetchWindow(start, end) {
  let position = 0;
  const rows = [];
  for (;;) {
    const data = await isapi('/ISAPI/AccessControl/AcsEvent?format=json', {
      AcsEventCond: {
        searchID: 'yealmaz-backfill',
        searchResultPosition: position,
        maxResults: CONFIG.maxResults,
        major: 5,
        minor: 0,
        startTime: isapiTime(start),
        endTime: isapiTime(end),
      },
    });
    const result = data.AcsEvent || {};
    const list = result.InfoList || [];
    rows.push(...list);
    position += list.length;
    // The terminal caps each response batch well below the maxResults we
    // request (observed ~30/call regardless of what's asked for), so a
    // short batch does NOT mean "no more data" - only responseStatusStrg
    // tells us that ("MORE" = keep paging, anything else = done).
    if (list.length === 0 || result.responseStatusStrg !== 'MORE') break;
    if (position > 5000) { log(`  WARNING: hit 5000-record cap for ${start.toDateString()}, some events may be missing`); break; }
    // A small pause between pages - this device is a small embedded web
    // server, and days with hundreds of events now need many paginated
    // calls each; hammering it back-to-back risks overloading it (as
    // happened after the first two full-range runs today).
    await sleep(150);
  }
  return rows;
}

async function postPunch(item) {
  const res = await fetch(`${CONFIG.API_BASE}/api/attendance/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-attendance-device-secret': CONFIG.DEVICE_SECRET },
    body: JSON.stringify({ employeeCode: item.employeeCode, timestamp: item.timestamp, type: item.type, deviceId: CONFIG.DEVICE_ID }),
  });
  const text = await res.text().catch(() => '');
  return { status: res.status, body: text.slice(0, 300) };
}

async function main() {
  log(`Pulling events from ${START.toISOString()} to ${END.toISOString()} off ${CONFIG.ip}`);

  const allEvents = [];
  for (let d = new Date(START); d < END; d.setDate(d.getDate() + 1)) {
    const windowStart = new Date(d);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 1);
    if (windowEnd > END) windowEnd.setTime(END.getTime());

    let rows;
    try {
      rows = await fetchWindow(windowStart, windowEnd);
    } catch (err) {
      log(`  FAILED to fetch ${windowStart.toDateString()}: ${err.message} — skipping this day`);
      continue;
    }
    if (rows.length) log(`  ${windowStart.toDateString()}: ${rows.length} raw event(s)`);
    allEvents.push(...rows);
  }

  const parsed = allEvents
    .map(parseEvent)
    .filter(isAuthenticatedEntry)
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

  log(`${parsed.length} authenticated punch event(s) found across the range`);

  // Face terminals commonly fire twice in rapid succession for one actual
  // badge (multiple recognition frames) - the live bridge already guards
  // against this on real-time pushes (see DEDUPE_WINDOW_MS in
  // hikvision-bridge.js). Apply the same guard here, or every duplicate
  // fire gets split into a fake instant CLOCK_IN -> CLOCK_OUT pair.
  const DEDUPE_WINDOW_MS = 60 * 1000;
  const lastSeen = {};
  const deduped = [];
  let skippedDupes = 0;
  for (const ev of parsed) {
    const t = new Date(ev.dateTime).getTime();
    const prev = lastSeen[ev.employeeNo];
    if (prev !== undefined && Math.abs(t - prev) < DEDUPE_WINDOW_MS) {
      skippedDupes++;
      continue;
    }
    lastSeen[ev.employeeNo] = t;
    deduped.push(ev);
  }
  if (skippedDupes) log(`ignored ${skippedDupes} repeat read(s) within ${DEDUPE_WINDOW_MS / 1000}s of a prior read`);

  // Chronological pass so CLOCK_IN/CLOCK_OUT alternation (used whenever the
  // terminal doesn't report attendanceStatus itself) comes out correct.
  const lastPunch = {};
  let sent = 0, dup = 0, unknown = 0, failed = 0;
  for (const ev of deduped) {
    let type;
    if (ev.attendanceStatus && /in|start|on/.test(ev.attendanceStatus) && !/out/.test(ev.attendanceStatus)) type = 'CLOCK_IN';
    else if (ev.attendanceStatus && /out|end|off/.test(ev.attendanceStatus)) type = 'CLOCK_OUT';
    else {
      const key = `${ev.employeeNo}|${dayKey(ev.dateTime)}`;
      type = lastPunch[key] === 'CLOCK_IN' ? 'CLOCK_OUT' : 'CLOCK_IN';
    }
    lastPunch[`${ev.employeeNo}|${dayKey(ev.dateTime)}`] = type;

    try {
      const result = await postPunch({ employeeCode: ev.employeeNo, timestamp: new Date(ev.dateTime).toISOString(), type });
      if (result.status === 201) { sent++; log(`sent ${ev.employeeNo} ${type} @ ${ev.dateTime}`); }
      else if (result.status === 409) { dup++; }
      else if (result.status === 404) { unknown++; log(`DROPPED ${ev.employeeNo} @ ${ev.dateTime}: no matching employee code`); }
      else { failed++; log(`FAILED ${ev.employeeNo} @ ${ev.dateTime}: ${result.status} ${result.body}`); }
    } catch (err) {
      failed++;
      log(`FAILED ${ev.employeeNo} @ ${ev.dateTime}: ${err.message}`);
    }
  }

  log(`Done. sent=${sent} already-recorded=${dup} unknown-employee=${unknown} failed=${failed}`);
}

main().catch(err => { console.error(err); process.exit(1); });
