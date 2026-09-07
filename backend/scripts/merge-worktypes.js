/**
 * Ye-Almaz — Merge duplicate/legacy work-type pricing entries
 *
 * Some work types in work_type_prices are naming variants of the same real
 * item (e.g. "Full Contoured Zirconia", "Zirconia Express", "Zirconia Crown"
 * all really mean "Zirconia"). This re-labels every Case.workType currently
 * set to a variant to the canonical name, then deletes the now-redundant
 * WorkTypePrice row for that variant. The canonical row's own price/
 * duration/express settings are left untouched — historical cases keep
 * whatever totalAmount they were already billed at; only the workType
 * label changes, for consistent grouping/reporting going forward.
 *
 * Usage:
 *   node scripts/merge-worktypes.js <canonical> <variant> [<variant> ...] [--dry-run]
 *
 * Example:
 *   node scripts/merge-worktypes.js "Zirconia" "Full Contoured Zirconia" "Zirconia Express" "Zirconia Crown" --dry-run
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { invalidate } = require('../src/cache');
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const args = process.argv.slice(2).filter(a => a !== '--dry-run');
const [canonical, ...variants] = args;

if (!canonical || variants.length === 0) {
  console.error('Usage: node scripts/merge-worktypes.js <canonical> <variant> [<variant> ...] [--dry-run]');
  process.exit(1);
}

async function main() {
  console.log(`\n🔀  Work-type merge  ${DRY_RUN ? '⚠️ DRY RUN' : '🟢 LIVE'}`);
  console.log('─'.repeat(56));

  const canonicalRow = await prisma.workTypePrice.findUnique({ where: { workType: canonical } });
  if (!canonicalRow) {
    console.error(`❌ Canonical work type "${canonical}" not found in work_type_prices — aborting.`);
    process.exit(1);
  }
  console.log(`Canonical: "${canonical}" (price ${canonicalRow.price}, express ${canonicalRow.expressPrice ?? '—'}) — kept as-is.\n`);

  let movedCases = 0, mergedTypes = 0;

  for (const variant of variants) {
    if (variant === canonical) { console.log(`• "${variant}" — same as canonical, skipping.`); continue; }
    const variantRow = await prisma.workTypePrice.findUnique({ where: { workType: variant } });
    const count = await prisma.case.count({ where: { workType: variant } });

    if (!variantRow && count === 0) { console.log(`• "${variant}" — no pricing row and no cases, nothing to do.`); continue; }

    const priceNote = variantRow ? `price ${variantRow.price}, express ${variantRow.expressPrice ?? '—'}` : 'no pricing row (orphaned case label)';
    console.log(`• "${variant}" (${priceNote}) — ${count} case(s) → relabel to "${canonical}"${variantRow ? ', then delete this pricing row.' : '.'}`);

    if (!DRY_RUN) {
      if (count > 0) {
        await prisma.case.updateMany({ where: { workType: variant }, data: { workType: canonical } });
      }
      if (variantRow) {
        await prisma.workTypePrice.delete({ where: { workType: variant } });
      }
    }
    movedCases += count;
    mergedTypes++;
  }

  if (!DRY_RUN && mergedTypes > 0) {
    await invalidate('prices', 'cases:*', 'dashboard:*');
  }

  console.log(`\n🏁  ${DRY_RUN ? 'Would merge' : 'Merged'} ${mergedTypes} work type(s), relabeling ${movedCases} case(s) to "${canonical}".`);
  const remaining = await prisma.workTypePrice.count();
  console.log(`    Work types now: ${remaining}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error('\n❌', e); process.exit(1); });
