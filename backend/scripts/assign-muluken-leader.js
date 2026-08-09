/**
 * Ye-Almaz — Assign Muluken Ayalew Mesfin (muluken@yealmaz.com) as the
 * manager for every active, real (non-shared-account) LAB_TECH user, so
 * their leave requests route to him for first-stage approval via
 * PATCH /attendance/leave/:id/manager-decide before HR's final decision.
 *
 * Muluken stays role=LAB_TECH (User.role is single-valued — see
 * conversation) — this only sets EmployeeProfile.managerId, which is what
 * the leave-approval routing actually reads. No EmployeeProfile rows
 * existed yet for LAB_TECH users, so this upserts them.
 *
 * Usage: node scripts/assign-muluken-leader.js [--dry-run]
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const MANAGER_EMAIL = 'muluken@yealmaz.com';

async function main() {
  console.log(`\n🔧  Assign Muluken as LAB_TECH manager  ${DRY_RUN ? '⚠️ DRY RUN' : '🟢 LIVE'}`);
  console.log('─'.repeat(56));

  const manager = await prisma.user.findUnique({ where: { email: MANAGER_EMAIL } });
  if (!manager) throw new Error(`No user found for ${MANAGER_EMAIL}`);
  console.log(`Manager: ${manager.name} (${manager.id})`);

  const reports = await prisma.user.findMany({
    where: {
      role: 'LAB_TECH',
      isActive: true,
      isSharedAccount: false,
      id: { not: manager.id },
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  console.log(`Found ${reports.length} real, active LAB_TECH accounts to assign.\n`);

  for (const u of reports) {
    console.log(`  ${u.name}`);
    if (DRY_RUN) continue;
    await prisma.employeeProfile.upsert({
      where: { userId: u.id },
      update: { managerId: manager.id },
      create: { userId: u.id, managerId: manager.id },
    });
  }

  console.log('\n' + '─'.repeat(56));
  console.log(DRY_RUN ? 'Dry run complete — no changes written.' : `Done — ${reports.length} employee profiles updated.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
