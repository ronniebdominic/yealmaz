// Ye-Almaz — Staff Roles (Admin and HR Manager)
// Named job titles ("Front Office") layered on a built-in access level. A user
// on a staff role always has role = baseRole, so every existing restrict()
// check keeps working unchanged.
const express = require('express');
const { protect, restrict } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../db');

// Access levels a staff role can sit on. CLINIC is the external clinic app,
// not staff, so it's left out.
const BASE_ROLES = new Set([
  'ADMIN', 'RECEPTIONIST', 'LAB_TECH', 'DELIVERY', 'DISPATCH', 'FINANCE',
  'FINANCE_AP', 'FINANCE_CASHIER', 'INVENTORY_MANAGER', 'HR_MANAGER', 'LEADER',
]);

// HR can onboard staff and manage roles too, but only an admin can hand out
// admin access — otherwise HR could make themselves (or anyone) an admin.
const canGrant = (user, baseRole) => baseRole !== 'ADMIN' || user.role === 'ADMIN';
const ADMIN_ONLY_ERROR = 'Only an admin can create or change roles with Admin access.';

// ── GET /api/staff-roles ─────────────────────────────────
router.get('/', protect, restrict('ADMIN', 'HR_MANAGER'), async (req, res) => {
  try {
    const roles = await prisma.staffRole.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    res.json(roles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch roles.' });
  }
});

// ── POST /api/staff-roles ────────────────────────────────
router.post('/', protect, restrict('ADMIN', 'HR_MANAGER'), async (req, res) => {
  try {
    const { name, baseRole } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Role name is required.' });
    if (!BASE_ROLES.has(baseRole)) return res.status(400).json({ error: 'Pick a valid access level.' });
    if (!canGrant(req.user, baseRole)) return res.status(403).json({ error: ADMIN_ONLY_ERROR });

    const exists = await prisma.staffRole.findUnique({ where: { name: name.trim() } });
    if (exists) return res.status(409).json({ error: 'A role with this name already exists.' });

    const role = await prisma.staffRole.create({ data: { name: name.trim(), baseRole } });
    res.status(201).json({ ...role, _count: { users: 0 } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create role.' });
  }
});

// ── PATCH /api/staff-roles/:id ───────────────────────────
// Changing the access level moves everyone on this role to the new level.
// Whoever is editing can't move their own role off their current access
// level, so they can't lock themselves out.
router.patch('/:id', protect, restrict('ADMIN', 'HR_MANAGER'), async (req, res) => {
  try {
    const { name, baseRole } = req.body;
    const current = await prisma.staffRole.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Role not found.' });
    if (!canGrant(req.user, current.baseRole) || (baseRole !== undefined && !canGrant(req.user, baseRole))) {
      return res.status(403).json({ error: ADMIN_ONLY_ERROR });
    }
    const data = {};
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Role name is required.' });
      const clash = await prisma.staffRole.findFirst({ where: { name: name.trim(), id: { not: req.params.id } } });
      if (clash) return res.status(409).json({ error: 'A role with this name already exists.' });
      data.name = name.trim();
    }
    if (baseRole !== undefined) {
      if (!BASE_ROLES.has(baseRole)) return res.status(400).json({ error: 'Pick a valid access level.' });
      data.baseRole = baseRole;
    }

    if (data.baseRole && data.baseRole !== req.user.role) {
      const self = await prisma.user.findFirst({ where: { id: req.user.id, staffRoleId: req.params.id } });
      if (self) return res.status(400).json({ error: 'You are on this role — changing its access level would remove your own access.' });
    }

    const ops = [prisma.staffRole.update({ where: { id: req.params.id }, data })];
    if (data.baseRole) {
      ops.push(prisma.user.updateMany({
        where: { staffRoleId: req.params.id },
        data: { role: data.baseRole, ...(data.baseRole !== 'LAB_TECH' && { departments: [] }) },
      }));
    }
    const [role] = await prisma.$transaction(ops);
    const count = await prisma.user.count({ where: { staffRoleId: role.id } });
    res.json({ ...role, _count: { users: count } });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Role not found.' });
    console.error(err);
    res.status(500).json({ error: 'Could not update role.' });
  }
});

// ── DELETE /api/staff-roles/:id ──────────────────────────
// Only when nobody is on it, so no one silently loses their title.
router.delete('/:id', protect, restrict('ADMIN', 'HR_MANAGER'), async (req, res) => {
  try {
    const current = await prisma.staffRole.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Role not found.' });
    if (!canGrant(req.user, current.baseRole)) return res.status(403).json({ error: ADMIN_ONLY_ERROR });
    const count = await prisma.user.count({ where: { staffRoleId: req.params.id } });
    if (count) return res.status(400).json({ error: `${count} staff member${count === 1 ? ' is' : 's are'} on this role. Move them to another role first.` });
    await prisma.staffRole.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Role not found.' });
    console.error(err);
    res.status(500).json({ error: 'Could not delete role.' });
  }
});

module.exports = router;
module.exports.BASE_ROLES = BASE_ROLES;
