/**
 * Ye-Almaz — Auto-merge clinic naming variants
 *
 * Two clinic rows are the same clinic when their names reduce to the SAME set of
 * significant tokens after dropping filler words ("dental", "clinic", "dr",
 * punctuation, branch separators). e.g.:
 *   "Kal CMC Dental Clinic"   → {kal, cmc}
 *   "Kal Dental Clinic - CMC" → {kal, cmc}   ⇒ merge
 * Different branches keep different tokens ({...cmc} vs {...bole,michael}) and are
 * left alone, so only true reorderings/format variants merge.
 *
 * The OLDEST row in a colliding group is kept as canonical; the others have their
 * cases reassigned to it and are then deleted.
 *
 * Usage: node scripts/merge-clinic-variants.js [--dry-run]
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma  = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const STOP = new Set(['dental', 'clinic', 'dr', 'the', 'speciality', 'specialty']);
const tokenKey = (name) =>
  [...new Set(
    String(name).toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(t => t && !STOP.has(t))
  )].sort().join(' ');

async function main() {
  console.log(`\n🔗  Clinic variant auto-merge  ${DRY_RUN ? '⚠️ DRY RUN' : '🟢 LIVE'}`);
  console.log('─'.repeat(56));

  const clinics = await prisma.clinic.findMany({
    select: { id: true, name: true, createdAt: true, _count: { select: { cases: true } } },
  });

  // Group by normalized token key
  const groups = new Map();
  for (const c of clinics) {
    const k = tokenKey(c.name);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }

  const dupGroups = [...groups.values()].filter(g => g.length > 1);
  console.log(`Found ${dupGroups.length} duplicate group(s).\n`);

  let mergedClinics = 0, movedCases = 0;

  for (const group of dupGroups) {
    // Canonical = oldest; tie-break by most cases
    group.sort((a, b) =>
      (a.createdAt - b.createdAt) || (b._count.cases - a._count.cases));
    const primary = group[0];
    const dups    = group.slice(1);

    console.log(`• "${primary.name}"  ⬅  ${dups.map(d => `"${d.name}" (${d._count.cases})`).join(', ')}`);

    for (const d of dups) {
      if (!DRY_RUN) {
        const res = await prisma.case.updateMany({ where: { clinicId: d.id }, data: { clinicId: primary.id } });
        movedCases += res.count;
        // Clear dependent rows that block clinic delete (safe: import clinics have none of real value)
        await prisma.pushSubscription.deleteMany({ where: { clinicId: d.id } });
        await prisma.rewardTransaction.deleteMany({ where: { clinicId: d.id } });
        await prisma.rewardRedemption.deleteMany({ where: { clinicId: d.id } });
        await prisma.clinicPoints.deleteMany({ where: { clinicId: d.id } });
        await prisma.clinic.delete({ where: { id: d.id } });
      } else {
        movedCases += d._count.cases;
      }
      mergedClinics++;
    }
  }

  console.log(`\n🏁  ${DRY_RUN ? 'Would merge' : 'Merged'} ${mergedClinics} clinic(s), reassigning ${movedCases} case(s).`);
  const total = await prisma.clinic.count();
  console.log(`    Clinics now: ${total}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error('\n❌', e); process.exit(1); });
