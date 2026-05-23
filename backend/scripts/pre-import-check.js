const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const wb = XLSX.readFile('C:/yealmaz/data-import/order-sales-report-2026-05-23.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const rows = raw.slice(1).map(r => ({
    caseNo:    String(r['__EMPTY']).trim(),
    orderDate: r['__EMPTY_2'],
    dueDate:   r['__EMPTY_3'],
    clinic:    String(r['__EMPTY_4']).replace(/[​-‍﻿‌]/g, '').trim(),
    patient:   String(r['__EMPTY_5']).replace(/[​-‍﻿‌]/g, '').trim(),
    challan:   String(r['__EMPTY_6']).trim(),
    units:     r['__EMPTY_7'],
    tooth:     String(r['__EMPTY_8']).replace(/[​-‍﻿‌]/g, '').trim(),
    note:      String(r['__EMPTY_9']).trim(),
    amount:    r['__EMPTY_10'],
  })).filter(r => r.caseNo && r.caseNo !== '' && !isNaN(Number(r.caseNo)));

  console.log('Valid data rows:', rows.length);

  // Challan split
  const pending  = rows.filter(r => r.challan === 'Pending').length;
  const generated= rows.filter(r => r.challan === 'Genrated').length;
  console.log('Challan Pending:', pending, '/ Genrated:', generated);

  // Rows with no patient name or test patient
  const noPatient = rows.filter(r => !r.patient || r.patient.toLowerCase().includes('yealmaz') || r.patient.toLowerCase().includes('ye almaz'));
  console.log('Rows with no/test patient name:', noPatient.length);

  // Amount range
  const amounts = rows.map(r => Number(r.amount)).filter(a => a > 0);
  console.log('Rows with amount > 0:', amounts.length);
  console.log('Total order value:', amounts.reduce((s,a) => s+a, 0).toLocaleString('en-US'));

  // Check how many sheet clinics are already in DB
  const dbClinics = await p.clinic.findMany({ select: { name: true } });
  const dbNames = new Set(dbClinics.map(c => c.name.replace(/[​-‍﻿‌]/g, '').trim().toLowerCase()));
  const sheetClinics = [...new Set(rows.map(r => r.clinic))];
  const missing = sheetClinics.filter(n => !dbNames.has(n.toLowerCase()));
  console.log('Sheet clinics NOT in DB:', missing.length);
  if (missing.length) missing.forEach(m => console.log(' Missing:', m));

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
