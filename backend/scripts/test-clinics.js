const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.clinic.findMany({
  where: { isActive: true },
  select: { id: true, code: true, name: true, phone: true, address: true },
  orderBy: { name: 'asc' },
  take: 3
})
.then(r => console.log('OK — count:', r.length, '| sample:', r[0]?.name, '| code:', r[0]?.code))
.catch(e => console.error('ERROR:', e.message))
.finally(() => p.$disconnect());
