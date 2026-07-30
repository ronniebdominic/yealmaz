// Ye-Almaz — Smart Cache Layer
// Primary: Redis (ioredis)  |  Fallback: node-cache (in-memory)
// All public methods are async. Routes must await get/set/invalidate.

const Redis    = require('ioredis');
const NodeCache = require('node-cache');

// ── Smart TTL rules (seconds) — matched by key prefix ─────
const TTL_RULES = [
  { prefix: 'prices',                ttl: 3600  }, // 1 h  — admin-edited, rarely changes
  { prefix: 'clinics',               ttl: 3600  }, // 1 h  — clinic list rarely changes
  { prefix: 'dashboard:revenue',     ttl: 3600  }, // 1 h  — expensive aggregation
  { prefix: 'dashboard:analytics',   ttl: 1800  }, // 30m  — date-range analytics
  { prefix: 'dashboard:lab-performance', ttl: 1800 }, // 30m — per-tech scan history, changes slowly
  { prefix: 'dashboard:summary',     ttl: 60    }, // 1 m  — KPI cards
  { prefix: 'dashboard:cases-by-status', ttl: 120 }, // 2 m
  { prefix: 'case:lab:',             ttl: 30    }, // 30s  — lab case detail
  { prefix: 'case:',                 ttl: 30    }, // 30s  — single case
  { prefix: 'cases:',                ttl: 30    }, // 30s  — case lists
  { prefix: 'lab:',                  ttl: 30    }, // 30s  — lab queue
  { prefix: 'payments:pending',      ttl: 30    }, // 30s  — live verification queue
  { prefix: 'payments:billing',      ttl: 60    }, // 1 m  — billing list
  { prefix: 'payments:gateway',      ttl: 30    }, // 30s  — live gateway/verify queue
  { prefix: 'payments:trusted-summary', ttl: 60 }, // 1 m  — heavy per-clinic aggregation
  { prefix: 'payments:trusted:',     ttl: 30    }, // 30s  — per-clinic case drill-down
  { prefix: 'payments:clinic-balances', ttl: 30 }, // 30s  — outstanding-balance aggregation
  { prefix: 'delivery:',             ttl: 60    }, // 1 m  — dispatch queue
  { prefix: 'inventory:items',       ttl: 300   }, // 5 m  — changes only via explicit CRUD/adjust
  { prefix: 'inventory:requests',    ttl: 30    }, // 30s  — queue should feel live
  { prefix: 'inventory:transactions', ttl: 60   }, // 1 m  — ledger/report view
  { prefix: 'dashboard:inventory-summary', ttl: 300 }, // 5 m — glance KPIs
  { prefix: 'milling:leaderboard',   ttl: 300   }, // 5 m  — staff points leaderboard
  { prefix: 'employees',             ttl: 300   }, // 5 m  — employee profile list, changes rarely
  { prefix: 'attendance:events',     ttl: 30    }, // 30s  — recent event feed, feels live
  { prefix: 'attendance:leave',      ttl: 60    }, // 1 m  — leave record list
  { prefix: 'payroll:runs',          ttl: 60    }, // 1 m
  { prefix: 'payroll:entries',       ttl: 30    }, // 30s
  { prefix: 'dashboard:hr-summary',  ttl: 300   }, // 5 m  — glance KPIs
];
const DEFAULT_TTL = 300; // 5 m fallback

function smartTTL(key) {
  for (const { prefix, ttl } of TTL_RULES) {
    if (key.startsWith(prefix)) return ttl;
  }
  return DEFAULT_TTL;
}

// ── Stats ──────────────────────────────────────────────────
const stats = { hits: 0, misses: 0, errors: 0, provider: 'memory', redisReady: false };

// ── In-memory fallback ─────────────────────────────────────
const mem = new NodeCache({ stdTTL: DEFAULT_TTL, checkperiod: 120, useClones: false });

// ── Redis setup ────────────────────────────────────────────
const KEY_PREFIX = 'ya:';
let redis = null;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    connectTimeout: 5000,
    tls: process.env.REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  });

  redis.on('ready', () => {
    stats.provider    = 'redis';
    stats.redisReady  = true;
    console.log('✅ [cache] Redis connected');
  });

  redis.on('error', (err) => {
    if (stats.redisReady) {
      stats.provider   = 'memory';
      stats.redisReady = false;
      console.warn('⚠️  [cache] Redis error — falling back to in-memory:', err.message);
    }
    stats.errors++;
  });

  redis.on('reconnecting', () => {
    console.log('🔄 [cache] Redis reconnecting…');
  });

  redis.connect().catch(err => {
    console.warn('⚠️  [cache] Redis unavailable — using in-memory cache:', err.message);
  });
} else {
  console.log('ℹ️  [cache] No REDIS_URL — using in-memory cache only');
}

// ── Helpers ────────────────────────────────────────────────
const rKey = (k) => `${KEY_PREFIX}${k}`;

async function scanKeys(pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const [next, found] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = next;
    keys.push(...found);
  } while (cursor !== '0');
  return keys;
}

// ── Cache API ──────────────────────────────────────────────
const appCache = {

  async get(key) {
    // 1. Try Redis
    if (stats.redisReady) {
      try {
        const raw = await redis.get(rKey(key));
        if (raw !== null) {
          stats.hits++;
          const parsed = JSON.parse(raw);
          // Warm the in-memory layer so subsequent requests are instant
          mem.set(key, parsed, smartTTL(key));
          return parsed;
        }
      } catch (err) {
        stats.errors++;
      }
    }

    // 2. Try in-memory
    const val = mem.get(key);
    if (val !== undefined) { stats.hits++; return val; }

    stats.misses++;
    return undefined;
  },

  async set(key, value, ttl) {
    const t = ttl ?? smartTTL(key);

    // Write to in-memory immediately (sync, zero-latency for hot reads)
    mem.set(key, value, t);

    // Write-through to Redis (async, best-effort)
    if (stats.redisReady) {
      try {
        await redis.set(rKey(key), JSON.stringify(value), 'EX', t);
      } catch (err) {
        stats.errors++;
      }
    }
  },

  async del(key) {
    mem.del(key);
    if (stats.redisReady) {
      try { await redis.del(rKey(key)); } catch (err) { stats.errors++; }
    }
  },

  getStats: () => ({ ...stats, memKeys: mem.keys().length }),
};

// ── Wildcard invalidation ──────────────────────────────────
async function invalidate(...patterns) {
  await Promise.all(patterns.map(async (pattern) => {
    const isWildcard = pattern.endsWith('*');
    const prefix     = isWildcard ? pattern.slice(0, -1) : pattern;

    // In-memory invalidation (sync)
    if (isWildcard) {
      mem.keys().filter(k => k.startsWith(prefix)).forEach(k => mem.del(k));
    } else {
      mem.del(pattern);
    }

    // Redis invalidation via SCAN (avoids KEYS on large datasets)
    if (stats.redisReady) {
      try {
        const redisPattern = isWildcard ? `${KEY_PREFIX}${prefix}*` : rKey(pattern);
        const keys = await scanKeys(redisPattern);
        if (keys.length > 0) await redis.del(...keys);
      } catch (err) {
        stats.errors++;
      }
    }
  }));
}

module.exports = { appCache, invalidate };
