#!/usr/bin/env node
'use strict';
// Ye-Almaz — unstick the reliable bridge's send queue after people were registered.
//
// The reliable bridge sends punches strictly in order and retries an "unknown employee" answer forever, so
// one punch from an unregistered person at the front of the queue blocks everyone behind it. This tool
// repairs the saved state:
//   * QUEUED punches for a terminal number you give a code for get that code, so they can be sent;
//   * QUEUED punches for a number you "park" are set aside in review, so they stop blocking;
//   * punches already SET ASIDE (review) for a number you give a code for go back to the queue.
//
//   1. Stop the bridge:   Stop-ScheduledTask -TaskName YeAlmaz-Attendance-Bridge-Reliable
//   2. node requeue-review.js <path to reliable-state.json> 00000042=EMP038 00000041=EMP018 --park 00000019
//   3. Start the bridge:  Start-ScheduledTask -TaskName YeAlmaz-Attendance-Bridge-Reliable
//
// A dated backup is written first and the file is replaced atomically. Nothing is deleted.

const fs = require('node:fs');
const crypto = require('node:crypto');

const args = process.argv.slice(2);
const file = args.shift();
const parkAt = args.indexOf('--park');
const pairs = (parkAt === -1 ? args : args.slice(0, parkAt));
const parked = new Set(parkAt === -1 ? [] : args.slice(parkAt + 1));

if (!file || (!pairs.length && !parked.size) || pairs.some(p => !/^[^=\s]+=[^=\s]+$/.test(p))) {
  console.error('Usage: node requeue-review.js <reliable-state.json> <terminalNumber>=<EMPcode> [...] [--park <terminalNumber> ...]');
  process.exit(1);
}
const remap = Object.fromEntries(pairs.map(p => p.split('=')));

let state;
try { state = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { console.error('Cannot read the state file:', e.message); process.exit(1); }
if (state.version !== 2 || !Array.isArray(state.queue) || !Array.isArray(state.review) || !state.seen) {
  console.error('This is not a reliable-bridge state file (expected version 2 with queue, review and seen).');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `${file}.before-requeue-${stamp}`;
fs.copyFileSync(file, backup);

const markSeen = (code, timestamp) => { state.seen[`${code}|${new Date(timestamp).toISOString()}`] = Date.now(); };
let recoded = 0, parkedCount = 0, requeued = 0;

// 1) punches waiting in the queue
const queue = [];
for (const item of state.queue) {
  if (remap[item.employeeCode]) {
    const code = remap[item.employeeCode];
    queue.push({ ...item, employeeCode: code });
    markSeen(code, item.timestamp);
    recoded += 1;
  } else if (parked.has(item.employeeCode)) {
    state.review.push({ ...item, reason: 'Set aside: person not registered in Ye-Almaz' });
    parkedCount += 1;
  } else {
    queue.push(item);
  }
}

// 2) punches previously set aside for a person who now has a code
const review = [];
for (const item of state.review) {
  const code = remap[item.employeeCode];
  if (!code) { review.push(item); continue; }
  const { reason, ...rest } = item;
  queue.push({ ...rest, id: rest.id || crypto.randomUUID(), employeeCode: code });
  markSeen(code, rest.timestamp);
  requeued += 1;
}

state.queue = queue.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
state.review = review;

const tmp = `${file}.tmp`;
const fd = fs.openSync(tmp, 'w', 0o600);
try { fs.writeFileSync(fd, JSON.stringify(state)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
fs.renameSync(tmp, file);

console.log(`Queued punches given their code:     ${recoded}`);
console.log(`Queued punches set aside (parked):   ${parkedCount}`);
console.log(`Set-aside punches returned to queue: ${requeued}`);
console.log(`Now in queue: ${state.queue.length}   |   in review: ${state.review.length}`);
console.log(`Backup written to ${backup}`);
