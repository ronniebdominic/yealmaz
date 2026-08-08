// Ye-Almaz — User Management Routes (Admin only)
const express = require('express');
const bcrypt  = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Same department codes used by the scan station picker (scan.js DEPARTMENTS).
const VALID_DEPARTMENTS = new Set([
  'PLASTER', 'MARGIN', 'SCANNING', 'DESIGNING', 'MILLING', 'RESIN_PRINT',
  'METAL_PRINT', 'METAL_FINISH', 'OPAQUE', 'CERAMIC', 'ZIRCONIA',
  'GLAZING', 'THERMO', 'TRIMMING', 'QC',
]);

function parseDepartments(input) {
  const list = Array.isArray(input) ? input : (input ? [input] : []);
  const cleaned = [...new Set(list.map(d => String(d).trim().toUpperCase()).filter(Boolean))];
  const invalid = cleaned.filter(d => !VALID_DEPARTMENTS.has(d));
  return { cleaned, invalid };
}

const SAFE_SELECT = {
  id: true, name: true, email: true, role: true,
  departments: true, phone: true, station: true,
  zoneId: true, zone: { select: { id: true, name: true } },
  isActive: true, isSharedAccount: true, createdAt: true,
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
    const { name, email, password, role, departments, phone, station, zoneId, isSharedAccount } = req.body;

    if (!name?.trim())     return res.status(400).json({ error: 'Name is required.' });
    if (!email?.trim())    return res.status(400).json({ error: 'Email is required.' });
    if (!password?.trim()) return res.status(400).json({ error: 'Password is required.' });
    if (!role)             return res.status(400).json({ error: 'Role is required.' });
    if (role === 'ADMIN')  return res.status(400).json({ error: 'Cannot create admin users here.' });

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: 'A user with this email already exists.' });

    const { cleaned, invalid } = parseDepartments(departments);
    if (invalid.length) return res.status(400).json({ error: `Unknown department(s): ${invalid.join(', ')}` });

    const hashed = await bcrypt.hash(password.trim(), 10);

    const user = await prisma.user.create({
      data: {
        name:        name.trim(),
        email:       email.trim().toLowerCase(),
        password:    hashed,
        role,
        departments: role === 'LAB_TECH' ? cleaned : [],
        phone:       phone?.trim() || null,
        station:     station?.trim() || null,
        zoneId:      zoneId || null,
        isSharedAccount: !!isSharedAccount,
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
    const { name, email, password, role, departments, phone, station, zoneId, isActive, isSharedAccount } = req.body;

    // Prevent modifying other admins
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true } });
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.role === 'ADMIN') return res.status(403).json({ error: 'Cannot modify admin users.' });

    const data = {};
    if (name     !== undefined) data.name       = name.trim();
    if (email    !== undefined) data.email      = email.trim().toLowerCase();
    if (role     !== undefined && role !== 'ADMIN') data.role = role;
    if (phone    !== undefined) data.phone      = phone?.trim() || null;
    if (station  !== undefined) data.station    = station?.trim() || null;
    if (zoneId   !== undefined) data.zoneId     = zoneId || null;
    if (isActive !== undefined) data.isActive   = isActive;
    if (isSharedAccount !== undefined) data.isSharedAccount = isSharedAccount;
    if (departments !== undefined) {
      const { cleaned, invalid } = parseDepartments(departments);
      if (invalid.length) return res.status(400).json({ error: `Unknown department(s): ${invalid.join(', ')}` });
      data.departments = cleaned;
    }
    if (password?.trim()) data.password = await bcrypt.hash(password.trim(), 10);

    // Clear departments if role changed away from LAB_TECH
    if (data.role && data.role !== 'LAB_TECH') data.departments = [];

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
