/**
 * Ye-Almaz — HR Phase 1 seed data
 * - One default Shift (standard 09:00-18:00 working day), assigned to every
 *   active, non-shared employee who doesn't already have an open shift
 *   assignment.
 * - The standard LeaveType roster (Annual/Sick/Casual/Emergency/Unpaid/
 *   Maternity/Paternity/CompensatoryOff), matching the user's Phase 1 spec.
 *
 * Idempotent — safe to re-run (skips anything that already exists).
 * Usage: node scripts/seed-hr-phase1.js [--dry-run]
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const LEAVE_TYPES = [
  { name: 'Annual',            defaultAnnualDays: 18, isPaid: true  },
  { name: 'Sick',               defaultAnnualDays: 10, isPaid: true  },
  { name: 'Casual',             defaultAnnualDays: 5,  isPaid: true  },
  { name: 'Emergency',          defaultAnnualDays: 3,  isPaid: true  },
  { name: 'Unpaid',             defaultAnnualDays: null, isPaid: false },
  { name: 'Maternity',          defaultAnnualDays: 90, isPaid: true  },
  { name: 'Paternity',          defaultAnnualDays: 10, isPaid: true  },
  { name: 'Compensatory Off',   defaultAnnualDays: null, isPaid: true  },
];

const DEFAULT_SHIFT = {
  name: 'Standard Day Shift',
  startTime: '09:00',
  endTime: '18:00',
  breakMinutes: 60,
  gracePeriodMinutes: 10,
  lateThresholdMinutes: 0,
  earlyDepartureThresholdMinutes: 0,
  overtimeThresholdMinutes: null, // derive from (end - start - break) = 8h
  workingDays: [1, 2, 3, 4, 5, 6], // Mon-Sat — this lab operates 6 days/week
  holidayHandling: 'NO_WORK',
};

async function main() {
  console.log(`\n🌱  HR Phase 1 seed  ${DRY_RUN ? '⚠️ DRY RUN' : '🟢 LIVE'}`);
  console.log('─'.repeat(56));

  // Leave types
  let typesCreated = 0;
  for (const t of LEAVE_TYPES) {
    const existing = await prisma.leaveType.findUnique({ where: { name: t.name } });
    if (existing) { console.log(`  ⚠  Leave type already exists: ${t.name}`); continue; }
    console.log(`  + Leave type: ${t.name} (${t.defaultAnnualDays ?? '—'} days/yr)`);
    if (!DRY_RUN) await prisma.leaveType.create({ data: t });
    typesCreated++;
  }

  // Default shift — created by the HR_MANAGER/ADMIN account if one exists,
  // else the first ADMIN found (createdById is required on ShiftAssignment).
  const creator = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } });
  if (!creator) { console.log('\n❌ No ADMIN user found — cannot set createdById on shift assignments. Aborting.'); return; }

  let shift = await prisma.shift.findFirst({ where: { name: DEFAULT_SHIFT.name } });
  if (!shift) {
    console.log(`\n  + Shift: ${DEFAULT_SHIFT.name}`);
    if (!DRY_RUN) shift = await prisma.shift.create({ data: DEFAULT_SHIFT });
  } else {
    console.log(`\n  ⚠  Shift already exists: ${DEFAULT_SHIFT.name}`);
  }

  // Assign to every active, non-shared employee without an open assignment.
  const employees = await prisma.user.findMany({ where: { isSharedAccount: false, isActive: true } });
  let assigned = 0;
  for (const emp of employees) {
    const open = await prisma.shiftAssignment.findFirst({ where: { userId: emp.id, effectiveTo: null } });
    if (open) continue;
    console.log(`  + Assign "${DEFAULT_SHIFT.name}" → ${emp.name}`);
    if (!DRY_RUN && shift) {
      await prisma.shiftAssignment.create({
        data: { userId: emp.id, shiftId: shift.id, effectiveFrom: new Date(), createdById: creator.id },
      });
    }
    assigned++;
  }

  console.log(`\n🏁  ${DRY_RUN ? 'Would create' : 'Created'} ${typesCreated} leave type(s), ${DRY_RUN ? 'would assign' : 'assigned'} the default shift to ${assigned} employee(s).`);
  await prisma.$disconnect();
}

main().catch(e => { console.error('\n❌', e); process.exit(1); });
