/**
 * Ye-Almaz — Import lab material items from a "Material Balance" xlsx
 *
 * Source: an Excel ledger the lab keeps by hand, with one sheet per week
 * ("Aug 17-Aug 22, 2026") showing a rolling stock balance per item, plus
 * one-off sheets for newly-received stock ("New") and older misc items
 * ("Inventory 2"). Column layout (and even header wording/whitespace)
 * varies slightly sheet to sheet, so columns are located by header text
 * rather than fixed index.
 *
 * Only the LATEST weekly ledger sheet is used — earlier weeks are the same
 * items with an older running balance, already superseded by later ones.
 *
 * Behavior:
 *   - An item whose name already exists in inventory_items (case-insensitive)
 *     is left untouched — quantityOnHand only ever moves through a logged
 *     RESTOCK/ADJUSTMENT transaction elsewhere in the app, so this script
 *     must not silently overwrite live stock counts.
 *   - A negative "Actual Balance" (data-entry/consumption-overage artifact
 *     in the source sheet) is imported as 0, and listed in the summary so
 *     it can be physically recounted.
 *   - No reorderThreshold is set — the sheet doesn't specify one.
 *
 * Usage: node scripts/import-material-balance.js <path-to-xlsx> [--dry-run]
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const filePath = process.argv[2];

if (!filePath || filePath.startsWith('--')) {
  console.error('Usage: node scripts/import-material-balance.js <path-to-xlsx> [--dry-run]');
  process.exit(1);
}

const LATEST_LEDGER_SHEET = 'Aug 17-Aug 22, 2026 ';
const MISC_LEDGER_SHEET = 'Inventory 2';
const NEW_STOCK_SHEET = 'New';

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const normLower = (s) => norm(s).toLowerCase();
const cleanName = (s) => norm(s).replace(/\s*,\s*/g, ', ');

// ── Ledger-style sheets (weekly ledger + "Inventory 2") ─────────────────
// Locates columns by header text so minor wording/whitespace differences
// between sheets ("Product  Types" vs "Product types", extra trailing
// spaces, etc.) don't break parsing.
function parseLedgerSheet(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const headerRowIdx = rows.findIndex(r => r.some(c => normLower(c) === 'item description'));
  if (headerRowIdx === -1) throw new Error(`Could not find header row in sheet: ${sheetName}`);
  const header = rows[headerRowIdx];

  const findCol = (target) => header.findIndex(h => normLower(h) === target);
  const typeCol = findCol('product types') !== -1 ? findCol('product types') : findCol('product type');
  const descCol = findCol('item description');
  const unitCol = findCol('unit');
  const balanceCol = header.findIndex(h => normLower(h) === 'actual balance');
  if (descCol === -1 || balanceCol === -1) {
    throw new Error(`Could not locate required columns in sheet: ${sheetName}`);
  }

  const items = [];
  for (const row of rows.slice(headerRowIdx + 1)) {
    const desc = cleanName(row[descCol]);
    if (!desc) continue; // blank separator row between item groups
    const productType = typeCol !== -1 ? cleanName(row[typeCol]) : '';
    const unit = norm(row[unitCol]) || 'pcs';
    const rawBalance = row[balanceCol];
    const balance = typeof rawBalance === 'number' ? rawBalance : parseInt(rawBalance) || 0;
    items.push({
      name: productType ? `${productType} ${desc}` : desc,
      unit,
      quantityOnHand: balance,
      source: sheetName.trim(),
    });
  }
  return items;
}

// ── "New" sheet: [No, Product Description, variant code, unit, Qty] ────
function parseNewStockSheet(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const headerRowIdx = rows.findIndex(r => r.some(c => normLower(c).startsWith('product') && normLower(c).includes('description')));
  if (headerRowIdx === -1) throw new Error(`Could not find header row in sheet: ${sheetName}`);

  const items = [];
  for (const row of rows.slice(headerRowIdx + 1)) {
    const productDesc = cleanName(row[1]);
    const variant = cleanName(row[2]);
    if (!productDesc && !variant) continue;
    const qty = typeof row[4] === 'number' ? row[4] : parseInt(row[4]) || 0;
    if (!qty && !variant) continue; // trailing totals row (blank variant, just a sum)
    items.push({
      name: variant ? `${productDesc} ${variant}` : productDesc,
      unit: norm(row[3]) || 'pcs',
      quantityOnHand: qty,
      source: sheetName.trim(),
    });
  }
  return items;
}

async function main() {
  console.log(`\n📦  Material Balance import  ${DRY_RUN ? '⚠️  DRY RUN' : '🟢 LIVE'}`);
  console.log('─'.repeat(60));
  console.log(`Source file: ${filePath}\n`);

  const wb = XLSX.readFile(filePath);

  const parsed = [
    ...parseLedgerSheet(wb, LATEST_LEDGER_SHEET),
    ...parseLedgerSheet(wb, MISC_LEDGER_SHEET),
    ...parseNewStockSheet(wb, NEW_STOCK_SHEET),
  ];

  // Negative balances are a data-entry/consumption-overage artifact in the
  // source sheet — can't hold negative physical stock, so clamp to 0 and
  // flag for a manual recount.
  const negatives = parsed.filter(i => i.quantityOnHand < 0);
  const toImport = parsed.map(i => ({ ...i, quantityOnHand: Math.max(0, i.quantityOnHand) }));

  // De-dupe within the sheet itself (keep the first occurrence) before
  // checking against the DB.
  const seen = new Set();
  const deduped = [];
  const dupesInSheet = [];
  for (const item of toImport) {
    const key = normLower(item.name);
    if (seen.has(key)) { dupesInSheet.push(item.name); continue; }
    seen.add(key);
    deduped.push(item);
  }

  const existing = await prisma.inventoryItem.findMany({ select: { name: true } });
  const existingNames = new Set(existing.map(i => normLower(i.name)));

  const toCreate = deduped.filter(i => !existingNames.has(normLower(i.name)));
  const skippedExisting = deduped.filter(i => existingNames.has(normLower(i.name)));

  console.log(`Parsed from sheet(s): ${parsed.length}`);
  console.log(`Duplicate names within the sheet (kept first, skipped rest): ${dupesInSheet.length}`);
  if (dupesInSheet.length) dupesInSheet.forEach(n => console.log(`   - ${n}`));
  console.log(`Already in inventory (skipped, stock untouched): ${skippedExisting.length}`);
  if (skippedExisting.length) skippedExisting.forEach(i => console.log(`   - ${i.name}`));
  console.log(`Negative balances clamped to 0 (needs physical recount): ${negatives.length}`);
  if (negatives.length) negatives.forEach(i => console.log(`   - ${i.name} (sheet showed ${i.quantityOnHand})`));
  console.log(`\nNew items to create: ${toCreate.length}`);

  if (!DRY_RUN) {
    for (const item of toCreate) {
      await prisma.inventoryItem.create({
        data: { name: item.name, unit: item.unit, quantityOnHand: item.quantityOnHand, reorderThreshold: null },
      });
    }
    console.log(`\n🏁  Created ${toCreate.length} inventory item(s).`);
  } else {
    console.log('\n(dry run — nothing written)');
    toCreate.slice(0, 20).forEach(i => console.log(`   + ${i.name}  |  ${i.unit}  |  qty ${i.quantityOnHand}  |  from ${i.source}`));
    if (toCreate.length > 20) console.log(`   ... and ${toCreate.length - 20} more`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('\n❌', e); process.exit(1); });
