// Ye-Almaz Dental Lab — Main Server
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
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST']
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

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ── Middleware ───────────────────────────────────────────
app.use(compression());
app.use(cors({ origin: '*', credentials: false }));
app.use(express.json());
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
app.use('/api/clinics',       require('./routes/clinics'));
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
server.listen(PORT, () => {
  console.log(`\n🦷 Ye-Almaz Dental Lab API`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = { app, io, prisma };
