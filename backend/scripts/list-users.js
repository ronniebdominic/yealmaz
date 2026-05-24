const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.findMany({ select: { id: true, name: true, email: true, role: true }, orderBy: { role: 'asc' } })
  .then(users => users.forEach(u => console.log(`[${u.role}] ${u.name} — ${u.email}`)))
  .catch(e => console.error(e.message))
  .finally(() => p.$disconnect());
