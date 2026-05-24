const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.findMany({ where: { role: 'LAB_TECH' }, select: { name: true, email: true, department: true }, orderBy: { name: 'asc' } })
  .then(r => r.forEach(u => console.log((u.department || 'none').padEnd(14), '|', u.email)))
  .finally(() => p.$disconnect());
