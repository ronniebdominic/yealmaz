const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.case.findMany({
  take: 3,
  include: {
    clinic: { select: { id: true, name: true, phone: true } },
    stages: { orderBy: { scannedAt: 'desc' }, take: 1 },
    payment: true
  },
  orderBy: { createdAt: 'desc' }
})
.then(r => { console.log('OK - count:', r.length); console.log('Sample:', r[0]?.caseNumber, '| clinic:', r[0]?.clinic?.name); })
.catch(e => console.error('ERROR:', e.message))
.finally(() => p.$disconnect());
