// Ye-Almaz — User Management Routes (Admin only)
const express = require('express');
const bcrypt  = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const SAFE_SELECT = {
  id: true, name: true, email: true, role: true,
  department: true, phone: true, isActive: true, createdAt: true,
};

// ── GET /api/users ───────────────────────────────────────
router.get('/', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { not: 'ADMIN' } },
      select: SAFE_SELECT,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch users.' });
  }
});

// ── POST /api/users ──────────────────────────────────────
router.post('/', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { name, email, password, role, department, phone } = req.body;

    if (!name?.trim())     return res.status(400).json({ error: 'Name is required.' });
    if (!email?.trim())    return res.status(400).json({ error: 'Email is required.' });
    if (!password?.trim()) return res.status(400).json({ error: 'Password is required.' });
    if (!role)             return res.status(400).json({ error: 'Role is required.' });
    if (role === 'ADMIN')  return res.status(400).json({ error: 'Cannot create admin users here.' });

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: 'A user with this email already exists.' });

    const hashed = await bcrypt.hash(password.trim(), 10);

    const user = await prisma.user.create({
      data: {
        name:       name.trim(),
        email:      email.trim().toLowerCase(),
        password:   hashed,
        role,
        department: role === 'LAB_TECH' ? (department?.trim() || null) : null,
        phone:      phone?.trim() || null,
      },
      select: SAFE_SELECT,
    });

    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create user.' });
  }
});

// ── PATCH /api/users/:id ─────────────────────────────────
router.patch('/:id', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { name, email, password, role, department, phone, isActive } = req.body;

    // Prevent modifying other admins
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true } });
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.role === 'ADMIN') return res.status(403).json({ error: 'Cannot modify admin users.' });

    const data = {};
    if (name     !== undefined) data.name       = name.trim();
    if (email    !== undefined) data.email      = email.trim().toLowerCase();
    if (role     !== undefined && role !== 'ADMIN') data.role = role;
    if (phone    !== undefined) data.phone      = phone?.trim() || null;
    if (isActive !== undefined) data.isActive   = isActive;
    if (department !== undefined) data.department = department?.trim() || null;
    if (password?.trim()) data.password = await bcrypt.hash(password.trim(), 10);

    // Clear department if role changed away from LAB_TECH
    if (data.role && data.role !== 'LAB_TECH') data.department = null;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: SAFE_SELECT,
    });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update user.' });
  }
});

module.exports = router;
