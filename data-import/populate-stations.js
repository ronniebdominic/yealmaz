// Populate clinic.station from clients-2026-02-28.xlsx
// Run from: c:\yealmaz\data-import\
// Usage: node populate-stations.js

const path = require('path');
const XLSX = require(path.join(__dirname, '../frontend/receptionist/node_modules/xlsx'));
const { PrismaClient } = require(path.join(__dirname, '../backend/node_modules/@prisma/client'));

const prisma = new PrismaClient();

async function main() {
  const wb = XLSX.readFile(path.join(__dirname, 'clients-2026-02-28.xlsx'));
  const ws = wb.Sheets[wb.SheetNames[0]];
  // Row 0 is a title row; row 1 has the actual column headers (Sr.no, Client, Code, WhatsApp, Station)
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = raw[1]; // ['Sr.no', 'Client', 'Code', 'WhatsApp', 'Station', '']
  const rows = raw.slice(2).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
    return obj;
  });

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const row of rows) {
    const code    = String(row['Code'] || '').trim();
    const station = String(row['Station'] || '').trim();

    if (!code || station === '---' || station === '') {
      skipped++;
      continue;
    }

    // Pad code to 5 digits to match DB format (e.g. "1" → "00001")
    const paddedCode = code.padStart(5, '0');

    const clinic = await prisma.clinic.findFirst({
      where: { OR: [{ code: code }, { code: paddedCode }] },
      select: { id: true, name: true, code: true }
    });

    if (!clinic) {
      console.log(`  NOT FOUND: code=${code}`);
      notFound++;
      continue;
    }

    await prisma.clinic.update({
      where: { id: clinic.id },
      data: { station }
    });

    console.log(`  ✓ ${clinic.name} (${clinic.code}) → ${station}`);
    updated++;
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped (no station), ${notFound} not found in DB`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
