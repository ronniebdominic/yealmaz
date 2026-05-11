require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.findUnique({ where: { email: 'admin@yealmaz.com' } })
  .then(u => console.log(u))
  .catch(e => console.log('ERROR:', e.message))
  .finally(() => p.$disconnect());