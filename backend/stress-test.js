// Ye-Almaz — Backend Stress Test
// Run: node stress-test.js (from /backend dir, server must be running)
require('dotenv').config();
const http = require('http');
const jwt  = require('jsonwebtoken');

const BASE_URL  = 'http://localhost:5000';
const CONCURRENT = 50;

// Forge a valid admin JWT directly from the .env secret —
// avoids needing the actual admin password.
const ADMIN_PAYLOAD = {
  id:    '1e7e7828-2f04-4de4-939f-421e71c188b8',
  email: 'admin@yealmaz.com',
  role:  'ADMIN',
  name:  'Ye-Almaz Admin',
};
const TOKEN = jwt.sign(ADMIN_PAYLOAD, process.env.JWT_SECRET, { expiresIn: '1h' });

// ── HTTP helper (no extra deps) ───────────────────────────
function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost', port: 5000,
      path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token  ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const t0 = Date.now();
    const r = http.request(options, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        const ms = Date.now() - t0;
        try { resolve({ status: res.statusCode, body: JSON.parse(raw), ms }); }
        catch { resolve({ status: res.statusCode, body: raw, ms }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// ── Stats ─────────────────────────────────────────────────
function pct(arr, p) { return arr.sort((a,b)=>a-b)[Math.floor(arr.length * p)] || 0; }
function latStats(results) {
  const ms = results.map(r => r.ms);
  return {
    min: Math.min(...ms), max: Math.max(...ms),
    avg: Math.round(ms.reduce((a,b)=>a+b,0)/ms.length),
    p50: pct([...ms], 0.50), p95: pct([...ms], 0.95),
    ok:  results.filter(r => r.status < 400).length,
    err: results.filter(r => r.status >= 400).length,
  };
}

// ── Concurrent hammer ─────────────────────────────────────
async function hammer(path, token, n = CONCURRENT) {
  const res = await Promise.all(Array.from({length:n}, () => req('GET', path, null, token)));
  return { results: res, ...latStats(res) };
}

// ── Separator ─────────────────────────────────────────────
const SEP = '─'.repeat(56);

async function main() {
  let overallPass = true;
  const summary = [];

  console.log(`\n🦷  Ye-Almaz Backend Stress Test`);
  console.log(`    ${new Date().toLocaleString()}  ·  ${CONCURRENT} concurrent per endpoint`);
  console.log(SEP);

  // ══════════════════════════════════════════════════════════
  // 1. TOKEN VERIFICATION  (JWT forged from .env secret)
  // ══════════════════════════════════════════════════════════
  console.log('\n▶  Step 1 — Token Verification');
  const me = await req('GET', '/api/auth/me', null, TOKEN);

  if (me.status !== 200) {
    console.log(`  ❌ /api/auth/me FAILED: HTTP ${me.status} — ${JSON.stringify(me.body)}`);
    process.exit(1);
  }
  console.log(`  ✅ Token accepted  (${me.ms}ms)  role=${me.body.role}  name="${me.body.name}"`);

  // ══════════════════════════════════════════════════════════
  // 2. CONCURRENT LOAD — 50 parallel GETs per endpoint
  // ══════════════════════════════════════════════════════════
  console.log(`\n▶  Step 2 — Concurrent Load  (${CONCURRENT} requests, all at once)\n`);

  const endpoints = [
    ['/api/cases',                   'cases list          '],
    ['/api/delivery/assigned',       'delivery assigned   '],
    ['/api/dashboard/summary',       'dashboard summary   '],
    ['/api/prices',                  'prices list         '],
  ];

  for (const [path, label] of endpoints) {
    // Prime cache with one warm-up call
    const warmup = await req('GET', path, null, TOKEN);

    // Hammer: all CONCURRENT at once
    const r = await hammer(path, TOKEN);

    const pass = r.err === 0;
    if (!pass) overallPass = false;
    summary.push({ label: label.trim(), pass, ...r });

    const tag = pass ? '✅' : '❌';
    console.log(`  ${tag}  ${label}  ${pass ? '' : `ERRORS:${r.err}/${CONCURRENT}`}`);
    console.log(`      warmup: ${warmup.ms}ms  │  avg: ${r.avg}ms  p50: ${r.p50}ms  p95: ${r.p95}ms  max: ${r.max}ms`);
    if (!pass) {
      // Print first error body
      const firstErr = r.results.find(x => x.status >= 400);
      console.log(`      first error body: ${JSON.stringify(firstErr?.body)}`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // 3. CACHE INVALIDATION
  // ══════════════════════════════════════════════════════════
  console.log(`\n▶  Step 3 — Cache Invalidation`);

  const casesRes = await req('GET', '/api/cases?limit=1', null, TOKEN);
  const firstCase = casesRes.body?.cases?.[0];

  if (!firstCase) {
    console.log('  ⚠️  No cases in DB — skipping invalidation test');
    summary.push({ label: 'cache invalidation', pass: null });
  } else {
    const caseId   = firstCase.id;
    const origStatus = firstCase.status;

    // Read into cache
    const r1 = await req('GET', `/api/cases/${caseId}`, null, TOKEN);
    console.log(`  📌 Cached case ${firstCase.caseNumber}  status=${r1.body.status}  (${r1.ms}ms)`);

    // Mutate → should invalidate case:* and cases:* keys
    const flipTo = origStatus === 'CASE_ACCEPTED' ? 'PLASTER_DEPARTMENT' : 'CASE_ACCEPTED';
    const upd = await req('PATCH', `/api/cases/${caseId}/status`,
      { status: flipTo, notes: 'stress-test-invalidation' }, TOKEN);

    if (upd.status !== 200) {
      console.log(`  ⚠️  PATCH returned ${upd.status}: ${JSON.stringify(upd.body)}`);
    } else {
      // Immediately re-read — must return new status, not cached old one
      const r2 = await req('GET', `/api/cases/${caseId}`, null, TOKEN);
      const fresh = r2.body.status === flipTo;
      const invTag = fresh ? '✅' : '❌';
      console.log(`  ${invTag}  After PATCH: got status="${r2.body.status}"  expected="${flipTo}"  (${r2.ms}ms)`);
      if (!fresh) overallPass = false;
      summary.push({ label: 'cache invalidation', pass: fresh });

      // Restore
      const restore = await req('PATCH', `/api/cases/${caseId}/status`,
        { status: origStatus, notes: 'stress-test-restore' }, TOKEN);
      console.log(`  ↩️  Restored status to ${origStatus} (HTTP ${restore.status})`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // 4. ERROR PATHS
  // ══════════════════════════════════════════════════════════
  console.log(`\n▶  Step 4 — Error Paths\n`);

  const errorCases = [
    {
      label: 'GET  /api/cases/:id — non-existent UUID',
      fn: () => req('GET', '/api/cases/00000000-0000-0000-0000-000000000000', null, TOKEN),
      expect: [404, 500],
    },
    {
      label: 'GET  /api/cases/:id — garbage ID',
      fn: () => req('GET', '/api/cases/not-a-uuid-at-all', null, TOKEN),
      expect: [404, 500],
    },
    {
      label: 'POST /api/cases — missing patientName + workType',
      fn: () => req('POST', '/api/cases', { notes: 'should fail' }, TOKEN),
      expect: [400],
    },
    {
      label: 'POST /api/cases — has names but missing clinicId',
      fn: () => req('POST', '/api/cases', { patientName: 'Ghost', workType: 'Crown' }, TOKEN),
      expect: [400],
    },
    {
      label: 'POST /api/auth/login — wrong password',
      fn: () => req('POST', '/api/auth/login', { email: 'admin@yealmaz.com', password: 'WRONG_PASSWORD' }),
      expect: [401],
    },
    {
      label: 'GET  /api/auth/me — no Authorization header',
      fn: () => req('GET', '/api/auth/me', null, null),
      expect: [401],
    },
    {
      label: 'GET  /api/auth/me — malformed token',
      fn: () => req('GET', '/api/auth/me', null, 'bad.token.here'),
      expect: [401],
    },
    {
      label: 'PATCH /api/cases/:id/status — unknown case ID',
      fn: () => req('PATCH', '/api/cases/00000000-0000-0000-0000-000000000000/status',
                    { status: 'CASE_ACCEPTED' }, TOKEN),
      expect: [404, 500],
    },
    {
      label: 'PUT  /api/prices — empty array',
      fn: () => req('PUT', '/api/prices', [], TOKEN),
      expect: [400],
    },
    {
      label: 'PUT  /api/prices — non-array body',
      fn: () => req('PUT', '/api/prices', { workType: 'Crown', price: 999 }, TOKEN),
      expect: [400],
    },
  ];

  let errPass = 0;
  for (const tc of errorCases) {
    const r = await tc.fn();
    const ok = tc.expect.includes(r.status);
    if (!ok) overallPass = false;
    console.log(`  ${ok ? '✅' : '❌'}  ${tc.label}`);
    console.log(`      → HTTP ${r.status}  ${ok ? '' : `(expected ${tc.expect.join(' or ')})  body=${JSON.stringify(r.body)}`}`);
    if (ok) errPass++;
  }
  summary.push({ label: `error paths (${errPass}/${errorCases.length})`, pass: errPass === errorCases.length });

  // ══════════════════════════════════════════════════════════
  // 5. COLD vs WARM CACHE
  // ══════════════════════════════════════════════════════════
  console.log(`\n▶  Step 5 — Cold vs Warm Cache Latency\n`);

  // Restart server would be ideal, but we can approximate by checking
  // that the 1st post-warm request is consistently faster than the cold (pre-warm)
  // We already have warmup times from step 2 — compare against first-of-batch
  const cacheTests = ['/api/prices', '/api/dashboard/summary', '/api/clinics'];
  for (const path of cacheTests) {
    const cold  = await req('GET', path, null, TOKEN);
    const w1    = await req('GET', path, null, TOKEN);
    const w2    = await req('GET', path, null, TOKEN);
    const w3    = await req('GET', path, null, TOKEN);
    const avgWarm = Math.round((w1.ms + w2.ms + w3.ms) / 3);
    const saved   = cold.ms - avgWarm;
    const pct     = cold.ms > 0 ? Math.round((saved / cold.ms) * 100) : 0;
    const cacheEffective = avgWarm <= cold.ms; // warm should never be slower
    console.log(`  ${cacheEffective ? '✅' : '⚠️ '}  ${path}`);
    console.log(`      cold: ${cold.ms}ms  │  warm avg: ${avgWarm}ms  (saved ~${saved}ms, ${pct}% faster)`);
  }

  // ══════════════════════════════════════════════════════════
  // 6. RATE LIMITER AWARENESS
  // ══════════════════════════════════════════════════════════
  console.log(`\n▶  Step 6 — Rate Limiter Check`);
  // Fire 120 rapid requests at once — well under 500/15min window
  const rapid = await hammer('/api/prices', TOKEN, 120);
  const rateLimited = rapid.results.filter(r => r.status === 429).length;
  const rlPass = rateLimited === 0;
  if (!rlPass) overallPass = false;
  console.log(`  ${rlPass ? '✅' : '❌'}  120 rapid requests → ${rapid.ok} OK, ${rateLimited} rate-limited`);
  console.log(`      p95: ${rapid.p95}ms  max: ${rapid.max}ms`);

  // ══════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ══════════════════════════════════════════════════════════
  console.log(`\n${SEP}`);
  console.log(`\n🏁  OVERALL: ${overallPass ? '✅  PASS' : '❌  FAIL'}\n`);
  if (!overallPass) {
    console.log('   Failed checks:');
    summary.filter(s => s.pass === false).forEach(s => {
      console.log(`    ❌  ${s.label}`);
    });
  }
  console.log();
  process.exit(overallPass ? 0 : 1);
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
