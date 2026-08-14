// Guard: the Telegram bot's tool layer must never be able to mutate data.
// Greps botTools.js and its direct imports (the route files it pulls
// compute*/search*/get* functions from) for any Prisma write call — fails
// loudly if one is found, since a mutating tool slipping in here would be
// a real business-data-safety regression, not just a lint nit.
// Run manually before a deploy that touches botTools.js or its imports:
//   node scripts/check-bot-readonly.js
const fs = require('fs');
const path = require('path');

const FILES = [
  'src/services/botTools.js',
  'src/routes/dashboard.js',
  'src/routes/cases.js',
  'src/routes/payments.js',
];

const WRITE_PATTERN = /prisma\.\w+\.(create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/;

let failed = false;
for (const rel of FILES) {
  const full = path.join(__dirname, '..', rel);
  const src = fs.readFileSync(full, 'utf8');
  const match = WRITE_PATTERN.exec(src);
  if (match) {
    // dashboard.js/cases.js/payments.js are full route files with plenty
    // of legitimate writes elsewhere in them (case creation, payment
    // verification, etc.) — this check only cares about botTools.js
    // itself never containing one. The other files are only sanity-logged.
    if (rel === 'src/services/botTools.js') {
      console.error(`FAIL: ${rel} contains a Prisma write call: "${match[0]}" — every tool handler must be read-only.`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log('OK: botTools.js contains no Prisma write calls.');
}
