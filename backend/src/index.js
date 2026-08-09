// Ye-Almaz Dental Lab — Main Server
// The whole system runs on East Africa Time (EAT, UTC+3) — the lab, every
// clinic, and every staff member are in Ethiopia. Setting this before
// anything else runs makes every local-time Date computation in the backend
// (day/month/year boundaries, .toLocaleDateString() on invoices/statements,
// due-date math, etc.) resolve in EAT instead of whatever timezone the host
// machine defaults to (UTC on Railway). Must be set before any other module
// is required, since some Date/Intl internals cache the timezone on first use.
process.env.TZ = 'Africa/Addis_Ababa';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');

const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();

// ── Socket.io setup ──────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  }
});

// Make io accessible in routes
app.set('io', io);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Clinic joins a room for their cases
  socket.on('join_clinic', (clinicId) => {
    socket.join(`clinic_${clinicId}`);
    console.log(`Clinic ${clinicId} joined their room`);
  });

  // Staff joins the main lab room
  socket.on('join_lab', () => {
    socket.join('lab_staff');
    console.log('Staff member joined lab room');
  });

  // Delivery executive joins their personal room
  socket.on('join_delivery', (userId) => {
    socket.join(`delivery_${userId}`);
    console.log(`Delivery exec ${userId} joined their room`);
  });

  // Inventory manager joins the goods-request notification room
  socket.on('join_inventory', () => {
    socket.join('inventory_staff');
    console.log('Inventory manager joined inventory room');
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ── Middleware ───────────────────────────────────────────
app.set('trust proxy', 1); // Railway sits behind a proxy; needed for express-rate-limit v7+
app.use(compression());
app.use(cors());
// Capture the raw body so webhook signature verification can hash the exact bytes
// Chapa sent (re-serialized JSON would not match the HMAC).
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

// ── Routes ───────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/clinics',       require('./routes/clinics'));
app.use('/api/zones',         require('./routes/zones'));
app.use('/api/cases',         require('./routes/cases'));
app.use('/api/stages',        require('./routes/stages'));
app.use('/api/payments',      require('./routes/payments'));
app.use('/api/delivery',      require('./routes/delivery'));
app.use('/api/dispatch',      require('./routes/dispatch'));
app.use('/api/dashboard',     require('./routes/dashboard'));
app.use('/api/lab',           require('./routes/lab'));
app.use('/api/scan',          require('./routes/scan'));      // Public QR scan endpoint
app.use('/api/prices',        require('./routes/prices'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/rewards',       require('./routes/rewards'));
app.use('/api/inventory',     require('./routes/inventory'));
app.use('/api/milling',       require('./routes/milling'));
app.use('/api/employees',     require('./routes/employees'));
app.use('/api/attendance',    require('./routes/attendance'));  // POST /events is public: biometric-device callback (own secret auth)
app.use('/api/payroll',       require('./routes/payroll'));
app.use('/api/shifts',        require('./routes/shifts'));
app.use('/api/timesheets',    require('./routes/timesheets'));
app.use('/api/overtime',      require('./routes/overtime'));
app.use('/api/leave',         require('./routes/leave'));
app.use('/api/salary-structures', require('./routes/salary-structures'));
app.use('/api/incentives',    require('./routes/incentives'));
app.use('/api/advances',      require('./routes/advances'));
app.use('/api/expenses',      require('./routes/expenses'));
app.use('/api/reports',       require('./routes/reports'));
app.use('/api/skills',        require('./routes/skills'));
app.use('/api/training',      require('./routes/training'));
app.use('/api/documents',     require('./routes/documents'));
app.use('/api/assets',        require('./routes/assets'));
app.use('/api/goals',         require('./routes/goals'));
app.use('/api/performance',   require('./routes/performance'));
app.use('/api/onboarding',    require('./routes/onboarding'));
app.use('/api/offboarding',   require('./routes/offboarding'));
app.use('/api/recruitment',   require('./routes/recruitment'));
app.use('/api/hr-analytics',  require('./routes/hr-analytics'));
app.use('/api/webhooks',      require('./routes/webhooks'));  // Public: DB-trigger callbacks (own secret auth)

// ── Cache management (admin only) ───────────────────────
const { appCache, invalidate } = require('./cache');
const { protect, restrict }    = require('./middleware/auth');
app.get('/api/cache/stats', protect, restrict('ADMIN'), (req, res) => {
  res.json(appCache.getStats());
});
app.post('/api/cache/flush', protect, restrict('ADMIN'), async (req, res) => {
  const patterns = req.body?.patterns || ['*'];
  await invalidate(...patterns);
  res.json({ ok: true, flushed: patterns, stats: appCache.getStats() });
});

// ── Health check ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    lab: 'Ye-Almaz Dental Lab',
    status: 'API running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ── Error handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// ── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`\n🦷 Ye-Almaz Dental Lab API`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  // Clear all caches on startup so stale data never survives a redeploy
  await invalidate('dashboard:*', 'cases:*', 'case:*', 'payments:*', 'prices', 'clinics');
  console.log(`🧹 Cache flushed on startup\n`);
});

module.exports = { app, io, prisma };
