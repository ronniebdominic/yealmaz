const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const clinics = await p.clinic.findMany({ select: { id: true, name: true, email: true } });
  console.log('DB clinics (' + clinics.length + '):');
  clinics.forEach(c => console.log(' ', JSON.stringify(c)));

  const prices = await p.workTypePrice.findMany({ select: { workType: true }, take: 10 });
  console.log('Sample work types:', prices.map(w => w.workType));

  await p.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
