/**
 * Ye-Almaz — Orders & Workflow Import (BULK)
 * Source: data-import/YADL Final.xlsx
 *
 * Fast path: createMany for cases → fetch ids → createMany payments + stages.
 * Idempotent by caseNumber (skipDuplicates). Blank scan nos get a synthetic
 * NOSCAN-##### number so revenue isn't lost and rows stay mappable.
 *
 * Clinic matching is two-tier so re-formatted names don't fragment the clinic
 * list: (1) exact name match, (2) token-set match (same significant words,
 * ignoring "Dr."/"Dental"/"Clinic", punctuation, parens vs dashes) against
 * clinics ALREADY in the DB. Only names matching neither become new clinics.
 *
 * Columns:
 *   0 Client Name  1 Scan No.  2 Product  3 NormStatus  4 Order Date
 *   5 Due Date  6 Delivery Date  7 Order Value  8 Payment Received
 *   9 Notes  10 unit  11 Remake  12 Remake Reason
 *
 * Usage: node scripts/import-workflow.js [--dry-run]
 */
require('dotenv').config();
const XLSX   = require('xlsx');
const bcrypt = require('bcryptjs');
const path   = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma  = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const FILE    = path.join(__dirname, '..', '..', 'data-import', 'YADL_Amended_Corrected.xlsx');
const BATCH   = 500;

const clean = s => String(s ?? '').replace(/[​-‍﻿‌]/g, '').trim();

// Same normalization as scripts/merge-clinic-variants.js, so a name that would
// later be auto-merged is instead matched to the existing clinic up front.
const STOP = new Set(['dental', 'clinic', 'dr', 'the', 'speciality', 'specialty']);
const tokenKey = (name) =>
  [...new Set(String(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(t => t && !STOP.has(t)))]
    .sort().join(' ');

function parseDate(str) {
  const s = clean(str);
  if (!s) return null;
  const [d, m, y] = s.split(/[\/\-.]/).map(Number);
  if (!d || !m || !y) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return isNaN(dt.getTime()) ? null : dt;
}

const STATUS_MAP = { 'DELIVERED': 'DELIVERED', 'IN PROGRESS': 'CASE_ACCEPTED', 'READY': 'READY_TO_DISPATCH' };
const PRODUCT_MAP = {
  'ZIRCONIA': 'Zirconia', 'PFM': 'PFM', 'DENTURE': 'Denture', 'RETAINER': 'Retainer',
  'NIGHT GUARD': 'Night Guard', 'VENEER': 'Veneer', 'COPING': 'Coping', 'ALIGNER': 'Aligner',
  'MOUTH GARD': 'Mouth Guard', 'MOUTH GUARD': 'Mouth Guard', 'EMAX': 'Emax',
  'TEMPORARY': 'Temporary', 'IMPLANT': 'Implant', 'METAL': 'Metal',
};
const titleCase = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const mapProduct = raw => PRODUCT_MAP[clean(raw).toUpperCase()] || titleCase(clean(raw)) || 'Lab Work';
const NOTE_FILLER = new Set(['PAID', 'UNPAID', 'PENDING', '']);

function loadRows() {
  const ws  = XLSX.readFile(FILE).Sheets['Orders & Workflow'];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).slice(1);
  const seen = new Set();
  const rows = [];
  let dupes = 0, noscan = 0;

  for (const r of raw) {
    const client = clean(r[0]);
    if (!client) continue;
    let scanNo = clean(r[1]);
    if (scanNo) {
      if (seen.has(scanNo)) { dupes++; continue; }
      seen.add(scanNo);
    } else {
      scanNo = `NOSCAN-${String(++noscan).padStart(5, '0')}`;
    }
    const orderValue = Number(r[7]) || 0;
    const received   = Number(r[8]) || 0;
    const noteRaw    = clean(r[9]);
    rows.push({
      client, caseNumber: scanNo,
      workType:     mapProduct(r[2]),
      status:       STATUS_MAP[clean(r[3]).toUpperCase()] || 'CASE_ACCEPTED',
      orderDate:    parseDate(r[4]),
      dueDate:      parseDate(r[5]),
      deliveryDate: parseDate(r[6]),
      orderValue,
      paid:         orderValue > 0 && received >= orderValue,
      // Partial payment: some money in, but short of the full order value.
      // Tracked separately so it isn't lost (as outstanding) or overstated (as revenue).
      partialReceived: (orderValue > 0 && received > 0 && received < orderValue) ? received : null,
      notes:        NOTE_FILLER.has(noteRaw.toUpperCase()) ? null : (noteRaw || null),
      units:        Number(r[10]) > 0 ? Number(r[10]) : null,
      remake:       clean(r[11]).toUpperCase() === 'YES',
      remakeReason: clean(r[12]) || null,
    });
  }
  return { rows, dupes, noscan };
}

const chunks = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

