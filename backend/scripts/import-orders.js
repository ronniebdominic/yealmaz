/**
 * Ye-Almaz — Order Import Script
 * Imports order-sales-report-2026-05-23.xlsx into the DB
 *
 * Mapping:
 *   Order/Case No  → caseNumber (INV-XXXXXXXXXX)
 *   Order Date     → createdAt
 *   Due Date       → dueDate
 *   Client         → clinic (matched or created)
 *   Patient Name   → patientName
 *   Challan        → paymentStatus (Genrated → VERIFIED, Pending → PENDING)
 *   Tooth          → toothNumbers
 *   Note           → notes
 *   Order Value    → totalAmount + payment.amount
 *   Units          → stored in notes prefix
 *   Status         → DELIVERED (all historical)
 *   Work Type      → "Lab Work" (not in spreadsheet)
 */

const XLSX    = require('xlsx');
const bcrypt  = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const p    = new PrismaClient();
const FILE = 'C:/yealmaz/data-import/order-sales-report-2026-05-23.xlsx';

// Strip zero-width / invisible unicode chars
const clean = (s) => String(s || '').replace(/[​-‍﻿‌]/g, '').trim();

// Parse DD-MM-YYYY → Date (returns null if invalid)
function parseDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  const [d, m, y] = str.split('-');
  if (!d || !m || !y) return null;
  const dt = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T00:00:00.000Z`);
  return isNaN(dt.getTime()) ? null : dt;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Ye-Almaz Order Import');
  console.log('═══════════════════════════════════════');

  // ── 1. Read spreadsheet ──────────────────────────────
  const wb  = XLSX.readFile(FILE);
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const rows = raw.slice(1)     // first row is the real header
    .map(r => ({
      caseNo:    clean(r['__EMPTY']),
      orderDate: clean(r['__EMPTY_2']),
      dueDate:   clean(r['__EMPTY_3']),
      clinic:    clean(r['__EMPTY_4']),
      patient:   clean(r['__EMPTY_5']),
      challan:   clean(r['__EMPTY_6']),
      units:     clean(r['__EMPTY_7']),
      tooth:     clean(r['__EMPTY_8']),
      note:      clean(r['__EMPTY_9']),
      amount:    Number(r['__EMPTY_10']) || 0,
    }))
    .filter(r => {
      // Skip blank or non-numeric case numbers
      if (!r.caseNo || isNaN(Number(r.caseNo))) return false;
      // Skip test / placeholder patient names
      const lp = r.patient.toLowerCase();
      if (!r.patient || lp === 'yealmaz' || lp === 'ye almaz' || lp.startsWith('ye-almaz') || lp.startsWith('yealmaz')) return false;
      return true;
    });

  console.log(`Rows to import: ${rows.length}`);

  // ── 2. Load / build clinic map ───────────────────────
  console.log('\nLoading clinics from DB…');
  const dbClinics = await p.clinic.findMany({ select: { id: true, name: true } });
  const clinicMap = new Map();   // cleanName.toLowerCase() → id

  dbClinics.forEach(c => clinicMap.set(clean(c.name).toLowerCase(), c.id));

  // Find which sheet clinics are missing
  const sheetClinicNames = [...new Set(rows.map(r => r.clinic))];
  const missing = sheetClinicNames.filter(n => !clinicMap.has(n.toLowerCase()));

  if (missing.length) {
    console.log(`Creating ${missing.length} new clinics…`);
    const dummyPassword = await bcrypt.hash('Clinic@YeAlmaz2025', 10);
    const nextIndex = dbClinics.length;
    for (let i = 0; i < missing.length; i++) {
      const name  = missing[i];
      const slug  = name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40);
      const email = `clinic_import_${slug}_${nextIndex + i}@yealmaz.com`;
      const clinic = await p.clinic.create({
        data: { name, email, phone: '+251900000000', password: dummyPassword }
      });
      clinicMap.set(name.toLowerCase(), clinic.id);
      console.log(`  Created: ${name}`);
    }
  } else {
    console.log('All clinics already in DB ✓');
  }

  // ── 3. Find existing case numbers to skip duplicates ─
  console.log('\nChecking for existing case numbers…');
  const existing = await p.case.findMany({ select: { caseNumber: true } });
  const existingSet = new Set(existing.map(c => c.caseNumber));
  const toInsert = rows.filter(r => !existingSet.has(`INV-${r.caseNo}`));
  const skipped  = rows.length - toInsert.length;
  if (skipped) console.log(`  Skipping ${skipped} already-imported rows`);
  console.log(`  Cases to create: ${toInsert.length}`);

  // ── 4. Batch import ──────────────────────────────────
  const BATCH = 200;
  let created = 0, failed = 0, payCreated = 0;
  const now   = new Date();

  console.log(`\nImporting in batches of ${BATCH}…`);

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);

    try {
      await p.$transaction(
        batch.map(r => {
          const clinicId    = clinicMap.get(r.clinic.toLowerCase());
          const caseNumber  = `INV-${r.caseNo}`;
          const orderDate   = parseDate(r.orderDate) || now;
          const dueDateVal  = parseDate(r.dueDate);
          const payStatus   = r.challan === 'Genrated' ? 'VERIFIED' : 'PENDING';
          const amount      = r.amount > 0 ? r.amount : null;

          // Build notes string (include units if present)
          let notes = r.note || null;
          if (r.units && r.units !== '' && r.units !== '0') {
            notes = `Units: ${r.units}${notes ? ' | ' + notes : ''}`;
          }

          return p.case.create({
            data: {
              caseNumber,
              patientName:   r.patient,
              workType:      'Lab Work',
              toothNumbers:  r.tooth || null,
              notes,
              dueDate:       dueDateVal,
              status:        'DELIVERED',
              paymentStatus: payStatus,
              totalAmount:   amount,
              clinicId:      clinicId || dbClinics[0].id,  // fallback (shouldn't happen)
              createdAt:     orderDate,
              updatedAt:     orderDate,
              // Seed a stage entry so timeline is not empty
              stages: {
                create: {
                  stageName: 'DELIVERED',
                  scannedAt: dueDateVal || orderDate,
                  scannedBy: 'Import',
                  notes:     'Imported from historical sales report',
                }
              },
              // Create payment record if challan was generated and there's an amount
              ...(payStatus === 'VERIFIED' && amount ? {
                payment: {
                  create: {
                    status:     'VERIFIED',
                    amount,
                    verifiedAt: dueDateVal || orderDate,
                  }
                }
              } : {}),
            }
          });
        }),
        { timeout: 30_000 }
      );
      created += batch.length;
    } catch (err) {
      // On batch failure try rows individually so one bad row doesn't block the batch
      for (const r of batch) {
        try {
          const clinicId   = clinicMap.get(r.clinic.toLowerCase());
          const caseNumber = `INV-${r.caseNo}`;
          if (existingSet.has(caseNumber)) continue;

          const orderDate  = parseDate(r.orderDate) || now;
          const dueDateVal = parseDate(r.dueDate);
          const payStatus  = r.challan === 'Genrated' ? 'VERIFIED' : 'PENDING';
          const amount     = r.amount > 0 ? r.amount : null;
          let notes        = r.note || null;
          if (r.units && r.units !== '' && r.units !== '0') {
            notes = `Units: ${r.units}${notes ? ' | ' + notes : ''}`;
          }

          await p.case.create({
            data: {
              caseNumber,
              patientName:   r.patient,
              workType:      'Lab Work',
              toothNumbers:  r.tooth || null,
              notes,
              dueDate:       dueDateVal,
              status:        'DELIVERED',
              paymentStatus: payStatus,
              totalAmount:   amount,
              clinicId:      clinicId || dbClinics[0].id,
              createdAt:     orderDate,
              updatedAt:     orderDate,
              stages: {
                create: {
                  stageName: 'DELIVERED',
                  scannedAt: dueDateVal || orderDate,
                  scannedBy: 'Import',
                  notes:     'Imported from historical sales report',
                }
              },
              ...(payStatus === 'VERIFIED' && amount ? {
                payment: { create: { status: 'VERIFIED', amount, verifiedAt: dueDateVal || orderDate } }
              } : {}),
            }
          });
          created++;
        } catch (rowErr) {
          failed++;
          console.error(`  Failed row INV-${r.caseNo}:`, rowErr.message);
        }
      }
    }

    process.stdout.write(`\r  Progress: ${Math.min(i + BATCH, toInsert.length)} / ${toInsert.length}`);
  }

  // ── 5. Summary ───────────────────────────────────────
  const total = await p.case.count();
  console.log('\n');
  console.log('═══════════════════════════════════════');
  console.log('  Import Complete');
  console.log('═══════════════════════════════════════');
  console.log(`  Rows processed : ${rows.length}`);
  console.log(`  Cases created  : ${created}`);
  console.log(`  Skipped (dup)  : ${skipped}`);
  console.log(`  Failed         : ${failed}`);
  console.log(`  Total in DB    : ${total}`);
  console.log('═══════════════════════════════════════');

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
