// Ye-Almaz — the ONE Prisma client for the whole backend.
//
// Every route/service used to create its own `new PrismaClient()`. Each client opens its own
// connection pool (sized from the CPU count), so ~55 of them together blew through the database
// pooler's 200-connection limit ("EMAXCONN max client connections reached") and left the app one
// traffic spike away from random 500s. Everything now shares this single pool.
//
// Pool size: DB_POOL_SIZE env var, default 15 — well under the limit, plenty for one server.
const { PrismaClient } = require('@prisma/client');

function pooledUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', process.env.DB_POOL_SIZE || '15');
    if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', '20');
    return u.toString();
  } catch {
    return raw;
  }
}

const url = pooledUrl();
const prisma = globalThis.__yaPrisma || new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
globalThis.__yaPrisma = prisma;

module.exports = prisma;
