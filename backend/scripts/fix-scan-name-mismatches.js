/**
 * Ye-Almaz — Fix historical scan attribution for techs whose account name
 * changed to a full legal name that ISN'T a prefix of the old nickname
 * embedded in CaseStage.scannedBy (so the usual first-name fallback in
 * GET /api/dashboard/lab-performance can't safely recover them).
 *
 * CaseStage.scannedBy is written from the tech's account name AT SCAN TIME
 * (see scanAttribution.js) — there's no persistent scannedById FK, so once
 * an account's name changes, every older scan permanently keeps the old
 * string. This rewrites those old strings to the current full name so
 * exact-match attribution (and the printed history) is correct again.
 *
 * Usage: node scripts/fix-scan-name-mismatches.js [--dry-run]
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

// old nickname embedded in scannedBy → current full account name
const RENAMES = [
  { old: 'Dagim',  current: 'Dagmawi Solomon Cheneke' },
  { old: 'Demis',  current: 'Dems Yisma Mengesha' },
  { old: 'Micky',  current: 'Mikiyas Yigezu Shewsema' },
  { old: 'Shewa',  current: 'Shewaye Guche Abreham' },
];

async function main() {
  console.log(`\n🔧  Fix scan-name mismatches  ${DRY_RUN ? '⚠️ DRY RUN' : '🟢 LIVE'}`);
  console.log('─'.repeat(56));

  for (const { old, current } of RENAMES) {
    // Exact "OldName (CODE)" match only — word boundary via the trailing
    // " (" so we never touch a different name that happens to start the
    // same way.
    const pattern = new RegExp(`^${old}\\s\\([A-Z0-9_]+\\)$`);
    const rows = await prisma.caseStage.findMany({
      where: { scannedBy: { startsWith: `${old} (` } },
      select: { id: true, scannedBy: true },
    });
    const matches = rows.filter(r => pattern.test(r.scannedBy));

    console.log(`• "${old}" → "${current}": ${matches.length} scan(s)`);

    if (!DRY_RUN && matches.length) {
      for (const r of matches) {
        const dept = r.scannedBy.slice(old.length); // " (CODE)"
        await prisma.caseStage.update({
          where: { id: r.id },
          data: { scannedBy: `${current}${dept}` },
        });
      }
    }
  }

  console.log(`\n🏁  ${DRY_RUN ? 'Would update' : 'Updated'} rows above.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error('\n❌', e); process.exit(1); });
