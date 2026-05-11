// Ye-Almaz — Auth Routes
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Helper: generate JWT
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// ── POST /api/auth/login ─────────────────────────────────
// Used by: Admin, Receptionist, Delivery staff
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── POST /api/auth/clinic/login ──────────────────────────
// Used by: Clinic mobile app
router.post('/clinic/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const clinic = await prisma.clinic.findUnique({ where: { email } });

    if (!clinic || !clinic.isActive) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, clinic.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken({
      id: clinic.id,
      email: clinic.email,
      role: 'CLINIC',
      name: clinic.name
    });

    res.json({
      token,
      clinic: {
        id: clinic.id,
        name: clinic.name,
        email: clinic.email,
        phone: clinic.phone,
        address: clinic.address
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── GET /api/auth/me ────────────────────────────────────
// Returns current logged-in user info
router.get('/me', protect, async (req, res) => {
  try {
    if (req.user.role === 'CLINIC') {
      const clinic = await prisma.clinic.findUnique({
        where: { id: req.user.id },
        select: { id: true, name: true, email: true, phone: true, address: true }
      });
      return res.json({ ...clinic, role: 'CLINIC' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, phone: true }
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch user.' });
  }
});

// ── POST /api/auth/seed-admin ────────────────────────────
// ONE-TIME USE: Creates the first admin account
// Delete or comment out after first use
router.post('/seed-admin', async (req, res) => {
  try {
    const exists = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (exists) {
      return res.status(400).json({ error: 'Admin already exists.' });
    }

    const hashed = await bcrypt.hash('YeAlmaz@Admin2024', 10);
    const admin = await prisma.user.create({
      data: {
        name: 'Ye-Almaz Admin',
        email: 'admin@yealmaz.com',
        password: hashed,
        role: 'ADMIN'
      }
    });

    res.json({
      message: 'Admin created successfully. Change the password immediately.',
      email: admin.email,
      tempPassword: 'YeAlmaz@Admin2024'
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not create admin.' });
  }
});

module.exports = router;