async function main() {
  console.log(`\n🦷  Orders & Workflow Import (BULK)  ${DRY_RUN ? '⚠️ DRY RUN' : '🟢 LIVE'}`);
  console.log('─'.repeat(56));

  const { rows, dupes, noscan } = loadRows();
  console.log(`📂  Rows: ${rows.length}  (skipped ${dupes} dup scan nos, ${noscan} blank→NOSCAN)`);

  // Clinic map — exact name match first, then token-set fuzzy match against
  // existing DB clinics, so re-formatted names (parens vs dash, "Dr." prefix,
  // extra spaces) attach to the SAME clinic instead of creating a duplicate.
  const dbClinics  = await prisma.clinic.findMany({ select: { id: true, name: true } });
  const clinicMap  = new Map(dbClinics.map(c => [clean(c.name).toLowerCase(), c.id]));       // exact
  const tokenMap   = new Map();                                                              // fuzzy
  for (const c of dbClinics) { const k = tokenKey(c.name); if (k && !tokenMap.has(k)) tokenMap.set(k, c.id); }

  const uniqueNames = [...new Set(rows.map(r => r.client))];
  const fuzzyMatched = [];
  for (const n of uniqueNames) {
    const lower = n.toLowerCase();
    if (clinicMap.has(lower)) continue;               // exact match already resolvable
    const k = tokenKey(n);
    if (k && tokenMap.has(k)) {
      clinicMap.set(lower, tokenMap.get(k));           // attach via fuzzy match
      fuzzyMatched.push(n);
    }
  }
  const missing = uniqueNames.filter(n => !clinicMap.has(n.toLowerCase()));
  console.log(`🏥  Clinics — exact: ${uniqueNames.length - fuzzyMatched.length - missing.length}, fuzzy-matched: ${fuzzyMatched.length}, new: ${missing.length}`);

  if (missing.length) {
    if (!DRY_RUN) {
      const pw = await bcrypt.hash('ImportPlaceholder@2026', 10);
      for (let i = 0; i < missing.length; i++) {
        const name = missing[i];
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
        try {
          const c = await prisma.clinic.create({ data: { name, email: `${slug}-${Date.now()}${i}@import.yealmaz.local`, password: pw, phone: 'N/A' } });
          clinicMap.set(name.toLowerCase(), c.id);
          tokenMap.set(tokenKey(name), c.id);          // so later rows in this same import fuzzy-match it too
        }
        catch (e) { console.warn(`  ⚠️ ${name}: ${e.message}`); }
      }
    }
  }

  // Skip caseNumbers already in DB
  const existing = new Set((await prisma.case.findMany({ select: { caseNumber: true } })).map(c => c.caseNumber));
  const todo = rows.filter(r => !existing.has(r.caseNumber));
  console.log(`📋  Already in DB: ${existing.size}  |  To import: ${todo.length}`);

  if (DRY_RUN) {
    const partialCount = todo.filter(r => r.partialReceived).length;
    console.log(`[dry-run] ${todo.filter(r=>r.paid).length} verified / ${todo.filter(r=>!r.paid).length} pending (${partialCount} partially paid)`);
    return prisma.$disconnect();
  }
  if (!todo.length) { console.log('✅ Nothing to import.'); return prisma.$disconnect(); }

  // 1) Bulk insert cases
  console.log(`\n📦  Inserting ${todo.length} cases…`);
  const caseData = todo.map(r => ({
    caseNumber: r.caseNumber, patientName: 'Imported Patient', workType: r.workType,
    units: r.units, notes: r.notes, remake: r.remake, remakeReason: r.remakeReason,
    status: r.status, paymentStatus: r.paid ? 'VERIFIED' : 'PENDING',
    totalAmount: r.orderValue > 0 ? r.orderValue : null,
    deliveryDate: r.deliveryDate, dueDate: r.dueDate,
    clinicId: clinicMap.get(r.client.toLowerCase()),
    createdAt: r.orderDate || r.deliveryDate || new Date(),
    updatedAt: r.orderDate || r.deliveryDate || new Date(),
  }));
  let ins = 0;
  for (const b of chunks(caseData, BATCH)) { await prisma.case.createMany({ data: b, skipDuplicates: true }); ins += b.length; process.stdout.write(`\r  cases ${ins}/${caseData.length}`); }

  // 2) Map caseNumber → id
  console.log('\n🔎  Fetching case ids…');
  const idMap = new Map();
  for (const b of chunks(todo.map(r => r.caseNumber), 1000)) {
    const found = await prisma.case.findMany({ where: { caseNumber: { in: b } }, select: { id: true, caseNumber: true } });
    found.forEach(c => idMap.set(c.caseNumber, c.id));
  }

  // 3) Bulk payments + stages
  const payments = [], stages = [];
  for (const r of todo) {
    const id = idMap.get(r.caseNumber); if (!id) continue;
    const when = r.deliveryDate || r.dueDate || r.orderDate || new Date();
    const amount = r.orderValue > 0 ? r.orderValue : null;
    if (r.paid) payments.push({ caseId: id, status: 'VERIFIED', amount, verifiedAt: when, invoiceNumber: `INV-${r.caseNumber}`, invoiceIssuedAt: when });
    else if (amount) payments.push({ caseId: id, status: 'PENDING', amount, amountReceived: r.partialReceived });
    stages.push({ caseId: id, stageName: r.status, scannedBy: 'Import', notes: 'Imported from Orders & Workflow sheet', scannedAt: when });
  }
  console.log(`💳  Inserting ${payments.length} payments…`);
  let pi = 0; for (const b of chunks(payments, BATCH)) { await prisma.payment.createMany({ data: b, skipDuplicates: true }); pi += b.length; process.stdout.write(`\r  payments ${pi}/${payments.length}`); }
  console.log(`\n🔖  Inserting ${stages.length} stages…`);
  let si = 0; for (const b of chunks(stages, BATCH)) { await prisma.caseStage.createMany({ data: b, skipDuplicates: true }); si += b.length; process.stdout.write(`\r  stages ${si}/${stages.length}`); }

  const total = await prisma.case.count();
  console.log(`\n\n🏁  Done — cases ${ins}, payments ${payments.length}, stages ${stages.length}, total in DB ${total}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error('\n❌', e); process.exit(1); });
