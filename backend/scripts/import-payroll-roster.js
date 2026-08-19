// Ye-Almaz — Import the payroll roster into HR
//
// Source: the monthly payroll workbook ("Admin staff" + "Lab staff"
// sheets). Two jobs:
//   1. Create the office/admin staff who exist on payroll but were never in
//      the system at all — without them the biometric terminal cannot track
//      anyone outside the lab floor.
//   2. Merge position and base salary onto everyone already present, whose
//      EmployeeProfile records were nearly empty.
//
// SAFE TO RE-RUN. Dry run unless --apply. Never overwrites a value that is
// already set, never creates a user who matches an existing one, and never
// deactivates anyone missing from the sheet (someone hired after the sheet
// was cut is absent from it but very much still employed).
//
// Usage:
//   node scripts/import-payroll-roster.js "path/to/payroll.xlsx"
//   node scripts/import-payroll-roster.js "path/to/payroll.xlsx" --apply
require('dotenv').config();
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;

const crypto = require('crypto');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const FILE = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;

// Position -> Role. Deliberately conservative: nobody is given ADMIN by
// inference from a job title, and nobody outside the lab/delivery floor is
// given LAB_TECH or DELIVERY, because computeLabPerformance and
// computeDeliveryPerformance enumerate users by exactly those roles — a
// janitor labelled LAB_TECH would show up forever in lab performance
// reports as a technician with zero scans.
//
// Everyone created here gets a cryptographically random password that is
// never printed or stored anywhere retrievable, so these are HR/attendance
// records rather than usable logins. If someone genuinely needs access
// later, HR resets the password via Admin > Users AND should set a role
// that actually matches what they are allowed to do.
function roleFor(position) {
  const p = (position || '').toLowerCase();
  if (/finance|account/.test(p)) return 'FINANCE';
  return 'RECEPTIONIST';
}

function normTokens(s) {
  return String(s).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}

// Payroll spellings drift from the system's ("Jonson Naser Muhammed" vs
// "Jonser Naser Mohammed", "Redeat Assfaw" vs "Rediet Asfaw"), so matching
// is on a 3-character stem per name token rather than exact equality.
function similarity(a, b) {
  const A = normTokens(a), B = normTokens(b);
  let hits = 0;
  for (const x of A) {
    if (B.some(y => y === x || (x.length > 2 && y.length > 2 && (y.startsWith(x.slice(0, 3)) || x.startsWith(y.slice(0, 3)))))) hits++;
  }
  return hits / Math.max(A.length, B.length);
}

function readRoster(file) {
  const wb = XLSX.readFile(file);
  const pick = (want) => wb.SheetNames.find(n => n.toLowerCase().replace(/\s+/g, '') === want);
  const specs = [
    { sheet: pick('adminstaff'), start: 7, nameCol: 1, posCol: 2, salaryCol: 3, group: 'OFFICE' },
    { sheet: pick('labstaff'), start: 6, nameCol: 3, posCol: 4, salaryCol: 5, group: 'LAB' },
  ];
  const out = [];
  for (const s of specs) {
    if (!s.sheet) throw new Error(`Could not find the ${s.group} sheet in this workbook.`);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[s.sheet], { header: 1, defval: null });
    for (let i = s.start; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const name = r[s.nameCol];
      if (typeof name !== 'string' || !name.trim()) continue;
      if (/^(total|s\.?n)/i.test(name.trim())) continue;
      const salary = Number(r[s.salaryCol]);
      out.push({
        name: name.replace(/\s+/g, ' ').trim(),
        position: typeof r[s.posCol] === 'string' ? r[s.posCol].replace(/\s+/g, ' ').trim() || null : null,
        baseSalary: Number.isFinite(salary) && salary > 0 ? Math.round(salary * 100) / 100 : null,
        group: s.group,
      });
    }
  }
  return out;
}

