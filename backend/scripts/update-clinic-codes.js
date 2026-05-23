// Updates existing clinic records: sets code, and fills phone from whatsapp if phone is empty
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const xlsx = require('xlsx');
const path = require('path');

const prisma = new PrismaClient();

const FILE = path.join(
  process.env.HOME || process.env.USERPROFILE,
  'Downloads',
  'clients-2026-05-23 (2).xlsx'
);

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[\[\]()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  // ── Read Excel ───────────────────────────────────────
  const wb = xlsx.readFile(FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Row 1 (index 1) is the real header: Sr.no, Client, Doctor, Code, Mobile, WhatsApp, Station
  const data = [];
  for (let i = 2; i < rows.length; i++) {
    const [srno, name, , code, mobile, whatsapp] = rows[i];
    if (!srno || !String(srno).trim().match(/^\d+$/)) continue;
    const rawPhone  = String(mobile   || '').trim();
    const rawWa     = String(whatsapp || '').trim();
    const INVALID = new Set(['---', 'n/a', 'na', '+251900000000', '0']);
    const phone   = (rawPhone && !INVALID.has(rawPhone.toLowerCase())) ? rawPhone : null;
    const waPhone = (rawWa    && !INVALID.has(rawWa.toLowerCase()))    ? rawWa    : null;
    const finalCode = String(code || '').trim().padStart(5, '0');
    data.push({ name: String(name || '').trim(), code: finalCode, phone, waPhone });
  }

  console.log(`Excel rows loaded: ${data.length}`);

  // ── Fetch all clinics from DB ────────────────────────
  const clinics = await prisma.clinic.findMany({
    select: { id: true, name: true, phone: true, code: true },
  });
  console.log(`DB clinics: ${clinics.length}`);

  let updated = 0, skipped = 0, unmatched = 0;

  for (const row of data) {
    const normRow = normalize(row.name);
    const match = clinics.find(c => normalize(c.name) === normRow);

    if (!match) {
      console.log(`  ✗ No match: "${row.name}"`);
      unmatched++;
      continue;
    }

    // Phone: keep existing if set, otherwise use mobile → whatsapp
    const existingPhone = match.phone && match.phone.trim() !== '' ? match.phone : null;
    const bestPhone = existingPhone || row.phone || row.waPhone || null;

    // Skip if nothing changed
    if (match.code === row.code && bestPhone === existingPhone) {
      skipped++;
      continue;
    }

    try {
      await prisma.clinic.update({
        where: { id: match.id },
        data: { code: row.code, phone: bestPhone },
      });
      console.log(`  ✓ "${match.name}" → code=${row.code} phone=${bestPhone}`);
      updated++;
    } catch (e) {
      if (e.code === 'P2002') {
        console.log(`  ⚠ Duplicate code ${row.code} for "${match.name}" — skipped`);
        skipped++;
      } else {
        throw e;
      }
    }
  }

  console.log(`\nDone — updated: ${updated}, skipped: ${skipped}, unmatched: ${unmatched}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
