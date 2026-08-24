#!/usr/bin/env node
// Ye-Almaz — Hikvision attendance bridge
//
// Runs on Server02 (the always-on lab machine, alongside Ollama). Receives
// real-time event pushes from the DS-K1T321MFWX face terminal on the LAN
// and forwards them to the Ye-Almaz API as attendance punches.
//
//   DS-K1T321 (192.168.0.198) --HTTP--> this bridge --HTTPS--> Railway
//
// WHY A BRIDGE AND NOT A DIRECT PUSH: the terminal sends Hikvision's own
// payload shape and cannot attach the x-attendance-device-secret header the
// API requires, so something has to translate and authenticate. Keeping it
// on Server02 also means the secret lives on a machine in a locked room
// rather than on a wall-mounted device, and punches survive an internet
// outage in a local queue instead of being lost.
//
// ZERO npm DEPENDENCIES on purpose - Node built-ins only, so it can be
// copied to Server02 and run without an install step or a lockfile.
//
//   node hikvision-bridge.js
//
// Config via environment variables (see CONFIG below). At minimum set
// API_BASE and ATTENDANCE_DEVICE_SECRET.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  PORT: parseInt(process.env.BRIDGE_PORT, 10) || 9000,
  API_BASE: process.env.API_BASE || 'https://yealmaz-production.up.railway.app',
  DEVICE_SECRET: process.env.ATTENDANCE_DEVICE_SECRET || '',
  DEVICE_ID: process.env.BRIDGE_DEVICE_ID || 'hikvision-ds-k1t321',
  DATA_DIR: process.env.BRIDGE_DATA_DIR || path.join(__dirname, 'data'),
  // Ignore repeat reads of the same badge within this window. The terminal
  // can fire several times while someone stands in front of it, and the
  // API's own duplicate guard is 60s - matching it here avoids a pile of
  // pointless round trips.
  DEDUPE_WINDOW_MS: 60 * 1000,
  RETRY_BASE_MS: 5000,
  MAX_RETRY_MS: 5 * 60 * 1000,
};

fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
const QUEUE_FILE = path.join(CONFIG.DATA_DIR, 'queue.jsonl');
const RAW_LOG = path.join(CONFIG.DATA_DIR, 'raw-events.log');
const STATE_FILE = path.join(CONFIG.DATA_DIR, 'state.json');

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// ── State: last punch per employee per day ──────────────────
// Used only to decide CLOCK_IN vs CLOCK_OUT when the terminal does not
// tell us (see deriveType). Small enough to keep as one JSON file.
let state = { lastPunch: {} };
try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { /* first run */ }
function saveState() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch (e) { log('WARN could not save state:', e.message); }
}