async function main() {
  if (!FILE) throw new Error('Pass the payroll workbook path as the first argument.');
  const roster = readRoster(FILE);

  const users = await prisma.user.findMany({
    where: { isActive: true, isSharedAccount: false },
    select: { id: true, name: true, role: true, email: true, employeeProfile: { select: { id: true, employeeCode: true, position: true, baseSalary: true } } },
  });
  const existingEmails = new Set(users.map(u => u.email.toLowerCase()));
  const allProfiles = await prisma.employeeProfile.findMany({ where: { employeeCode: { not: null } }, select: { employeeCode: true } });
  const takenCodes = new Set(allProfiles.map(p => p.employeeCode));

  let seq = 1;
  const nextCode = () => {
    while (takenCodes.has(`EMP${String(seq).padStart(3, '0')}`)) seq++;
    const c = `EMP${String(seq).padStart(3, '0')}`;
    takenCodes.add(c);
    return c;
  };

  const emailFor = (name) => {
    const t = normTokens(name);
    const candidates = [t[0], `${t[0]}.${t[t.length - 1]}`, `${t[0]}.${t[1] || 'x'}.${t[t.length - 1]}`];
    for (const c of candidates) {
      const e = `${c}@yealmaz.com`;
      if (!existingEmails.has(e)) { existingEmails.add(e); return e; }
    }
    const e = `${t[0]}.${crypto.randomBytes(2).toString('hex')}@yealmaz.com`;
    existingEmails.add(e);
    return e;
  };

  const matchedIds = new Set();
  const updates = [], creates = [];

  for (const row of roster) {
    let best = null, score = 0;
    for (const u of users) {
      if (matchedIds.has(u.id)) continue;
      const s = similarity(row.name, u.name);
      if (s > score) { score = s; best = u; }
    }

    if (best && score >= 0.6) {
      matchedIds.add(best.id);
      const prof = best.employeeProfile;
      // Only fill blanks — never clobber something HR already entered.
      const setPos = row.position && !prof?.position;
      const setSal = row.baseSalary != null && (prof?.baseSalary == null);
      if (setPos || setSal) {
        updates.push({
          userId: best.id, profileId: prof?.id || null, name: best.name, sheetName: row.name,
          position: setPos ? row.position : null, baseSalary: setSal ? row.baseSalary : null, score,
        });
      }
    } else {
      creates.push({ ...row, role: roleFor(row.position), code: nextCode(), email: emailFor(row.name) });
    }
  }

  const missingFromSheet = users.filter(u => !matchedIds.has(u.id));

  console.log(`Payroll rows:      ${roster.length}`);
  console.log(`Matched existing:  ${matchedIds.size}`);
  console.log(`To create:         ${creates.length}`);
  console.log(`To enrich:         ${updates.length}\n`);

  if (creates.length) {
    console.log('=== CREATE (new user + profile + code) ===');
    for (const c of creates) {
      console.log(`  ${c.code}  ${c.name.padEnd(28)} ${String(c.position || '').padEnd(24)} ${c.role.padEnd(12)} ${c.email}`);
    }
    console.log('');
  }
  if (updates.length) {
    console.log('=== ENRICH (position / salary onto existing) ===');
    for (const u of updates) {
      const bits = [u.position ? `position="${u.position}"` : null, u.baseSalary != null ? `baseSalary=${u.baseSalary}` : null].filter(Boolean).join(' ');
      console.log(`  ${u.name.padEnd(28)} ${bits}${u.score < 1 ? `   (matched "${u.sheetName}")` : ''}`);
    }
    console.log('');
  }
  if (missingFromSheet.length) {
    console.log('=== IN SYSTEM, NOT ON THIS SHEET (left untouched) ===');
    missingFromSheet.forEach(u => console.log(`  ${u.name} [${u.role}] ${u.employeeProfile?.employeeCode || ''}`));
    console.log('');
  }

  if (!APPLY) {
    console.log('DRY RUN — nothing written. Re-run with --apply to commit.');
    return;
  }

  const ops = [];
  for (const u of updates) {
    const data = {};
    if (u.position) data.position = u.position;
    if (u.baseSalary != null) data.baseSalary = u.baseSalary;
    ops.push(u.profileId
      ? prisma.employeeProfile.update({ where: { id: u.profileId }, data })
      : prisma.employeeProfile.create({ data: { userId: u.userId, employmentStatus: 'ACTIVE', ...data } }));
  }
  for (const c of creates) {
    // 32 random bytes, hashed immediately and never surfaced — these are
    // attendance/HR records, not accounts anyone is meant to sign in to.
    const hashed = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
    ops.push(prisma.user.create({
      data: {
        name: c.name, email: c.email, password: hashed, role: c.role, isActive: true, isSharedAccount: false,
        employeeProfile: {
          create: {
            employeeCode: c.code, employmentStatus: 'ACTIVE',
            position: c.position || null, baseSalary: c.baseSalary ?? null,
          },
        },
      },
    }));
  }

  await prisma.$transaction(ops);
  console.log(`Applied. ${creates.length} created, ${updates.length} enriched.`);
}

main()
  .catch(e => { console.error('FAILED:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
