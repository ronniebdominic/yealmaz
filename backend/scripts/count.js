const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.case.count().then(n => { console.log('Cases in DB:', n); return p.$disconnect(); });