// ── Parsing ─────────────────────────────────────────────────
// Hikvision posts either application/json or multipart/form-data (the
// latter when a face snapshot is attached). Rather than implement a full
// multipart parser, pull the first balanced JSON object out of the body -
// the event metadata is always a JSON part, and the binary image parts do
// not contain balanced braces that would confuse this.
function extractJson(body) {
  const start = body.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(body.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

// Firmware varies in where it puts things, so look in the documented
// place first and fall back to a recursive search rather than failing.
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
  // Hikvision T&A mode reports check-in/check-out directly when the
  // terminal is configured for attendance; honour it when present.
  const attendanceStatus = deepFind(payload, ['attendanceStatus', 'checkInOut']);
  return {
    employeeNo: employeeNo != null ? String(employeeNo).trim() : null,
    dateTime: dateTime || new Date().toISOString(),
    name: name || null,
    attendanceStatus: attendanceStatus != null ? String(attendanceStatus).toLowerCase() : null,
    major: ac.majorEventType ?? deepFind(payload, ['majorEventType']),
    minor: ac.subEventType ?? deepFind(payload, ['subEventType']),
  };
}

// Only genuine "identified and allowed through" events become punches.
// The terminal also pushes door sensors, tamper alarms, failed matches and
// heartbeats; treating those as attendance would invent punches nobody made.
function isAuthenticatedEntry(ev) {
  if (!ev.employeeNo) return false;
  // Unknown/anonymous reads come through with a placeholder id.
  if (/^0+$/.test(ev.employeeNo)) return false;
  // major 5 = access-control event on Hikvision's scheme. If firmware
  // omits it, fall back to "we got a real employee number", which is
  // already a strong signal the person was identified.
  if (ev.major !== undefined && Number(ev.major) !== 5) return false;
  return true;
}

function dayKey(iso) {
  return new Date(iso).toLocaleDateString('en-CA');
}

function deriveType(ev) {
  if (ev.attendanceStatus) {
    if (/in|start|on/.test(ev.attendanceStatus) && !/out/.test(ev.attendanceStatus)) return 'CLOCK_IN';
    if (/out|end|off/.test(ev.attendanceStatus)) return 'CLOCK_OUT';
  }
  // No status from the device: alternate from this employee's last punch
  // today. A wrong guess is visible rather than silent - the API flags an
  // unmatched clock-out for HR instead of rejecting it.
  const key = `${ev.employeeNo}|${dayKey(ev.dateTime)}`;
  return state.lastPunch[key] === 'CLOCK_IN' ? 'CLOCK_OUT' : 'CLOCK_IN';
}

// ── Durable queue ───────────────────────────────────────────
// Append-only JSONL on disk. A punch is written here before any network
// call, so an internet outage, a Railway redeploy or a bridge restart
// cannot lose someone's attendance.
function enqueue(item) {
  fs.appendFileSync(QUEUE_FILE, JSON.stringify(item) + '\n');
}

function readQueue() {
  try {
    return fs.readFileSync(QUEUE_FILE, 'utf8').split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function writeQueue(items) {
  fs.writeFileSync(QUEUE_FILE, items.map(i => JSON.stringify(i)).join('\n') + (items.length ? '\n' : ''));
}

async function postPunch(item) {
  const res = await fetch(`${CONFIG.API_BASE}/api/attendance/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-attendance-device-secret': CONFIG.DEVICE_SECRET,
    },
    body: JSON.stringify({
      employeeCode: item.employeeCode,
      timestamp: item.timestamp,
      type: item.type,
      deviceId: CONFIG.DEVICE_ID,
    }),
  });
  const text = await res.text().catch(() => '');
  return { status: res.status, body: text.slice(0, 300) };
}

let draining = false;
let retryDelay = CONFIG.RETRY_BASE_MS;

async function drain() {
  if (draining) return;
  draining = true;
  try {
    let queue = readQueue();
    while (queue.length) {
      const item = queue[0];
      let result;
      try {
        result = await postPunch(item);
      } catch (err) {
        log('network error, will retry:', err.message);
        break; // keep the item; try again later
      }

      // 409 means the API already has this punch (its own duplicate guard).
      // That is SUCCESS, not failure - retrying it forever would wedge the
      // queue behind an event that is already recorded.
      // 4xx other than 429 means this punch will never be accepted (unknown
      // employee code, bad payload); drop it rather than block everything
      // behind it, but say so loudly.
      if (result.status === 201 || result.status === 409) {
        if (result.status === 409) log(`already recorded ${item.employeeCode} ${item.type}`);
        else log(`sent ${item.employeeCode} ${item.type} @ ${item.timestamp}`);
        queue.shift();
        writeQueue(queue);
        retryDelay = CONFIG.RETRY_BASE_MS;
        continue;
      }

      if (result.status === 429 || result.status >= 500) {
        log(`server busy/error (${result.status}), will retry:`, result.body);
        break;
      }

      log(`DROPPING unacceptable punch (${result.status}) for ${item.employeeCode}:`, result.body);
      if (result.status === 404) {
        log(`  -> no employee has code "${item.employeeCode}". Set the terminal's Employee No. to match (EMP001 etc).`);
      }
      queue.shift();
      writeQueue(queue);
    }

    if (queue.length) {
      setTimeout(() => { draining = false; drain(); }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, CONFIG.MAX_RETRY_MS);
      return;
    }
  } finally {
    if (!readQueue().length) draining = false;
  }
}

// ── HTTP server the terminal posts to ───────────────────────
const recentReads = new Map(); // employeeNo -> timestamp

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/health')) {
    const queued = readQueue().length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, queued, device: CONFIG.DEVICE_ID, api: CONFIG.API_BASE }));
  }

  if (req.method !== 'POST') {
    res.writeHead(405); return res.end();
  }

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('binary');

    // Every payload is logged verbatim. Hikvision's shape varies by
    // firmware, and having the real thing on disk is what makes it
    // possible to fix a parsing gap without guessing.
    try {
      fs.appendFileSync(RAW_LOG, `\n===== ${new Date().toISOString()} ${req.headers['content-type'] || ''}\n${raw.slice(0, 4000)}\n`);
    } catch { /* logging must never break receiving */ }

    // Always 200 immediately: the terminal has limited retry behaviour and
    // an error here could make it drop the event entirely. Anything we can
    // use is already durably queued below.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"statusCode":1,"statusString":"OK"}');

    const payload = extractJson(raw);
    if (!payload) return log('received a payload with no parsable JSON (logged)');

    const ev = parseEvent(payload);
    if (!isAuthenticatedEntry(ev)) {
      return log(`ignored non-attendance event (major=${ev.major} minor=${ev.minor} emp=${ev.employeeNo || '-'})`);
    }

    const last = recentReads.get(ev.employeeNo);
    const now = new Date(ev.dateTime).getTime();
    if (last && Math.abs(now - last) < CONFIG.DEDUPE_WINDOW_MS) {
      return log(`ignored repeat read for ${ev.employeeNo} within dedupe window`);
    }
    recentReads.set(ev.employeeNo, now);

    const type = deriveType(ev);
    state.lastPunch[`${ev.employeeNo}|${dayKey(ev.dateTime)}`] = type;
    saveState();

    enqueue({
      employeeCode: ev.employeeNo,
      timestamp: new Date(ev.dateTime).toISOString(),
      type,
      name: ev.name,
      receivedAt: new Date().toISOString(),
    });
    log(`queued ${ev.employeeNo}${ev.name ? ` (${ev.name})` : ''} ${type}`);
    drain();
  });
});

if (!CONFIG.DEVICE_SECRET) {
  console.error('ATTENDANCE_DEVICE_SECRET is not set — punches would all be rejected with 401. Set it and restart.');
  process.exit(1);
}

server.listen(CONFIG.PORT, () => {
  log(`Hikvision bridge listening on port ${CONFIG.PORT}`);
  log(`  forwarding to ${CONFIG.API_BASE}`);
  log(`  raw payloads -> ${RAW_LOG}`);
  log(`  queue        -> ${QUEUE_FILE}`);
  const pending = readQueue().length;
  if (pending) { log(`  ${pending} punch(es) queued from a previous run — draining`); drain(); }
});
