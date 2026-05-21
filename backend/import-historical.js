// Ye-Almaz — Historical Data Importer
// Reads both Excel order-sales-report files and inserts into the DB.
// Safe to re-run: skips invoice numbers that already exist.
// Usage: node import-historical.js [--dry-run]
//
require('dotenv').config();
const XLSX    = require('xlsx');
const bcrypt  = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const path    = require('path');

const prisma   = new PrismaClient();
const DRY_RUN  = process.argv.includes('--dry-run');
const BATCH    = 100;  // records per createMany call
const DATA_DIR = path.join(__dirname, '..', 'data-import');

const FILES = [
  'order-sales-report-2026-05-18.xlsx',
  'order-sales-report-2026-05-18 (1).xlsx',
];

// ── Helpers ───────────────────────────────────────────────
const clean = s => String(s ?? '').replace(/[​-‍﻿‌]/g, '').trim();

function parseDate(str) {
  // Expect DD/MM/YYYY
  if (!str) return null;
  const parts = String(str).split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function slugEmail(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) + '@import.yealmaz.local';
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Load Excel data ───────────────────────────────────────
function loadRows() {
  const rows = [];
  for (const file of FILES) {
    const wb   = XLSX.readFile(path.join(DATA_DIR, file));
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const raw  = XLSX.utils.sheet_to_json(ws, { header: 1 });
    // row[0] = title, row[1] = headers, row[2..] = data
    for (let i = 2; i < raw.length; i++) {
      const r = raw[i];
      const client  = clean(r[1]);
      const invoice = clean(r[2]);
      if (!client || !invoice) continue;  // skip totals / blank rows
      rows.push({
        client,
        invoice,
        dateStr:  clean(r[3]),
        units:    typeof r[4] === 'number' ? r[4] : null,
        teeth:    clean(r[5]),
        amount:   typeof r[6] === 'number' && r[6] > 0 ? r[6] : null,
      });
    }
  }
  return rows;
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  console.log(`\n🦷  Ye-Almaz Historical Data Importer`);
  console.log(`    ${DRY_RUN ? '⚠️  DRY RUN — no DB writes' : '🟢  LIVE MODE'}`);
  console.log('─'.repeat(56));

  // 1. Load rows
  const rows = loadRows();
  console.log(`\n📂  Loaded ${rows.length} valid rows from ${FILES.length} files`);

  // 2. Check which invoice numbers already exist
  const existingCases = await prisma.case.findMany({
    where: { caseNumber: { in: rows.map(r => r.invoice) } },
    select: { caseNumber: true },
  });
  const existingNums = new Set(existingCases.map(c => c.caseNumber));
  const newRows = rows.filter(r => !existingNums.has(r.invoice));
  console.log(`📋  Already in DB: ${existingNums.size}  |  To import: ${newRows.length}`);

  if (newRows.length === 0) {
    console.log('\n✅  Nothing new to import.\n');
    return;
  }

  // 3. Build clinic map (existing DB clinics, by normalised name)
  const allDbClinics = await prisma.clinic.findMany({
    select: { id: true, name: true },
  });
  const clinicMap = new Map(); // normalisedName → id
  for (const c of allDbClinics) {
    clinicMap.set(c.name.toLowerCase().trim(), c.id);
  }
  console.log(`🏥  DB clinics loaded: ${allDbClinics.length}`);

  // 4. Find clinics in import not yet in DB
  const uniqueNames = [...new Set(newRows.map(r => r.client))];
  const missingNames = uniqueNames.filter(n => !clinicMap.has(n.toLowerCase()));
  console.log(`🏥  New clinics to create: ${missingNames.length}`);

  if (missingNames.length > 0) {
    const placeholder = await bcrypt.hash('ImportPlaceholder@2024', 10);
    const emailCount  = new Map();

    const clinicData = missingNames.map(name => {
      let email = slugEmail(name);
      // Deduplicate emails
      const count = emailCount.get(email) || 0;
      emailCount.set(email, count + 1);
      if (count > 0) email = email.replace('@', `${count}@`);
      return { name, email, password: placeholder, phone: 'N/A', isActive: true };
    });

    if (!DRY_RUN) {
      // Create one by one to handle any email collisions gracefully
      let created = 0;
      for (const cd of clinicData) {
        try {
          const c = await prisma.clinic.create({ data: cd });
          clinicMap.set(cd.name.toLowerCase(), c.id);
          created++;
        } catch (err) {
          // If email already exists (shouldn't happen), try with suffix
          try {
            const fallbackEmail = `${Date.now()}-${Math.random().toString(36).slice(2,6)}@import.yealmaz.local`;
            const c = await prisma.clinic.create({ data: { ...cd, email: fallbackEmail } });
            clinicMap.set(cd.name.toLowerCase(), c.id);
            created++;
          } catch (err2) {
            console.warn(`  ⚠️  Could not create clinic "${cd.name}": ${err2.message}`);
          }
        }
      }
      console.log(`  ✅  Created ${created} new clinic records`);
    } else {
      console.log(`  [dry-run] Would create ${clinicData.length} clinics`);
      clinicData.forEach(c => clinicMap.set(c.name.toLowerCase(), `DRY-${c.name.slice(0,8)}`));
    }
  }

  // 5. Build case records
  const caseRecords = [];
  const skipped = [];

  for (const r of newRows) {
    const clinicId = clinicMap.get(r.client.toLowerCase());
    if (!clinicId) {
      skipped.push(r.invoice);
      continue;
    }
    const invoiceDate = parseDate(r.dateStr) || new Date('2025-01-01');
    caseRecords.push({
      caseNumber:    r.invoice,
      patientName:   'Historical Patient',
      workType:      'Zirconia Crown',
      toothNumbers:  r.teeth || null,
      totalAmount:   r.amount,
      status:        'DELIVERED',
      paymentStatus: r.amount ? 'VERIFIED' : 'PENDING',
      deliveryType:  'NORMAL',
      clinicId,
      dueDate:       invoiceDate,
      createdAt:     invoiceDate,
      updatedAt:     invoiceDate,
    });
  }

  if (skipped.length) console.log(`⚠️  Skipped ${skipped.length} rows (clinic not resolved)`);
  console.log(`\n📦  Inserting ${caseRecords.length} cases in batches of ${BATCH}…`);

  let casesInserted = 0;
  const caseIdMap   = new Map(); // caseNumber → id

  if (!DRY_RUN) {
    for (const batch of chunks(caseRecords, BATCH)) {
      await prisma.case.createMany({ data: batch, skipDuplicates: true });
      casesInserted += batch.length;
      process.stdout.write(`\r  Progress: ${casesInserted}/${caseRecords.length}`);
    }

    // Fetch all newly created case IDs
    const created = await prisma.case.findMany({
      where:  { caseNumber: { in: caseRecords.map(c => c.caseNumber) } },
      select: { id: true, caseNumber: true, totalAmount: true, status: true, createdAt: true },
    });
    for (const c of created) caseIdMap.set(c.caseNumber, c);
    console.log(`\n  ✅  Cases inserted: ${caseIdMap.size}`);
  } else {
    console.log(`  [dry-run] Would insert ${caseRecords.length} cases`);
  }

  // 6. Build payment records
  console.log(`\n💳  Inserting payment records…`);
  const paymentRecords = [];
  for (const r of caseRecords) {
    const c = caseIdMap.get(r.caseNumber);
    if (!c && !DRY_RUN) continue;
    const caseId = c?.id ?? `DRY-${r.caseNumber}`;
    paymentRecords.push({
      caseId,
      status:       r.amount ? 'VERIFIED' : 'PENDING',
      amount:       r.amount ?? null,
      invoiceNumber: r.caseNumber,
      verifiedAt:   r.amount ? r.dueDate ?? new Date() : null,
      invoiceIssuedAt: r.dueDate ?? new Date(),
    });
  }

  if (!DRY_RUN && paymentRecords.length > 0) {
    let payInserted = 0;
    for (const batch of chunks(paymentRecords, BATCH)) {
      await prisma.payment.createMany({ data: batch, skipDuplicates: true });
      payInserted += batch.length;
      process.stdout.write(`\r  Progress: ${payInserted}/${paymentRecords.length}`);
    }
    console.log(`\n  ✅  Payments inserted: ${payInserted}`);
  } else {
    console.log(`  [dry-run] Would insert ${paymentRecords.length} payment records`);
  }

  // 7. Build case stage records
  console.log(`\n🔖  Inserting case stage records…`);
  const stageRecords = [];
  for (const r of caseRecords) {
    const c = caseIdMap.get(r.caseNumber);
    if (!c && !DRY_RUN) continue;
    const caseId = c?.id ?? `DRY-${r.caseNumber}`;
    stageRecords.push({
      caseId,
      stageName:  'DELIVERED',
      scannedBy:  'Data Import',
      notes:      'Imported from historical records',
      scannedAt:  r.dueDate ?? new Date(),
    });
  }

  if (!DRY_RUN && stageRecords.length > 0) {
    let stageInserted = 0;
    for (const batch of chunks(stageRecords, BATCH)) {
      await prisma.caseStage.createMany({ data: batch, skipDuplicates: true });
      stageInserted += batch.length;
      process.stdout.write(`\r  Progress: ${stageInserted}/${stageRecords.length}`);
    }
    console.log(`\n  ✅  Stages inserted: ${stageInserted}`);
  } else {
    console.log(`  [dry-run] Would insert ${stageRecords.length} stage records`);
  }

  // 8. Summary
  console.log('\n' + '─'.repeat(56));
  console.log(`\n🏁  Import complete!`);
  if (!DRY_RUN) {
    console.log(`    Cases   : ${caseIdMap.size}`);
    console.log(`    Payments: ${paymentRecords.length}`);
    console.log(`    Stages  : ${stageRecords.length}`);
    console.log(`    Skipped : ${existingNums.size} already existed`);
  }
  console.log();
}

main()
  .catch(err => { console.error('\n❌ Fatal:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
