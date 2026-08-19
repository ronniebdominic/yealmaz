// Ye-Almaz — Backfill EmployeeProfile.employeeCode
//
// employeeCode is the key the biometric attendance terminal identifies
// people by: POST /api/attendance/events looks up
// EmployeeProfile.employeeCode and 404s if it doesn't exist. Every profile
// had a null code, and several active staff had no EmployeeProfile row at
// all, so no device integration could work until this was filled in.
//
// Format follows the convention the HR UI already suggests (the
// "e.g. EMP001" placeholder in hr/components/ProfileModal.jsx): EMP + a
// zero-padded sequence. The numeric part is deliberately plain so it can
// map 1:1 onto the numeric user IDs most biometric terminals use
// internally — strip the prefix and you have the device ID.
//
// SAFE TO RE-RUN. Dry run unless --apply is passed. Never overwrites an
// existing code and never reuses a number already in use, so codes stay
// stable once assigned (re-numbering after enrolment would silently
// reassign fingerprints to the wrong people).
require('dotenv').config();

// The pooled connection is shared with the live app; a one-off maintenance
// script should not compete for those slots.
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const PREFIX = 'EMP';
const PAD = 3;

function codeFor(n) {
  return `${PREFIX}${String(n).padStart(PAD, '0')}`;
}

async function main() {
  // Shared accounts (dispatch/admin terminals) and deactivated staff are
  // excluded — nobody clocks in as those.
  const users = await prisma.user.findMany({
    where: { isActive: true, isSharedAccount: false },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, role: true,
      employeeProfile: { select: { id: true, employeeCode: true } },
    },
  });

  // Any code already in use anywhere, so a re-run can never collide with a
  // code HR typed in by hand through the Employees tab.
  const existing = await prisma.employeeProfile.findMany({
    where: { employeeCode: { not: null } },
    select: { employeeCode: true },
  });
  const taken = new Set(existing.map(e => e.employeeCode));

  let next = 1;
  const nextFreeCode = () => {
    while (taken.has(codeFor(next))) next++;
    const c = codeFor(next);
    taken.add(c);
    return c;
  };

  const plan = [];
  for (const u of users) {
    if (u.employeeProfile?.employeeCode) continue; // already coded — leave alone
    plan.push({
      userId: u.id,
      name: u.name,
      role: u.role,
      profileId: u.employeeProfile?.id || null,
      action: u.employeeProfile ? 'set-code' : 'create-profile+code',
      code: nextFreeCode(),
    });
  }

  const alreadyCoded = users.length - plan.length;
  console.log(`Active non-shared users: ${users.length}`);
  console.log(`Already have a code:     ${alreadyCoded}`);
  console.log(`To assign:               ${plan.length}\n`);

  if (!plan.length) {
    console.log('Nothing to do.');
    return;
  }

  for (const p of plan) {
    console.log(`  ${p.code}  ${p.name.padEnd(30)} ${String(p.role).padEnd(16)} ${p.action}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.');
    return;
  }

  // One transaction: either every person gets a code or none do, so a
  // partial failure can't leave the roster half-coded.
  await prisma.$transaction(
    plan.map(p =>
      p.profileId
        ? prisma.employeeProfile.update({ where: { id: p.profileId }, data: { employeeCode: p.code } })
        : prisma.employeeProfile.create({ data: { userId: p.userId, employeeCode: p.code, employmentStatus: 'ACTIVE' } }),
    ),
  );

  console.log(`\nApplied. ${plan.length} employee code(s) written.`);
}

main()
  .catch(e => { console.error('FAILED:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
