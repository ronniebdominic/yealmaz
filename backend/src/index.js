// Ye-Almaz Dental Lab — Main Server
require('dotenv').config();
const express = require('express');
const cors = require('cors');
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

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ── Middleware ───────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ───────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/cases',         require('./routes/cases'));
app.use('/api/stages',        require('./routes/stages'));
app.use('/api/payments',      require('./routes/payments'));
app.use('/api/delivery',      require('./routes/delivery'));
app.use('/api/dashboard',     require('./routes/dashboard'));
app.use('/api/scan',          require('./routes/scan'));      // Public QR scan endpoint

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
