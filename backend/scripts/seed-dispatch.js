/**
 * Ye-Almaz — Seed Dispatch & Delivery Executive accounts
 */
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const accounts = [
    { name: 'Ye-Almaz Dispatch',              email: 'dispatch@yealmaz.com',   role: 'DISPATCH', password: 'Dispatch@YeAlmaz2025'  },
    { name: 'Yealmaz Delivery Executive A',   email: 'delivery.a@yealmaz.com', role: 'DELIVERY', password: 'DeliveryA@YeAlmaz2025' },
    { name: 'Yealmaz Delivery Executive B',   email: 'delivery.b@yealmaz.com', role: 'DELIVERY', password: 'DeliveryB@YeAlmaz2025' },
    { name: 'Yealmaz Delivery Executive C',   email: 'delivery.c@yealmaz.com', role: 'DELIVERY', password: 'DeliveryC@YeAlmaz2025' },
  ];

  console.log('Creating dispatch & delivery accounts…\n');

  for (const acc of accounts) {
    const existing = await p.user.findUnique({ where: { email: acc.email } });
    if (existing) {
      console.log(`  ⚠  Already exists: ${acc.email}`);
      continue;
    }
    const hashed = await bcrypt.hash(acc.password, 10);
    await p.user.create({
      data: { name: acc.name, email: acc.email, password: hashed, role: acc.role }
    });
    console.log(`  ✓  Created: ${acc.name}`);
    console.log(`     Email   : ${acc.email}`);
    console.log(`     Password: ${acc.password}`);
    console.log(`     Role    : ${acc.role}\n`);
  }

  console.log('Done.');
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
